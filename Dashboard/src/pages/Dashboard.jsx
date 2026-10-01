import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { VintageTicket, EditorialBoxHeader } from '../components/Ornaments'
import { BarList, ColumnChart, LineChart } from '../components/Charts'
import { Badge, Empty, ErrorState, Loading } from '../components/ui'
import { api } from '../lib/api'
import { asList, useAsync } from '../lib/hooks'
import { date, int, money, moneyShort, monthLabel } from '../lib/format'
import { AGENCY_CITY } from '../config'

function Headline({ d }) {
  const t = d.today || {}
  if (!d.customers?.total) {
    return (
      <>
        <h2 style={{ fontSize: 'clamp(28px,4vw,46px)', fontWeight: 800 }}>The presses are ready. The rounds are empty.</h2>
        <p className="dek" style={{ fontFamily: 'var(--font-head)', fontStyle: 'italic', fontSize: 18, color: 'var(--ink-2)' }}>
          Add publications, delivery staff, zones and customers to begin — or load your datasets with the import script.
        </p>
      </>
    )
  }
  const lead = t.generated
    ? `${int(t.copies)} copies on today’s rounds to ${int(t.stops)} doorsteps`
    : `${int(d.copies_per_day)} copies booked across ${int(d.subscriptions_active)} active subscriptions`
  return (
    <>
      <h2 style={{ fontSize: 'clamp(28px,4vw,46px)', fontWeight: 800, letterSpacing: '-0.01em' }}>{lead}</h2>
      <p style={{ fontFamily: 'var(--font-head)', fontStyle: 'italic', fontSize: 18, color: 'var(--ink-2)', margin: '8px 0 0' }}>
        {int(d.customers.active)} active readers in {int(d.zones)} zones
        {d.on_hold_today ? `; ${int(d.on_hold_today)} away on vacation hold` : ''}
        {d.outstanding > 0 ? `. ${money(d.outstanding)} awaits collection.` : '. Every account is settled.'}
      </p>
    </>
  )
}

