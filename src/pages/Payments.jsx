import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { Badge, Confirm, DataTable, Empty, ErrorState, Field, Loading, Modal, PageHead, SearchBox, useToast } from '../components/ui'
import { api } from '../lib/api'
import { asList, matches, useAsync, useIndex } from '../lib/hooks'
import { date, isoDate, money } from '../lib/format'

export function PaymentForm({ customers, initial, onClose, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState({ CustomerID: '', AmountPaid: '', PaymentDate: isoDate(), Method: 'Cash', ReferenceNumber: '', ...initial })
  const [errs, setErrs] = useState({})
  const [busy, setBusy] = useState(false)
  const [invoices, setInvoices] = useState([])
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  // Fetch outstanding invoices whenever customer selection changes
  useEffect(() => {
    if (!f.CustomerID) { setInvoices([]); return }
    api.invoices.list({ customer_id: Number(f.CustomerID) })
      .then((data) => setInvoices(asList(data).filter((i) => i.PaymentStatus !== 'Paid')))
      .catch(() => setInvoices([]))
  }, [f.CustomerID])

  // Total outstanding due for the selected customer
  const totalDue = invoices.reduce((s, i) => s + Number(i.Balance ?? (Number(i.TotalAmount || 0) - Number(i.AmountPaid || 0))), 0)
  const hasDue = totalDue > 0.004

  const submit = async (e) => {
    e.preventDefault()
    const v = {}
    if (!f.CustomerID) v.CustomerID = 'Choose a customer'
    const amt = Number(f.AmountPaid)
    if (!(amt > 0)) v.AmountPaid = 'Enter an amount above 0'
    else if (hasDue && amt > totalDue + 0.004) v.AmountPaid = `Amount exceeds the outstanding due of ${money(totalDue)}`
    if (!f.PaymentDate) v.PaymentDate = 'Pick a date'
    if (f.Method === 'Cheque' && !String(f.ReferenceNumber).trim()) v.ReferenceNumber = 'Cheque number is required'
    setErrs(v)
    if (Object.keys(v).length) return
    setBusy(true)
    try {
      const r = await api.payments.create({
        CustomerID: Number(f.CustomerID),
        AmountPaid: Math.round(amt * 100) / 100,
        PaymentDate: f.PaymentDate,
        Method: f.Method,
        ReferenceNumber: String(f.ReferenceNumber).trim() || null,
      })
      toast(r?.CustomerReactivated ? 'Payment recorded — dues cleared, customer reactivated' : 'Payment recorded — receipt logged')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      kicker="Receipt"
      title="Record a payment"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" form="pay-form" disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Record</button>
        </>
      }
    >
      <form id="pay-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Customer" error={errs.CustomerID} span2 htmlFor="pay-cust">
          <select id="pay-cust" className="select" value={f.CustomerID} onChange={set('CustomerID')} disabled={customers.length === 1 && Boolean(initial?.CustomerID)}>
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.CustomerID} value={c.CustomerID}>{c.Name} — #{c.CustomerID}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Amount (₹)"
          error={errs.AmountPaid}
          hint={
            f.CustomerID
              ? hasDue
                ? `Outstanding due: ${money(totalDue)} — applied to oldest invoices first`
                : 'No outstanding dues for this customer'
              : 'Applied to the oldest open invoices first'
          }
          htmlFor="pay-amt"
        >
          <input
            id="pay-amt"
            className="input"
            type="number"
            min="0"
            max={hasDue ? totalDue.toFixed(2) : undefined}
            step="0.01"
            value={f.AmountPaid}
            onChange={set('AmountPaid')}
            autoFocus
          />
        </Field>
        <Field label="Date received" error={errs.PaymentDate} htmlFor="pay-date">
          <input id="pay-date" className="input" type="date" max={isoDate()} value={f.PaymentDate} onChange={set('PaymentDate')} />
        </Field>
        <Field label="Method" htmlFor="pay-method">
          <select id="pay-method" className="select" value={f.Method} onChange={set('Method')}>
            <option>Cash</option>
            <option>Cheque</option>
          </select>
        </Field>
        <Field label={f.Method === 'Cheque' ? 'Cheque number' : 'Receipt / reference no.'} error={errs.ReferenceNumber} htmlFor="pay-ref">
          <input id="pay-ref" className="input" value={f.ReferenceNumber ?? ''} onChange={set('ReferenceNumber')} maxLength={50} />
        </Field>
      </form>
    </Modal>
  )
}

