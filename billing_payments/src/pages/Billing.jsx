import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { Badge, DataTable, Empty, ErrorState, Loading, Modal, PageHead, SearchBox, useToast } from '../components/ui'
import { api } from '../lib/api'
import { asList, matches, useAsync, useIndex } from '../lib/hooks'
import { date, daysBetween, firstOfMonth, isoDate, money, monthLabel } from '../lib/format'
import { SUSPEND_AFTER_DAYS } from '../config'
import { PaymentForm } from './Payments'

function InvoiceDetail({ id, customer, pubIndex, onClose, onChanged }) {
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(() => api.invoices.get(id), [id])
  const [paying, setPaying] = useState(false)
  const lines = asList(data?.LineItems ?? data?.line_items ?? data?.items)
  const paid = Number(data?.AmountPaid ?? 0)
  const balance = data ? Number(data.TotalAmount || 0) - paid : 0

  const remind = async () => {
    try {
      await api.invoices.markReminder(id)
      toast('Reminder marked as sent')
      reload()
      onChanged()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  return (
    <Modal
      wide
      kicker={`Invoice #${id}`}
      title={customer?.Name ?? 'Invoice'}
      onClose={onClose}
      footer={
        data && (
          <>
            <button className="btn" onClick={() => window.print()}><Icon name="printer" size={14} /> Print</button>
            {data.PaymentStatus !== 'Paid' && !data.ReminderSent && (
              <button className="btn" onClick={remind}><Icon name="send" size={14} /> Mark reminder sent</button>
            )}
            {data.PaymentStatus !== 'Paid' && (
              <button className="btn primary" onClick={() => setPaying(true)}><Icon name="wallet" size={14} /> Record payment</button>
            )}
          </>
        )
      }
    >
      {loading && <Loading rows={5} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <>
          <dl className="dl">
            <dt>Invoice date</dt><dd>{date(data.BillingMonth)}</dd>
            <dt>Deliveries in</dt><dd>{monthLabel(data.CoversMonth, true)}</dd>
            <dt>Address</dt><dd>{customer?.Address ?? '—'}</dd>
            <dt>Status</dt>
            <dd>
              <Badge>{data.PaymentStatus}</Badge>{' '}
              {data.ReminderSent ? <Badge tone="blue">Reminder sent</Badge> : null}
            </dd>
          </dl>
          <div className="section-label"><span>Line items</span><span>{lines.length}</span></div>
          {lines.length ? (
            <table className="data">
              <thead>
                <tr><th>Publication</th><th>Type</th><th className="right">Copies</th><th className="right">Amount</th></tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const p = pubIndex.get(String(l.PublicationID))
                  return (
                    <tr key={l.LineItemID}>
                      <td className="strong">{l.PublicationName ?? p?.Name ?? `#${l.PublicationID}`}</td>
                      <td><Badge>{l.Type ?? p?.Type}</Badge></td>
                      <td className="right num">{l.TotalCopies}</td>
                      <td className="right num">{money(l.LineTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={3} className="right strong">Total</td><td className="right num strong">{money(data.TotalAmount)}</td></tr>
                {paid > 0 && <tr><td colSpan={3} className="right muted">Paid</td><td className="right num muted">− {money(paid)}</td></tr>}
                {paid > 0 && <tr><td colSpan={3} className="right strong">Balance</td><td className="right num strong">{money(balance)}</td></tr>}
              </tfoot>
            </table>
          ) : (
            <p className="muted">No line items on this invoice.</p>
          )}
        </>
      )}
      {paying && data && (
        <PaymentForm
          customers={customer ? [customer] : []}
          initial={{ CustomerID: data.CustomerID, AmountPaid: balance > 0 ? balance.toFixed(2) : '' }}
          onClose={() => setPaying(false)}
          onSaved={() => { setPaying(false); reload(); onChanged() }}
        />
      )}
    </Modal>
  )
}

export default function Billing() {
  const toast = useToast()
  const [month, setMonth] = useState(firstOfMonth().slice(0, 7))
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [viewing, setViewing] = useState(null)
  const [generating, setGenerating] = useState(false)

  const ref = useAsync(async () => {
    const [customers, pubs] = await Promise.all([api.customers.list(), api.publications.list()])
    return { customers: asList(customers), pubs: asList(pubs) }
  }, [])
  const inv = useAsync(async () => asList(await api.invoices.list({ month: month ? `${month}-01` : undefined })), [month])
  const custIndex = useIndex(ref.data?.customers, 'CustomerID')
  const pubIndex = useIndex(ref.data?.pubs, 'PublicationID')
  const today = isoDate()

  const rows = useMemo(
    () =>
      (inv.data || [])
        .map((i) => ({ ...i, _age: i.DaysOutstanding ?? daysBetween(i.IssueDate ?? i.BillingMonth, today) }))
        .filter((i) => (!status || i.PaymentStatus === status) && matches(i, q, [(r) => custIndex.get(String(r.CustomerID))?.Name, 'InvoiceID'])),
    [inv.data, status, q, custIndex, today],
  )

  const sums = useMemo(() => {
    const all = inv.data || []
    const billed = all.reduce((s, i) => s + Number(i.TotalAmount || 0), 0)
    const open = all.filter((i) => i.PaymentStatus !== 'Paid')
    const outstanding = open.reduce((s, i) => s + Number(i.TotalAmount || 0) - Number(i.AmountPaid || 0), 0)
    return { count: all.length, billed, outstanding, open: open.length }
  }, [inv.data])

  const generate = async () => {
    if (!month) return
    setGenerating(true)
    try {
      const r = await api.invoices.generate(`${month}-01`)
      const parts = []
      if (r?.created) parts.push(`${r.created} new`)
      if (r?.updated) parts.push(`${r.updated} recalculated`)
      toast(
        parts.length
          ? `Invoices dated ${date(`${month}-01`)} for ${monthLabel(r.covers, true)}: ${parts.join(', ')}`
          : `No delivered copies in ${monthLabel(r?.covers, true)} — nothing to bill`,
      )
      inv.reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setGenerating(false)
    }
  }

  const columns = [
    { key: 'InvoiceID', label: '#', width: 70, render: (r) => <span className="num muted">{r.InvoiceID}</span> },
    { key: 'CustomerID', label: 'Customer', sortValue: (r) => custIndex.get(String(r.CustomerID))?.Name, render: (r) => <span className="strong">{custIndex.get(String(r.CustomerID))?.Name ?? `#${r.CustomerID}`}</span> },
    { key: 'BillingMonth', label: 'Invoice', render: (r) => <>{monthLabel(r.BillingMonth)} <span className="muted" style={{ fontSize: 12 }}>· for {date(r.CoversMonth, { month: 'short' })}</span></> },
    { key: 'TotalAmount', label: 'Amount', align: 'right', render: (r) => <span className="num">{money(r.TotalAmount)}</span> },
    { key: 'AmountPaid', label: 'Paid', align: 'right', render: (r) => <span className="num muted">{r.AmountPaid != null ? money(r.AmountPaid) : '—'}</span> },
    {
      key: 'PaymentStatus', label: 'Status',
      render: (r) => (
        <>
          <Badge>{r.PaymentStatus}</Badge>{' '}
          {r.PaymentStatus !== 'Paid' && r._age > SUSPEND_AFTER_DAYS && <Badge tone="red">{r._age}d overdue</Badge>}
        </>
      ),
    },
    { key: 'ReminderSent', label: 'Reminder', render: (r) => (r.ReminderSent ? <Icon name="check" size={15} title="Reminder sent" /> : <span className="muted">—</span>) },
  ]

  const loading = ref.loading || inv.loading
  const error = ref.error || inv.error

  return (
    <>
      <PageHead kicker="Accounts" title="Monthly Billing" dek="Invoices are dated the 1st of each month and bill the previous month’s delivered copies, at the prices locked on each delivery day.">
        <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 170 }} aria-label="Invoice month" title="Invoices are dated the 1st of this month and bill the month before" />
        <button className="btn primary" onClick={generate} disabled={generating || !month}>
          {generating ? <span className="spinner" /> : <Icon name="receipt" size={14} />} Generate invoices
        </button>
      </PageHead>

      <div className="stats">
        <div className="stat"><div className="label">Invoices</div><div className="value">{sums.count}</div><div className="foot">{month ? `dated ${date(`${month}-01`, { day: 'numeric', month: 'short' })} · for ${monthLabel(isoDate(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)), true)}` : 'all months'}</div></div>
        <div className="stat"><div className="label">Billed</div><div className="value">{money(sums.billed).replace(/\.00$/, '')}</div><div className="foot">total value</div></div>
        <div className={`stat${sums.outstanding > 0 ? ' alert' : ''}`}><div className="label">Outstanding</div><div className="value">{money(sums.outstanding).replace(/\.00$/, '')}</div><div className="foot">{sums.open} open invoice{sums.open === 1 ? '' : 's'}</div></div>
        <div className="stat"><div className="label">Collected</div><div className="value">{sums.billed ? `${Math.round(((sums.billed - sums.outstanding) / sums.billed) * 100)}%` : '—'}</div><div className="foot">of billed value</div></div>
      </div>

      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search customer or invoice #" />
        <div className="segmented" role="group" aria-label="Filter by status">
          {['', 'Unpaid', 'Partial', 'Paid'].map((s) => (
            <button key={s || 'all'} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s || 'All'}</button>
          ))}
        </div>
        <span className="spacer" />
        <button className="btn sm ghost" onClick={() => setMonth('')}>Show all months</button>
      </div>

      {loading && <div className="table-wrap"><Loading /></div>}
      {error && <div className="table-wrap"><ErrorState error={error} onRetry={() => { ref.reload(); inv.reload() }} /></div>}
      {!loading && !error && (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.InvoiceID}
          onRowClick={(r) => setViewing(r)}
          initialSort={{ key: 'CustomerID', dir: 'asc' }}
          empty={
            inv.data?.length ? <Empty title="No matches">Try another filter.</Empty> : (
              <Empty title="No invoices for this month" action={month && <button className="btn primary" onClick={generate} disabled={generating}><Icon name="receipt" size={14} /> Generate invoices</button>}>
                Generating bills every customer for the previous month’s delivered copies. Re-running recalculates instead of duplicating.
              </Empty>
            )
          }
        />
      )}

      {viewing && (
        <InvoiceDetail
          id={viewing.InvoiceID}
          customer={custIndex.get(String(viewing.CustomerID))}
          pubIndex={pubIndex}
          onClose={() => setViewing(null)}
          onChanged={inv.reload}
        />
      )}
    </>
  )
}
