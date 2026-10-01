import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { Badge, Empty, ErrorState, Loading, PageHead, useToast } from '../components/ui'
import { api } from '../lib/api'
import { asList, useAsync, useIndex } from '../lib/hooks'
import { addDays, date, int, isoDate, money } from '../lib/format'

export default function Deliveries() {
  const toast = useToast()
  const [day, setDay] = useState(isoDate())
  const [generating, setGenerating] = useState(false)
  const [pending, setPending] = useState({}) // DeliveryID -> true while saving

  const ref = useAsync(async () => {
    const [customers, zones, persons, pubs] = await Promise.all([
      api.customers.list(), api.zones.list(), api.deliveryPersons.list(), api.publications.list(),
    ])
    return { customers: asList(customers), zones: asList(zones), persons: asList(persons), pubs: asList(pubs) }
  }, [])
  const dels = useAsync(async () => asList(await api.deliveries.list({ date: day })), [day])
  const [overrides, setOverrides] = useState({})

  const custIndex = useIndex(ref.data?.customers, 'CustomerID')
  const zoneIndex = useIndex(ref.data?.zones, 'ZoneID')
  const personIndex = useIndex(ref.data?.persons, 'DeliveryPersonID')
  const pubIndex = useIndex(ref.data?.pubs, 'PublicationID')

  const rows = useMemo(
    () => (dels.data || []).map((d) => ({ ...d, DeliveryStatus: overrides[d.DeliveryID] ?? d.DeliveryStatus })),
    [dels.data, overrides],
  )

  // Group: zone → stop (customer, ordered by RouteSequence) → items
  const routes = useMemo(() => {
    const byZone = new Map()
    rows.forEach((d) => {
      const c = custIndex.get(String(d.CustomerID))
      const zid = String(c?.ZoneID ?? 'unknown')
      if (!byZone.has(zid)) byZone.set(zid, new Map())
      const stops = byZone.get(zid)
      const k = String(d.CustomerID)
      if (!stops.has(k)) stops.set(k, { customer: c, CustomerID: d.CustomerID, items: [] })
      stops.get(k).items.push(d)
    })
    return [...byZone.entries()]
      .map(([zid, stops]) => {
        const zone = zoneIndex.get(zid)
        const list = [...stops.values()].sort((a, b) => (Number(a.customer?.RouteSequence) || 0) - (Number(b.customer?.RouteSequence) || 0))
        const items = list.flatMap((s) => s.items)
        const personId = items[0]?.DeliveryPersonID ?? zone?.DeliveryPersonID
        return {
          zid,
          zone,
          person: personIndex.get(String(personId)),
          stops: list,
          copies: items.reduce((s, d) => s + Number(d.QuantityDelivered || 0), 0),
          value: items.filter((d) => d.DeliveryStatus === 'Delivered').reduce((s, d) => s + Number(d.QuantityDelivered || 0) * Number(d.PriceAtDelivery || 0), 0),
          failed: items.filter((d) => d.DeliveryStatus === 'Failed').length,
          items,
        }
      })
      .sort((a, b) => String(a.zone?.ZoneName ?? '').localeCompare(String(b.zone?.ZoneName ?? '')))
  }, [rows, custIndex, zoneIndex, personIndex])

  const totals = useMemo(() => {
    const delivered = rows.filter((d) => d.DeliveryStatus === 'Delivered')
    return {
      stops: new Set(rows.map((d) => d.CustomerID)).size,
      copies: rows.reduce((s, d) => s + Number(d.QuantityDelivered || 0), 0),
      failed: rows.filter((d) => d.DeliveryStatus === 'Failed').length,
      value: delivered.reduce((s, d) => s + Number(d.QuantityDelivered || 0) * Number(d.PriceAtDelivery || 0), 0),
    }
  }, [rows])

  const generate = async () => {
    setGenerating(true)
    try {
      const r = await api.deliveries.generate(day)
      const total = r?.total ?? 0
      const skipped = r?.skipped_on_hold ?? 0
      toast(
        `Route sheet ready: ${total} delivery line${total === 1 ? '' : 's'}` +
          (r?.created ? ` (${r.created} new)` : '') +
          (skipped ? ` · ${skipped} customer${skipped === 1 ? '' : 's'} skipped for vacation holds` : ''),
      )
      setOverrides({})
      dels.reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setGenerating(false)
    }
  }

  const setStatus = async (items, status) => {
    const todo = items.filter((d) => d.DeliveryStatus !== status)
    if (!todo.length) return
    setPending((p) => ({ ...p, ...Object.fromEntries(todo.map((d) => [d.DeliveryID, true])) }))
    setOverrides((o) => ({ ...o, ...Object.fromEntries(todo.map((d) => [d.DeliveryID, status])) }))
    try {
      await api.deliveries.setStatus(todo.map((d) => d.DeliveryID), status)
    } catch (e) {
      setOverrides((o) => {
        const n = { ...o }
        todo.forEach((d) => delete n[d.DeliveryID])
        return n
      })
      toast(e.message, 'error')
    }
    setPending((p) => {
      const n = { ...p }
      todo.forEach((d) => delete n[d.DeliveryID])
      return n
    })
  }

  const loading = ref.loading || dels.loading
  const error = ref.error || dels.error
  const isFuture = day > isoDate()

  return (
    <>
      <PageHead kicker="The Route Sheet" title="Daily Deliveries" dek={`${date(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} — stops listed in walking order for each zone.`}>
        <div className="segmented">
          <button onClick={() => setDay(isoDate(addDays(day, -1)))} aria-label="Previous day"><Icon name="chevL" size={14} /></button>
          <button className={day === isoDate() ? 'on' : ''} onClick={() => setDay(isoDate())}>Today</button>
          <button onClick={() => setDay(isoDate(addDays(day, 1)))} aria-label="Next day"><Icon name="chevR" size={14} /></button>
        </div>
        <input className="input" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} style={{ width: 160 }} aria-label="Delivery date" />
        <button className="btn" onClick={() => window.print()} disabled={!rows.length}><Icon name="printer" size={14} /> Print</button>
        <button className="btn primary" onClick={generate} disabled={generating || loading}>
          {generating ? <span className="spinner" /> : <Icon name="refresh" size={14} />} {rows.length ? 'Regenerate' : 'Generate'} route sheet
        </button>
      </PageHead>

      {rows.length > 0 && (
        <div className="stats">
          <div className="stat"><div className="label"><Icon name="pin" size={13} /> Stops</div><div className="value">{int(totals.stops)}</div><div className="foot">{routes.length} zone{routes.length === 1 ? '' : 's'}</div></div>
          <div className="stat"><div className="label"><Icon name="paper" size={13} /> Copies</div><div className="value">{int(totals.copies)}</div><div className="foot">across all titles</div></div>
          <div className={`stat${totals.failed ? ' alert' : ''}`}><div className="label"><Icon name="alert" size={13} /> Failed</div><div className="value">{int(totals.failed)}</div><div className="foot">not billed</div></div>
          <div className="stat"><div className="label"><Icon name="rupee" size={13} /> Value</div><div className="value">{money(totals.value).replace(/\.00$/, '')}</div><div className="foot">delivered, at locked prices</div></div>
        </div>
      )}

      {loading && <div className="panel"><Loading /></div>}
      {error && <div className="panel"><ErrorState error={error} onRetry={() => { ref.reload(); dels.reload() }} /></div>}
      {!loading && !error && !rows.length && (
        <div className="panel">
          <Empty
            title="No route sheet for this date"
            action={<button className="btn primary" onClick={generate} disabled={generating}><Icon name="refresh" size={14} /> Generate route sheet</button>}
          >
            Generating builds one line per active subscription, orders stops by zone and route sequence, skips customers on vacation hold, and locks today’s cover price.
            {isFuture && ' You can prepare sheets for future dates too.'}
          </Empty>
        </div>
      )}

      {!loading && !error && routes.map((r) => (
        <section className="route" key={r.zid}>
          <div className="route-head">
            <div>
              <h3>{r.zone?.ZoneName ?? 'Unassigned zone'}</h3>
              <div className="meta">
                <Icon name="bike" size={13} style={{ verticalAlign: -2 }} /> {r.person?.Name ?? 'No delivery person'}
                {r.person?.ContactNumber && <> · <span className="mono">{r.person.ContactNumber}</span></>}
                {' · '}{r.stops.length} stops · {int(r.copies)} copies · {money(r.value)}
                {r.failed > 0 && <> · <span style={{ color: 'var(--accent)' }}>{r.failed} failed</span></>}
              </div>
            </div>
            <button className="btn sm" onClick={() => setStatus(r.items, 'Delivered')}><Icon name="check" size={13} /> Mark all delivered</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 56 }}>Stop</th>
                  <th>Customer</th>
                  <th>Publication</th>
                  <th className="right">Qty</th>
                  <th className="right">Price</th>
                  <th>Status</th>
                  <th className="right" />
                </tr>
              </thead>
              <tbody>
                {r.stops.flatMap((s) =>
                  s.items.map((d, i) => (
                    <tr key={d.DeliveryID}>
                      {i === 0 && (
                        <td rowSpan={s.items.length} style={{ verticalAlign: 'top' }}>
                          <span className="stop-no">{s.customer?.RouteSequence ?? '?'}</span>
                        </td>
                      )}
                      {i === 0 && (
                        <td rowSpan={s.items.length} style={{ verticalAlign: 'top' }}>
                          <div className="strong">{s.customer?.Name ?? `Customer #${d.CustomerID}`}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{s.customer?.Address}</div>
                        </td>
                      )}
                      <td>{pubIndex.get(String(d.PublicationID))?.Name ?? `#${d.PublicationID}`}</td>
                      <td className="right num">{d.QuantityDelivered}</td>
                      <td className="right num">{money(d.PriceAtDelivery)}</td>
                      <td><Badge>{d.DeliveryStatus}</Badge></td>
                      <td className="actions">
                        {pending[d.DeliveryID] ? (
                          <span className="spinner" />
                        ) : d.DeliveryStatus === 'Delivered' ? (
                          <button className="btn sm" onClick={() => setStatus([d], 'Failed')}><Icon name="x" size={12} /> Failed</button>
                        ) : (
                          <button className="btn sm" onClick={() => setStatus([d], 'Delivered')}><Icon name="check" size={12} /> Delivered</button>
                        )}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  )
}
