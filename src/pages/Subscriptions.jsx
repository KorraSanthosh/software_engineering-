import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { Badge, Confirm, DataTable, Empty, ErrorState, Field, Loading, Modal, PageHead, SearchBox, useToast } from '../components/ui'
import { api } from '../lib/api'
import { asList, matches, useAsync, useIndex } from '../lib/hooks'
import { addDays, date, isoDate, money } from '../lib/format'
import { SUBSCRIPTION_NOTICE_DAYS } from '../config'

function SubscriptionForm({ initial, customers, pubs, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = Boolean(initial?.SubscriptionID)
  const minDate = isoDate(addDays(new Date(), SUBSCRIPTION_NOTICE_DAYS))
  const [f, setF] = useState({
    CustomerID: '',
    PublicationID: '',
    Quantity: 1,
    EffectiveDate: minDate,
    Status: 'Active',
    ...initial,
    ...(initial?.EffectiveDate ? { EffectiveDate: String(initial.EffectiveDate).slice(0, 10) } : {}),
  })
  const [errs, setErrs] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const dateChanged = !isEdit || String(initial.EffectiveDate).slice(0, 10) !== f.EffectiveDate

  const submit = async (e) => {
    e.preventDefault()
    const v = {}
    if (!f.CustomerID) v.CustomerID = 'Choose a customer'
    if (!f.PublicationID) v.PublicationID = 'Choose a publication'
    if (!(Number(f.Quantity) >= 1)) v.Quantity = 'At least 1 copy'
    if (!f.EffectiveDate) v.EffectiveDate = 'Pick a start date'
    else if (dateChanged && f.EffectiveDate < minDate)
      v.EffectiveDate = `Changes need ${SUBSCRIPTION_NOTICE_DAYS} days’ notice — earliest ${date(minDate)}`
    setErrs(v)
    if (Object.keys(v).length) return
    setBusy(true)
    try {
      const body = {
        CustomerID: Number(f.CustomerID),
        PublicationID: Number(f.PublicationID),
        Quantity: Number(f.Quantity),
        EffectiveDate: f.EffectiveDate,
        Status: f.Status,
      }
      if (isEdit) await api.subscriptions.update(initial.SubscriptionID, body)
      else await api.subscriptions.create(body)
      toast(isEdit ? 'Subscription updated' : 'Subscription booked')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const pub = pubs.find((p) => String(p.PublicationID) === String(f.PublicationID))

  return (
    <Modal
      kicker={isEdit ? `Subscription #${initial.SubscriptionID}` : 'New order'}
      title={isEdit ? 'Change subscription' : 'Book a subscription'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" form="sub-form" disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Save
          </button>
        </>
      }
    >
      <div className="callout info">
        <strong>One-week notice rule.</strong> New subscriptions and changes take effect no earlier than {SUBSCRIPTION_NOTICE_DAYS} days from today.
      </div>
      <form id="sub-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Customer" error={errs.CustomerID} span2 htmlFor="s-cust">
          <select id="s-cust" className="select" value={f.CustomerID} onChange={set('CustomerID')} disabled={isEdit}>
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.CustomerID} value={c.CustomerID}>{c.Name} — #{c.CustomerID}</option>
            ))}
          </select>
        </Field>
        <Field label="Publication" error={errs.PublicationID} span2 htmlFor="s-pub">
          <select id="s-pub" className="select" value={f.PublicationID} onChange={set('PublicationID')}>
            <option value="">Select publication…</option>
            {pubs.map((p) => (
              <option key={p.PublicationID} value={p.PublicationID}>{p.Name} ({p.Type}) — {money(p.PricePerIssue)}</option>
            ))}
          </select>
        </Field>
        <Field label="Copies per day" error={errs.Quantity} hint={pub ? `${money(pub.PricePerIssue * (Number(f.Quantity) || 0))} per delivery day` : undefined} htmlFor="s-qty">
          <input id="s-qty" className="input" type="number" min="1" value={f.Quantity} onChange={set('Quantity')} />
        </Field>
        <Field label="Effective from" error={errs.EffectiveDate} htmlFor="s-date">
          <input id="s-date" className="input" type="date" min={dateChanged ? minDate : undefined} value={f.EffectiveDate} onChange={set('EffectiveDate')} />
        </Field>
        {isEdit && (
          <Field label="Status" htmlFor="s-status">
            <select id="s-status" className="select" value={f.Status} onChange={set('Status')}>
              <option>Active</option>
              <option>Cancelled</option>
            </select>
          </Field>
        )}
      </form>
    </Modal>
  )
}

