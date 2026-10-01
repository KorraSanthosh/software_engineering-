import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import {
  Badge, Confirm, DataTable, Drawer, Empty, ErrorState, Field, Loading, Modal, PageHead, SearchBox, useToast,
} from '../components/ui'
import { api } from '../lib/api'
import { asList, matches, useAsync, useIndex } from '../lib/hooks'
import { date, money } from '../lib/format'

const EMPTY = { Name: '', Address: '', ZoneID: '', RouteSequence: '', Status: 'Active' }

function CustomerForm({ initial, zones, customers, onClose, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState(() => ({ ...EMPTY, ...initial }))
  const [busy, setBusy] = useState(false)
  const [errs, setErrs] = useState({})
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const isEdit = Boolean(initial?.CustomerID)

  // Suggest next stop number in the chosen zone
  const nextSeq = useMemo(() => {
    if (!f.ZoneID) return ''
    const seqs = customers.filter((c) => String(c.ZoneID) === String(f.ZoneID)).map((c) => Number(c.RouteSequence) || 0)
    return seqs.length ? Math.max(...seqs) + 1 : 1
  }, [f.ZoneID, customers])

  const submit = async (e) => {
    e.preventDefault()
    const v = {}
    if (!f.Name.trim()) v.Name = 'Name is required'
    if (!f.Address.trim()) v.Address = 'Address is required'
    if (!f.ZoneID) v.ZoneID = 'Choose a zone'
    const seq = f.RouteSequence === '' ? nextSeq : Number(f.RouteSequence)
    if (!seq || seq < 1) v.RouteSequence = 'Stop number must be 1 or more'
    setErrs(v)
    if (Object.keys(v).length) return
    const body = { Name: f.Name.trim(), Address: f.Address.trim(), ZoneID: Number(f.ZoneID), RouteSequence: seq, Status: f.Status }
    setBusy(true)
    try {
      if (isEdit) await api.customers.update(initial.CustomerID, body)
      else await api.customers.create(body)
      toast(isEdit ? 'Customer updated' : 'Customer added')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      kicker={isEdit ? `Customer #${initial.CustomerID}` : 'New reader'}
      title={isEdit ? 'Edit customer' : 'Add a customer'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} type="button">Cancel</button>
          <button className="btn primary" form="cust-form" disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Save
          </button>
        </>
      }
    >
      <form id="cust-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Full name" error={errs.Name} span2 htmlFor="c-name">
          <input id="c-name" className="input" value={f.Name} onChange={set('Name')} autoFocus maxLength={100} />
        </Field>
        <Field label="Delivery address" error={errs.Address} span2 htmlFor="c-addr">
          <textarea id="c-addr" className="textarea" value={f.Address} onChange={set('Address')} />
        </Field>
        <Field label="Zone" error={errs.ZoneID} htmlFor="c-zone">
          <select id="c-zone" className="select" value={f.ZoneID} onChange={set('ZoneID')}>
            <option value="">Select zone…</option>
            {zones.map((z) => (
              <option key={z.ZoneID} value={z.ZoneID}>{z.ZoneName}</option>
            ))}
          </select>
        </Field>
        <Field label="Route stop #" error={errs.RouteSequence} hint={nextSeq && !f.RouteSequence ? `Next free stop: ${nextSeq}` : 'Order on the delivery route'} htmlFor="c-seq">
          <input id="c-seq" className="input" type="number" min="1" value={f.RouteSequence} placeholder={nextSeq ? String(nextSeq) : ''} onChange={set('RouteSequence')} />
        </Field>
        <Field label="Status" htmlFor="c-status">
          <select id="c-status" className="select" value={f.Status} onChange={set('Status')}>
            <option>Active</option>
            <option>Suspended</option>
          </select>
        </Field>
      </form>
    </Modal>
  )
}

function CustomerDetail({ customer, zone, pubIndex, onClose, onEdit }) {
  const id = customer.CustomerID
  const byCust = (rows) => asList(rows).filter((r) => String(r.CustomerID) === String(id))
  const { data, loading, error, reload } = useAsync(async () => {
    const [subs, holds, invoices, payments] = await Promise.all([
      api.subscriptions.list({ customer_id: id }),
      api.vacationHolds.list({ customer_id: id }),
      api.invoices.list({ customer_id: id }),
      api.payments.list({ customer_id: id }),
    ])
    return { subs: byCust(subs), holds: byCust(holds), invoices: byCust(invoices), payments: byCust(payments) }
  }, [id])

  const due = data?.invoices.filter((i) => i.PaymentStatus !== 'Paid').reduce((s, i) => s + Number(i.Balance ?? i.TotalAmount ?? 0), 0) || 0
  const paid = data?.payments.reduce((s, p) => s + Number(p.AmountPaid || 0), 0) || 0

  return (
    <Drawer
      kicker={`Customer #${id}`}
      title={customer.Name}
      onClose={onClose}
      actions={<button className="btn sm" onClick={onEdit}><Icon name="edit" size={13} /> Edit</button>}
    >
      <dl className="dl">
        <dt>Status</dt><dd><Badge>{customer.Status}</Badge></dd>
        <dt>Address</dt><dd>{customer.Address}</dd>
        <dt>Zone</dt><dd>{zone?.ZoneName ?? `Zone ${customer.ZoneID}`}</dd>
        <dt>Route stop</dt><dd className="num">#{customer.RouteSequence}</dd>
      </dl>

      {loading && <Loading rows={5} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <>
          <div className="section-label"><span>Subscriptions</span><span>{data.subs.length}</span></div>
          {data.subs.length ? (
            <table className="data">
              <tbody>
                {data.subs.map((s) => (
                  <tr key={s.SubscriptionID}>
                    <td className="strong">{pubIndex.get(String(s.PublicationID))?.Name ?? `#${s.PublicationID}`}</td>
                    <td className="num">× {s.Quantity}</td>
                    <td className="muted">from {date(s.EffectiveDate)}</td>
                    <td className="right"><Badge>{s.Status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">No subscriptions.</p>}

          <div className="section-label"><span>Vacation holds</span><span>{data.holds.length}</span></div>
          {data.holds.length ? (
            <div className="chip-row">
              {data.holds.map((h) => (
                <span className="chip" key={h.HoldID}>{date(h.StartDate)} → {date(h.EndDate)}</span>
              ))}
            </div>
          ) : <p className="muted">No holds.</p>}

          <div className="section-label"><span>Account</span><span className="num">{money(due)} due</span></div>
          {data.invoices.length ? (
            <table className="data">
              <tbody>
                {data.invoices.slice(0, 12).map((i) => (
                  <tr key={i.InvoiceID}>
                    <td>{date(i.BillingMonth, { month: 'short', year: 'numeric' })}</td>
                    <td className="right num">{money(i.TotalAmount)}</td>
                    <td className="right"><Badge>{i.PaymentStatus}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">No invoices yet.</p>}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            {data.payments.length} payment{data.payments.length === 1 ? '' : 's'} received · {money(paid)} total
          </p>
        </>
      )}
    </Drawer>
  )
}

export default function Customers() {
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(async () => {
    const [customers, zones, pubs] = await Promise.all([api.customers.list(), api.zones.list(), api.publications.list()])
    return { customers: asList(customers), zones: asList(zones), pubs: asList(pubs) }
  }, [])
  const zoneIndex = useIndex(data?.zones, 'ZoneID')
  const pubIndex = useIndex(data?.pubs, 'PublicationID')

  const [q, setQ] = useState('')
  const [zone, setZone] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  const rows = useMemo(
    () =>
      (data?.customers || []).filter(
        (c) =>
          (!zone || String(c.ZoneID) === zone) &&
          (!status || c.Status === status) &&
          matches(c, q, ['Name', 'Address', 'CustomerID']),
      ),
    [data, q, zone, status],
  )

  const counts = useMemo(() => {
    const all = data?.customers || []
    return { total: all.length, active: all.filter((c) => c.Status === 'Active').length, suspended: all.filter((c) => c.Status === 'Suspended').length }
  }, [data])

  const doDelete = async () => {
    setBusy(true)
    try {
      await api.customers.remove(deleting.CustomerID)
      toast('Customer removed')
      setDeleting(null)
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const runSuspend = async () => {
    try {
      const r = await api.customers.autoSuspend()
      const n = r?.accounts_suspended ?? 0
      const m = r?.reminders_flagged ?? 0
      toast(`${n} customer${n === 1 ? '' : 's'} suspended (dues over 60 days) · ${m} reminder${m === 1 ? '' : 's'} flagged (over 30 days)`)
      reload()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  const columns = [
    { key: 'CustomerID', label: '#', width: 60, render: (r) => <span className="num muted">{r.CustomerID}</span> },
    { key: 'Name', label: 'Name', render: (r) => <span className="strong">{r.Name}</span> },
    { key: 'Address', label: 'Address', render: (r) => <span className="muted">{r.Address}</span> },
    { key: 'ZoneID', label: 'Zone', sortValue: (r) => zoneIndex.get(String(r.ZoneID))?.ZoneName, render: (r) => zoneIndex.get(String(r.ZoneID))?.ZoneName ?? r.ZoneID },
    { key: 'RouteSequence', label: 'Stop', align: 'right', render: (r) => <span className="num">{r.RouteSequence}</span> },
    { key: 'Status', label: 'Status', render: (r) => <Badge>{r.Status}</Badge> },
    {
      key: '_a', label: '', actions: true,
      render: (r) => (
        <>
          <button className="btn ghost icon" onClick={() => setEditing(r)} aria-label={`Edit ${r.Name}`}><Icon name="edit" size={15} /></button>
          <button className="btn ghost icon" onClick={() => setDeleting(r)} aria-label={`Delete ${r.Name}`}><Icon name="trash" size={15} /></button>
        </>
      ),
    },
  ]

  return (
    <>
      <PageHead
        kicker="Circulation"
        title="Customers"
        dek={data ? `${counts.total} readers on the books · ${counts.active} active · ${counts.suspended} suspended` : 'Every household and office on the delivery rounds.'}
      >
        <button className="btn" onClick={runSuspend} title="Flag reminders on invoices unpaid 30+ days and suspend customers unpaid 60+ days">
          <Icon name="alert" size={14} /> Process overdues
        </button>
        <button className="btn primary" onClick={() => setEditing({})} disabled={!data}>
          <Icon name="plus" size={14} /> Add customer
        </button>
      </PageHead>

      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search name, address or ID" />
        <select className="select" style={{ width: 180 }} value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Filter by zone">
          <option value="">All zones</option>
          {(data?.zones || []).map((z) => (
            <option key={z.ZoneID} value={z.ZoneID}>{z.ZoneName}</option>
          ))}
        </select>
        <div className="segmented" role="group" aria-label="Filter by status">
          {['', 'Active', 'Suspended'].map((s) => (
            <button key={s || 'all'} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s || 'All'}</button>
          ))}
        </div>
      </div>

      {loading && <div className="table-wrap"><Loading /></div>}
      {error && <div className="table-wrap"><ErrorState error={error} onRetry={reload} /></div>}
      {data && (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.CustomerID}
          onRowClick={setViewing}
          initialSort={{ key: 'Name', dir: 'asc' }}
          empty={
            data.customers.length ? (
              <Empty title="No matches">Try a different search or clear the filters.</Empty>
            ) : (
              <Empty title="No customers yet" action={<button className="btn primary" onClick={() => setEditing({})}><Icon name="plus" size={14} /> Add the first customer</button>}>
                Add a zone first, then start adding readers to it.
              </Empty>
            )
          }
        />
      )}

      {editing && (
        <CustomerForm
          initial={editing}
          zones={data.zones}
          customers={data.customers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setViewing(null)
            reload()
          }}
        />
      )}
      {viewing && !editing && (
        <CustomerDetail
          customer={viewing}
          zone={zoneIndex.get(String(viewing.ZoneID))}
          pubIndex={pubIndex}
          onClose={() => setViewing(null)}
          onEdit={() => setEditing(viewing)}
        />
      )}
      {deleting && (
        <Confirm
          title="Remove customer?"
          message={`${deleting.Name} and their records will be removed. If they’re just away, add a vacation hold instead.`}
          confirmLabel="Remove"
          busy={busy}
          onConfirm={doDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}
