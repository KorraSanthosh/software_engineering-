import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { Badge, Confirm, DataTable, Empty, ErrorState, Field, Loading, Modal, PageHead, SearchBox, useToast } from '../components/ui'
import { api } from '../lib/api'
import { asList, matches, useAsync, useIndex } from '../lib/hooks'
import { date, daysBetween, isoDate } from '../lib/format'

const phase = (h, today) => {
  const s = String(h.StartDate).slice(0, 10)
  const e = String(h.EndDate).slice(0, 10)
  if (today < s) return 'Upcoming'
  if (today > e) return 'Completed'
  return 'Ongoing'
}

function HoldForm({ initial, customers, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = Boolean(initial?.HoldID)
  const [f, setF] = useState({
    CustomerID: '',
    StartDate: isoDate(),
    EndDate: '',
    ...initial,
    ...(initial?.StartDate ? { StartDate: String(initial.StartDate).slice(0, 10), EndDate: String(initial.EndDate).slice(0, 10) } : {}),
  })
  const [errs, setErrs] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const nights = f.StartDate && f.EndDate ? daysBetween(f.StartDate, f.EndDate) + 1 : null

  // End date must be strictly after start date — compute the minimum allowed end date
  const minEndDate = (() => {
    if (!f.StartDate) return ''
    const d = new Date(f.StartDate)
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })()

  // When start date changes, clear end date if it's no longer valid
  const setStartDate = (e) => {
    const newStart = e.target.value
    setF((s) => {
      const newMin = (() => {
        if (!newStart) return ''
        const d = new Date(newStart)
        d.setDate(d.getDate() + 1)
        return d.toISOString().slice(0, 10)
      })()
      return { ...s, StartDate: newStart, EndDate: s.EndDate && s.EndDate > newMin ? s.EndDate : '' }
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    const v = {}
    if (!f.CustomerID) v.CustomerID = 'Choose a customer'
    if (!f.StartDate) v.StartDate = 'Pick a start date'
    if (!f.EndDate) v.EndDate = 'Pick an end date'
    else if (f.EndDate <= f.StartDate) v.EndDate = 'End date must be after the start date'
    setErrs(v)
    if (Object.keys(v).length) return
    setBusy(true)
    try {
      const body = { CustomerID: Number(f.CustomerID), StartDate: f.StartDate, EndDate: f.EndDate }
      if (isEdit) await api.vacationHolds.update(initial.HoldID, body)
      else await api.vacationHolds.create(body)
      toast(isEdit ? 'Hold updated' : 'Hold placed — deliveries will be skipped')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      kicker={isEdit ? `Hold #${initial.HoldID}` : 'Out of station'}
      title={isEdit ? 'Edit vacation hold' : 'Place a vacation hold'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" form="hold-form" disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Save
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Deliveries are skipped for every date in the range. Subscriptions stay active, so nothing needs re-booking when the reader returns.
      </p>
      <form id="hold-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Customer" error={errs.CustomerID} span2 htmlFor="h-cust">
          <select id="h-cust" className="select" value={f.CustomerID} onChange={set('CustomerID')}>
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.CustomerID} value={c.CustomerID}>{c.Name} — #{c.CustomerID}</option>
            ))}
          </select>
        </Field>
        <Field label="From" error={errs.StartDate} htmlFor="h-start">
          <input id="h-start" className="input" type="date" value={f.StartDate} onChange={setStartDate} />
        </Field>
        <Field label="Until (inclusive)" error={errs.EndDate} hint={nights > 0 ? `${nights} day${nights === 1 ? '' : 's'} paused` : undefined} htmlFor="h-end">
          <input id="h-end" className="input" type="date" min={minEndDate} value={f.EndDate} onChange={set('EndDate')} disabled={!f.StartDate} />
        </Field>
      </form>
    </Modal>
  )
}

export default function VacationHolds() {
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(async () => {
    const [holds, customers] = await Promise.all([api.vacationHolds.list(), api.customers.list()])
    return { holds: asList(holds), customers: asList(customers) }
  }, [])
  const custIndex = useIndex(data?.customers, 'CustomerID')
  const today = isoDate()

  const [q, setQ] = useState('')
  const [ph, setPh] = useState('')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  const rows = useMemo(
    () =>
      (data?.holds || [])
        .map((h) => ({ ...h, _phase: phase(h, today) }))
        .filter((h) => (!ph || h._phase === ph) && matches(h, q, [(r) => custIndex.get(String(r.CustomerID))?.Name, 'HoldID'])),
    [data, q, ph, today, custIndex],
  )
  const ongoing = (data?.holds || []).filter((h) => phase(h, today) === 'Ongoing').length

  const doDelete = async () => {
    setBusy(true)
    try {
      await api.vacationHolds.remove(deleting.HoldID)
      toast('Hold removed — deliveries resume')
      setDeleting(null)
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    { key: 'HoldID', label: '#', width: 60, render: (r) => <span className="num muted">{r.HoldID}</span> },
    { key: 'CustomerID', label: 'Customer', sortValue: (r) => custIndex.get(String(r.CustomerID))?.Name, render: (r) => <span className="strong">{custIndex.get(String(r.CustomerID))?.Name ?? `#${r.CustomerID}`}</span> },
    { key: 'StartDate', label: 'From', render: (r) => date(r.StartDate) },
    { key: 'EndDate', label: 'Until', render: (r) => date(r.EndDate) },
    { key: '_days', label: 'Days', align: 'right', sortValue: (r) => daysBetween(r.StartDate, r.EndDate), render: (r) => <span className="num">{daysBetween(r.StartDate, r.EndDate) + 1}</span> },
    { key: '_phase', label: 'Status', render: (r) => <Badge>{r._phase}</Badge> },
    {
      key: '_a', label: '', actions: true,
      render: (r) => (
        <>
          <button className="btn ghost icon" onClick={() => setEditing(r)} aria-label="Edit hold"><Icon name="edit" size={15} /></button>
          <button className="btn ghost icon" onClick={() => setDeleting(r)} aria-label="Delete hold"><Icon name="trash" size={15} /></button>
        </>
      ),
    },
  ]

  return (
    <>
      <PageHead
        kicker="Out of Station"
        title="Vacation Holds"
        dek={data ? `${ongoing} reader${ongoing === 1 ? '' : 's'} away today. Held dates are skipped on the route sheet automatically.` : 'Pause deliveries without cancelling subscriptions.'}
      >
        <button className="btn primary" onClick={() => setEditing({})} disabled={!data}>
          <Icon name="plus" size={14} /> Place hold
        </button>
      </PageHead>

      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search customer" />
        <div className="segmented" role="group" aria-label="Filter by status">
          {['', 'Ongoing', 'Upcoming', 'Completed'].map((s) => (
            <button key={s || 'all'} className={ph === s ? 'on' : ''} onClick={() => setPh(s)}>{s || 'All'}</button>
          ))}
        </div>
      </div>

      {loading && <div className="table-wrap"><Loading /></div>}
      {error && <div className="table-wrap"><ErrorState error={error} onRetry={reload} /></div>}
      {data && (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.HoldID}
          initialSort={{ key: 'StartDate', dir: 'desc' }}
          empty={
            data.holds.length ? <Empty title="No matches">Try another filter.</Empty> : (
              <Empty title="No holds on file" action={<button className="btn primary" onClick={() => setEditing({})}><Icon name="plus" size={14} /> Place a hold</button>}>
                When a reader travels, pause their papers here.
              </Empty>
            )
          }
        />
      )}

      {editing && <HoldForm initial={editing} customers={data.customers} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
      {deleting && (
        <Confirm
          title="Remove hold?"
          message={`Deliveries to ${custIndex.get(String(deleting.CustomerID))?.Name ?? 'this customer'} will resume for ${date(deleting.StartDate)} – ${date(deleting.EndDate)}.`}
          confirmLabel="Remove hold"
          busy={busy}
          onConfirm={doDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}