export default function Payments() {
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(async () => {
    const [payments, customers] = await Promise.all([api.payments.list(), api.customers.list()])
    return { payments: asList(payments), customers: asList(customers) }
  }, [])
  const custIndex = useIndex(data?.customers, 'CustomerID')
  const [q, setQ] = useState('')
  const [method, setMethod] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  const rows = useMemo(
    () =>
      (data?.payments || []).filter(
        (p) => (!method || p.Method === method) && matches(p, q, [(r) => custIndex.get(String(r.CustomerID))?.Name, 'ReferenceNumber', 'PaymentID']),
      ),
    [data, q, method, custIndex],
  )
  const total = rows.reduce((s, p) => s + Number(p.AmountPaid || 0), 0)
  const thisMonth = isoDate().slice(0, 7)
  const monthTotal = (data?.payments || []).filter((p) => String(p.PaymentDate).slice(0, 7) === thisMonth).reduce((s, p) => s + Number(p.AmountPaid || 0), 0)

  const doDelete = async () => {
    setBusy(true)
    try {
      await api.payments.remove(deleting.PaymentID)
      toast('Payment reversed')
      setDeleting(null)
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    { key: 'PaymentID', label: 'Receipt #', width: 90, render: (r) => <span className="num muted">{r.PaymentID}</span> },
    { key: 'PaymentDate', label: 'Date', render: (r) => date(r.PaymentDate) },
    { key: 'CustomerID', label: 'Customer', sortValue: (r) => custIndex.get(String(r.CustomerID))?.Name, render: (r) => <span className="strong">{custIndex.get(String(r.CustomerID))?.Name ?? `#${r.CustomerID}`}</span> },
    { key: 'Method', label: 'Method', render: (r) => <Badge>{r.Method}</Badge> },
    { key: 'ReferenceNumber', label: 'Reference', render: (r) => <span className="mono">{r.ReferenceNumber || '—'}</span> },
    { key: 'AmountPaid', label: 'Amount', align: 'right', render: (r) => <span className="num strong">{money(r.AmountPaid)}</span> },
    {
      key: '_a', label: '', actions: true,
      render: (r) => <button className="btn ghost icon" onClick={() => setDeleting(r)} aria-label="Reverse payment"><Icon name="trash" size={15} /></button>,
    },
  ]

  return (
    <>
      <PageHead
        kicker="Receipts"
        title="Payments"
        dek={data ? `${money(monthTotal)} collected so far this month.` : 'Every rupee received, cash or cheque.'}
      >
        <button className="btn primary" onClick={() => setAdding(true)} disabled={!data}>
          <Icon name="plus" size={14} /> Record payment
        </button>
      </PageHead>

      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search customer or reference" />
        <div className="segmented" role="group" aria-label="Filter by method">
          {['', 'Cash', 'Cheque'].map((m) => (
            <button key={m || 'all'} className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>{m || 'All'}</button>
          ))}
        </div>
        <span className="spacer" />
        {data && <span className="muted" style={{ fontSize: 12 }}>{rows.length} receipts · <span className="num">{money(total)}</span></span>}
      </div>

      {loading && <div className="table-wrap"><Loading /></div>}
      {error && <div className="table-wrap"><ErrorState error={error} onRetry={reload} /></div>}
      {data && (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.PaymentID}
          initialSort={{ key: 'PaymentDate', dir: 'desc' }}
          empty={
            data.payments.length ? <Empty title="No matches">Try another search.</Empty> : (
              <Empty title="No payments yet" action={<button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Record a payment</button>}>
                Payments settle the oldest open invoices first.
              </Empty>
            )
          }
        />
      )}

      {adding && <PaymentForm customers={data.customers} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload() }} />}
      {deleting && (
        <Confirm
          title="Reverse payment?"
          message={`Receipt #${deleting.PaymentID} for ${money(deleting.AmountPaid)} will be deleted and invoice balances recalculated.`}
          confirmLabel="Reverse"
          busy={busy}
          onConfirm={doDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}