export default function Subscriptions() {
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(async () => {
    const [subs, customers, pubs] = await Promise.all([api.subscriptions.list(), api.customers.list(), api.publications.list()])
    return { subs: asList(subs), customers: asList(customers), pubs: asList(pubs) }
  }, [])
  const custIndex = useIndex(data?.customers, 'CustomerID')
  const pubIndex = useIndex(data?.pubs, 'PublicationID')

  const [q, setQ] = useState('')
  const [pub, setPub] = useState('')
  const [status, setStatus] = useState('Active')
  const [editing, setEditing] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [busy, setBusy] = useState(false)

  const rows = useMemo(
    () =>
      (data?.subs || []).filter(
        (s) =>
          (!status || s.Status === status) &&
          (!pub || String(s.PublicationID) === pub) &&
          matches(s, q, [(r) => custIndex.get(String(r.CustomerID))?.Name, (r) => pubIndex.get(String(r.PublicationID))?.Name, 'SubscriptionID']),
      ),
    [data, q, pub, status, custIndex, pubIndex],
  )

  const dailyValue = rows
    .filter((s) => s.Status === 'Active')
    .reduce((sum, s) => sum + (Number(pubIndex.get(String(s.PublicationID))?.PricePerIssue) || 0) * (Number(s.Quantity) || 0), 0)

  const doCancel = async () => {
    setBusy(true)
    try {
      const s = cancelling
      await api.subscriptions.update(s.SubscriptionID, {
        CustomerID: s.CustomerID,
        PublicationID: s.PublicationID,
        Quantity: s.Quantity,
        EffectiveDate: String(s.EffectiveDate).slice(0, 10),
        Status: 'Cancelled',
      })
      toast('Subscription cancelled')
      setCancelling(null)
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const today = isoDate()
  const columns = [
    { key: 'SubscriptionID', label: '#', width: 60, render: (r) => <span className="num muted">{r.SubscriptionID}</span> },
    { key: 'CustomerID', label: 'Customer', sortValue: (r) => custIndex.get(String(r.CustomerID))?.Name, render: (r) => <span className="strong">{custIndex.get(String(r.CustomerID))?.Name ?? `#${r.CustomerID}`}</span> },
    { key: 'PublicationID', label: 'Publication', sortValue: (r) => pubIndex.get(String(r.PublicationID))?.Name, render: (r) => pubIndex.get(String(r.PublicationID))?.Name ?? `#${r.PublicationID}` },
    { key: 'Quantity', label: 'Copies', align: 'right', render: (r) => <span className="num">{r.Quantity}</span> },
    {
      key: 'EffectiveDate', label: 'Effective',
      render: (r) => (
        <>
          {date(r.EffectiveDate)}{' '}
          {String(r.EffectiveDate).slice(0, 10) > today && r.Status === 'Active' && <Badge tone="blue">Upcoming</Badge>}
        </>
      ),
    },
    { key: 'Status', label: 'Status', render: (r) => <Badge>{r.Status}</Badge> },
    {
      key: '_a', label: '', actions: true,
      render: (r) => (
        <>
          <button className="btn ghost icon" onClick={() => setEditing(r)} aria-label="Edit subscription"><Icon name="edit" size={15} /></button>
          {r.Status === 'Active' && (
            <button className="btn ghost icon" onClick={() => setCancelling(r)} aria-label="Cancel subscription"><Icon name="x" size={15} /></button>
          )}
        </>
      ),
    },
  ]

  return (
    <>
      <PageHead kicker="Orders" title="Subscriptions" dek="Who takes what, how many copies, and from when.">
        <button className="btn primary" onClick={() => setEditing({})} disabled={!data}>
          <Icon name="plus" size={14} /> New subscription
        </button>
      </PageHead>

      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search customer or publication" />
        <select className="select" style={{ width: 200 }} value={pub} onChange={(e) => setPub(e.target.value)} aria-label="Filter by publication">
          <option value="">All publications</option>
          {(data?.pubs || []).map((p) => (
            <option key={p.PublicationID} value={p.PublicationID}>{p.Name}</option>
          ))}
        </select>
        <div className="segmented" role="group" aria-label="Filter by status">
          {['Active', 'Cancelled', ''].map((s) => (
            <button key={s || 'all'} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s || 'All'}</button>
          ))}
        </div>
        <span className="spacer" />
        {data && <span className="muted" style={{ fontSize: 12 }}>{rows.length} shown · <span className="num">{money(dailyValue)}</span> per delivery day</span>}
      </div>

      {loading && <div className="table-wrap"><Loading /></div>}
      {error && <div className="table-wrap"><ErrorState error={error} onRetry={reload} /></div>}
      {data && (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.SubscriptionID}
          initialSort={{ key: 'CustomerID', dir: 'asc' }}
          empty={
            data.subs.length ? (
              <Empty title="No matches">Try another filter.</Empty>
            ) : (
              <Empty title="No subscriptions yet" action={<button className="btn primary" onClick={() => setEditing({})}><Icon name="plus" size={14} /> Book the first one</button>}>
                Link a customer to a publication to start deliveries.
              </Empty>
            )
          }
        />
      )}

      {editing && (
        <SubscriptionForm
          initial={editing}
          customers={data.customers}
          pubs={data.pubs}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload() }}
        />
      )}
      {cancelling && (
        <Confirm
          title="Cancel subscription?"
          message={`${custIndex.get(String(cancelling.CustomerID))?.Name ?? 'This customer'} will stop receiving ${pubIndex.get(String(cancelling.PublicationID))?.Name ?? 'this publication'}. The record is kept for billing history.`}
          confirmLabel="Cancel subscription"
          busy={busy}
          onConfirm={doCancel}
          onClose={() => setCancelling(null)}
        />
      )}
    </>
  )
}