export default function Dashboard() {
  const { data: d, loading, error, reload } = useAsync(() => api.reports.dashboard(), [])

  if (loading) return <div className="panel"><Loading rows={10} /></div>
  if (error) return <div className="panel"><ErrorState error={error} onRetry={reload} /></div>

  const t = d.today || {}
  const now = new Date()
  const dayNum = now.getDate()
  const monthName = now.toLocaleString('en-US', { month: 'short' }).toUpperCase()

  const revenue = asList(d.revenue_by_month).map((r) => {
    const billed = Number(r.billed) || 0
    const collected = Math.min(billed, Number(r.collected) || 0)
    return { label: date(r.month, { month: 'short', year: '2-digit' }), month: r.month, billed, collected, outstanding: billed - collected }
  })
  const daily = asList(d.deliveries_by_day).map((r) => ({ label: date(r.date, { day: 'numeric', month: 'short' }), value: Number(r.copies) || 0, failed: Number(r.failed) || 0, date: r.date }))
  const mix = asList(d.publication_mix).map((p) => ({ label: p.Name, value: Number(p.copies) || 0, display: int(p.copies) }))
  const zones = asList(d.zone_load).map((z) => ({ label: z.ZoneName, value: Number(z.stops) || 0, display: `${int(z.stops)} stops` }))
  const overdue = asList(d.overdue)

  return (
    <>
      <div className="frontpage-hero-grid">
        <div className="frontpage-lead-story">
          <div className="kicker">★ Front Page Bulletin · {date(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })} ★</div>
          <Headline d={d} />
          <div className="frontpage-lead-actions">
            <Link className="btn primary" to="/deliveries"><Icon name="truck" size={14} /> Today’s route sheet</Link>
            <Link className="btn" to="/billing"><Icon name="receipt" size={14} /> Monthly Billing</Link>
            <Link className="btn" to="/customers"><Icon name="users" size={14} /> Readers</Link>
          </div>
        </div>

        <div className="frontpage-ticket-side">
          <VintageTicket
            primaryNumber={dayNum}
            primaryLabel={monthName}
            line1={AGENCY_CITY}
            line2={t.generated ? `${int(t.stops)} Active Stops` : "Morning Round Dispatch"}
            bottomHighlight={t.generated ? `${int(t.copies)} COPIES DELIVERED` : "READY · 5:30 AM"}
            badgeText="DAILY DISPATCH"
          />
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="label"><Icon name="users" size={13} /> Active readers</div>
          <div className="value">{int(d.customers?.active)}</div>
          <div className="foot">{int(d.customers?.suspended)} suspended · {int(d.customers?.total)} total</div>
        </div>
        <div className="stat">
          <div className="label"><Icon name="truck" size={13} /> Today’s deliveries</div>
          <div className="value">{t.generated ? int(t.copies) : '—'}</div>
          <div className="foot">{t.generated ? `${int(t.stops)} stops · ${int(t.failed)} failed` : 'Route sheet not generated yet'}</div>
        </div>
        <div className="stat">
          <div className="label"><Icon name="rupee" size={13} /> This month so far</div>
          <div className="value">{moneyShort(d.month_to_date_value)}</div>
          <div className="foot">value delivered at locked prices</div>
        </div>
        <div className={`stat${d.overdue_count ? ' alert' : ''}`}>
          <div className="label"><Icon name="alert" size={13} /> Outstanding</div>
          <div className="value">{moneyShort(d.outstanding)}</div>
          <div className="foot">{int(d.overdue_count)} invoice{d.overdue_count === 1 ? '' : 's'} past 60 days</div>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Billing & collections</h2>
              <div className="sub">Invoiced vs. collected, by billing month</div>
            </div>
            <Link to="/billing" className="btn sm ghost">Open ledger <Icon name="chevR" size={13} /></Link>
          </div>
          {revenue.length ? (
            <ColumnChart
              data={revenue}
              format={(v) => moneyShort(v)}
              series={[
                { key: 'collected', label: 'Collected', color: 'var(--ink)' },
                { key: 'outstanding', label: 'Outstanding', color: 'var(--accent)' },
              ]}
              tooltip={(r) => `${monthLabel(r.month, true)} — billed ${money(r.billed)}, collected ${money(r.collected)}`}
            />
          ) : (
            <Empty title="No invoices yet">Billing history appears after the first month is invoiced.</Empty>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Overdue accounts</h2>
              <div className="sub">Unpaid 60+ days — due for suspension</div>
            </div>
          </div>
          {overdue.length ? (
            <table className="data">
              <tbody>
                {overdue.map((o) => (
                  <tr key={o.InvoiceID}>
                    <td>
                      <div className="strong">{o.Name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{monthLabel(o.BillingMonth, true)} · {o.days} days</div>
                    </td>
                    <td className="right num">{money(o.balance)}</td>
                    <td className="right"><Badge>{o.Status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty title="All clear">No invoice is more than 60 days overdue.</Empty>
          )}
        </section>
      </div>

      <div className="grid-3" style={{ marginTop: 22 }}>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Copies delivered</h2>
              <div className="sub">Last 14 days</div>
            </div>
          </div>
          {daily.some((x) => x.value) ? (
            <LineChart data={daily} tooltip={(r) => `${date(r.date)} — ${int(r.value)} copies${r.failed ? `, ${r.failed} failed` : ''}`} format={(v) => int(v)} />
          ) : (
            <Empty title="No deliveries recorded">Generate a route sheet to start the log.</Empty>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Circulation by title</h2>
              <div className="sub">Active copies per day</div>
            </div>
          </div>
          {mix.length ? <BarList items={mix.slice(0, 8)} /> : <Empty title="No subscriptions">Book subscriptions to see circulation.</Empty>}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Zone load</h2>
              <div className="sub">Active stops per round</div>
            </div>
            <Link to="/routes" className="btn sm ghost">Zones <Icon name="chevR" size={13} /></Link>
          </div>
          {zones.length ? <BarList items={zones.slice(0, 8)} tone="red" /> : <Empty title="No zones">Create zones to organise rounds.</Empty>}
        </section>
      </div>
    </>
  )
}
