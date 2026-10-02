import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { Confirm, DataTable, Empty, ErrorState, Field, Loading, Modal, PageHead, useToast } from '../components/ui'
import { api } from '../lib/api'
import { asList, useAsync, useIndex } from '../lib/hooks'
import { firstOfMonth, int, money, monthLabel } from '../lib/format'

// CommissionRate is stored as a percentage (DECIMAL(5,2), default 2.50 = 2.5%)
const pctOf = (v) => (v == null ? '—' : `${Number(v).toFixed(2)}%`)
import { DEFAULT_COMMISSION_RATE } from '../config'

/* ------------------------------ forms ------------------------------ */
function PersonForm({ initial, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = Boolean(initial?.DeliveryPersonID)
  const [f, setF] = useState({
    Name: '',
    ContactNumber: '',
    ...initial,
    // UI edits the rate as a percentage
    CommissionPct: initial?.CommissionRate != null ? String(+Number(initial.CommissionRate).toFixed(2)) : String(DEFAULT_COMMISSION_RATE),
  })
  const [errs, setErrs] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    const v = {}
    if (!String(f.Name).trim()) v.Name = 'Name is required'
    if (!/^\d{10}$/.test(String(f.ContactNumber).trim())) v.ContactNumber = 'Enter a valid 10-digit phone number'
    const p = Number(f.CommissionPct)
    if (isNaN(p) || p < 0 || p > 100) v.CommissionPct = 'Between 0 and 100'
    setErrs(v)
    if (Object.keys(v).length) return
    setBusy(true)
    try {
      const body = { Name: f.Name.trim(), ContactNumber: String(f.ContactNumber).trim(), CommissionRate: Math.round(p * 100) / 100 }
      if (isEdit) await api.deliveryPersons.update(initial.DeliveryPersonID, body)
      else await api.deliveryPersons.create(body)
      toast(isEdit ? 'Delivery person updated' : 'Delivery person added')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      kicker={isEdit ? `Staff #${initial.DeliveryPersonID}` : 'New hire'}
      title={isEdit ? 'Edit delivery person' : 'Add delivery person'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" form="dp-form" disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Save</button>
        </>
      }
    >
      <form id="dp-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Name" error={errs.Name} span2 htmlFor="dp-name">
          <input id="dp-name" className="input" value={f.Name} onChange={set('Name')} autoFocus maxLength={100} />
        </Field>
        <Field label="Contact number" error={errs.ContactNumber} hint="Enter 10-digit mobile number" htmlFor="dp-phone">
          <input id="dp-phone" className="input" type="tel" value={f.ContactNumber} onChange={set('ContactNumber')} maxLength={10} pattern="\d{10}" inputMode="numeric" />
        </Field>
        <Field label="Commission (%)" error={errs.CommissionPct} hint="Of the value of papers delivered. Default 2.5%" htmlFor="dp-rate">
          <input id="dp-rate" className="input" type="number" step="0.01" min="0" max="100" value={f.CommissionPct} onChange={set('CommissionPct')} />
        </Field>
      </form>
    </Modal>
  )
}

function ZoneForm({ initial, persons, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = Boolean(initial?.ZoneID)
  const [f, setF] = useState({ ZoneName: '', DeliveryPersonID: '', ...initial })
  const [errs, setErrs] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    const v = {}
    if (!String(f.ZoneName).trim()) v.ZoneName = 'Zone name is required'
    if (!f.DeliveryPersonID) v.DeliveryPersonID = 'Assign a delivery person'
    setErrs(v)
    if (Object.keys(v).length) return
    setBusy(true)
    try {
      const body = { ZoneName: f.ZoneName.trim(), DeliveryPersonID: Number(f.DeliveryPersonID) }
      if (isEdit) await api.zones.update(initial.ZoneID, body)
      else await api.zones.create(body)
      toast(isEdit ? 'Zone updated' : 'Zone created')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      kicker={isEdit ? `Zone #${initial.ZoneID}` : 'New round'}
      title={isEdit ? 'Edit zone' : 'Create a zone'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" form="zone-form" disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Save</button>
        </>
      }
    >
      <form id="zone-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Zone name" error={errs.ZoneName} span2 htmlFor="z-name">
          <input id="z-name" className="input" value={f.ZoneName} onChange={set('ZoneName')} autoFocus maxLength={100} />
        </Field>
        <Field label="Delivery person" error={errs.DeliveryPersonID} span2 hint="Each zone is covered by one delivery person" htmlFor="z-dp">
          <select id="z-dp" className="select" value={f.DeliveryPersonID ?? ''} onChange={set('DeliveryPersonID')}>
            <option value="">Select…</option>
            {persons.map((p) => (
              <option key={p.DeliveryPersonID} value={p.DeliveryPersonID}>{p.Name}</option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  )
}

/* --------------------------- commission --------------------------- */
function Commission({ persons }) {
  const [month, setMonth] = useState(firstOfMonth().slice(0, 7))
  const { data, loading, error, reload } = useAsync(() => api.reports.commission(`${month}-01`), [month])
  const personIndex = useIndex(persons, 'DeliveryPersonID')
  const rows = asList(data).map((r) => ({ ...r, Name: r.Name ?? personIndex.get(String(r.DeliveryPersonID))?.Name }))
  const total = rows.reduce((s, r) => s + Number(r.Commission || 0), 0)

  return (
    <section className="panel" style={{ marginTop: 22 }}>
      <div className="panel-head">
        <div>
          <h2>Commission statement</h2>
          <div className="sub">SUM(copies delivered × price at delivery) × commission rate — delivered stops only</div>
        </div>
        <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 170 }} aria-label="Month" />
      </div>
      {loading && <Loading rows={4} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <DataTable
          flat
          rows={rows}
          rowKey={(r) => r.DeliveryPersonID}
          initialSort={{ key: 'Commission', dir: 'desc' }}
          empty={<Empty title={`No deliveries in ${monthLabel(`${month}-01`, true)}`}>Commission appears once deliveries are marked delivered.</Empty>}
          columns={[
            { key: 'Name', label: 'Delivery person', render: (r) => <span className="strong">{r.Name ?? `#${r.DeliveryPersonID}`}</span> },
            { key: 'Deliveries', label: 'Stops delivered', align: 'right', render: (r) => <span className="num">{int(r.Deliveries)}</span> },
            { key: 'Copies', label: 'Copies', align: 'right', render: (r) => <span className="num">{int(r.Copies)}</span> },
            { key: 'GrossValue', label: 'Value delivered', align: 'right', render: (r) => <span className="num">{money(r.GrossValue)}</span> },
            { key: 'CommissionRate', label: 'Rate', align: 'right', render: (r) => <span className="num">{pctOf(r.CommissionRate)}</span> },
            { key: 'Commission', label: 'Commission', align: 'right', render: (r) => <span className="num strong">{money(r.Commission)}</span> },
          ]}
        />
      )}
      {rows.length > 0 && (
        <div style={{ textAlign: 'right', marginTop: 10, fontWeight: 700 }}>
          Total payable: <span className="num">{money(total)}</span>
        </div>
      )}
    </section>
  )
}

/* ------------------------------ page ------------------------------ */
export default function RoutesAndStaff() {
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(async () => {
    const [zones, persons, customers] = await Promise.all([api.zones.list(), api.deliveryPersons.list(), api.customers.list()])
    return { zones: asList(zones), persons: asList(persons), customers: asList(customers) }
  }, [])
  const personIndex = useIndex(data?.persons, 'DeliveryPersonID')
  const [editPerson, setEditPerson] = useState(null)
  const [editZone, setEditZone] = useState(null)
  const [deleting, setDeleting] = useState(null) // { kind, row }
  const [busy, setBusy] = useState(false)

  const zoneStats = useMemo(() => {
    const m = new Map()
    ;(data?.customers || []).forEach((c) => {
      const k = String(c.ZoneID)
      const cur = m.get(k) || { total: 0, active: 0 }
      cur.total++
      if (c.Status === 'Active') cur.active++
      m.set(k, cur)
    })
    return m
  }, [data])

  const zonesPerPerson = useMemo(() => {
    const m = new Map()
    ;(data?.zones || []).forEach((z) => {
      const k = String(z.DeliveryPersonID)
      m.set(k, [...(m.get(k) || []), z.ZoneName])
    })
    return m
  }, [data])

  const doDelete = async () => {
    setBusy(true)
    try {
      if (deleting.kind === 'zone') await api.zones.remove(deleting.row.ZoneID)
      else await api.deliveryPersons.remove(deleting.row.DeliveryPersonID)
      toast(deleting.kind === 'zone' ? 'Zone removed' : 'Delivery person removed')
      setDeleting(null)
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead kicker="The Rounds" title="Zones & Delivery Staff" dek="Each zone is one delivery round, walked in route-stop order by its assigned delivery person." />

      {loading && <div className="panel"><Loading /></div>}
      {error && <div className="panel"><ErrorState error={error} onRetry={reload} /></div>}
      {data && (
        <>
          <div className="grid-2 even">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Delivery staff</h2>
                  <div className="sub">{data.persons.length} on the rolls</div>
                </div>
                <button className="btn sm primary" onClick={() => setEditPerson({})}><Icon name="plus" size={13} /> Add</button>
              </div>
              <DataTable
                flat
                pageSize={8}
                rows={data.persons}
                rowKey={(r) => r.DeliveryPersonID}
                initialSort={{ key: 'Name', dir: 'asc' }}
                empty={<Empty title="No delivery staff yet">Add someone before creating zones.</Empty>}
                columns={[
                  { key: 'DeliveryPersonID', label: 'ID', render: (r) => <span className="mono muted">#{r.DeliveryPersonID}</span> },
                  { key: 'Name', label: 'Name', render: (r) => <span className="strong">{r.Name}</span> },
                  { key: 'ContactNumber', label: 'Phone', render: (r) => <a className="mono" href={`tel:${r.ContactNumber}`}>{r.ContactNumber}</a> },
                  { key: 'CommissionRate', label: 'Rate', align: 'right', render: (r) => <span className="num">{pctOf(r.CommissionRate)}</span> },
                  { key: '_z', label: 'Zones', sortable: false, render: (r) => <span className="muted">{(zonesPerPerson.get(String(r.DeliveryPersonID)) || []).join(', ') || '—'}</span> },
                  {
                    key: '_a', label: '', actions: true,
                    render: (r) => (
                      <>
                        <button className="btn ghost icon" onClick={() => setEditPerson(r)} aria-label={`Edit ${r.Name}`}><Icon name="edit" size={15} /></button>
                        <button className="btn ghost icon" onClick={() => setDeleting({ kind: 'person', row: r })} aria-label={`Delete ${r.Name}`}><Icon name="trash" size={15} /></button>
                      </>
                    ),
                  },
                ]}
              />
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Zones</h2>
                  <div className="sub">{data.zones.length} rounds</div>
                </div>
                <button className="btn sm primary" onClick={() => setEditZone({})} disabled={!data.persons.length}><Icon name="plus" size={13} /> Add</button>
              </div>
              <DataTable
                flat
                pageSize={8}
                rows={data.zones}
                rowKey={(r) => r.ZoneID}
                initialSort={{ key: 'ZoneName', dir: 'asc' }}
                empty={<Empty title="No zones yet">Create a zone and assign a delivery person to it.</Empty>}
                columns={[
                  { key: 'ZoneName', label: 'Zone', render: (r) => <span className="strong">{r.ZoneName}</span> },
                  { key: 'DeliveryPersonID', label: 'Covered by', sortValue: (r) => personIndex.get(String(r.DeliveryPersonID))?.Name, render: (r) => personIndex.get(String(r.DeliveryPersonID))?.Name ?? <span className="muted">Unassigned</span> },
                  { key: '_c', label: 'Stops', align: 'right', sortValue: (r) => zoneStats.get(String(r.ZoneID))?.active || 0, render: (r) => { const s = zoneStats.get(String(r.ZoneID)) || { total: 0, active: 0 }; return <span className="num">{s.active}<span className="muted">/{s.total}</span></span> } },
                  {
                    key: '_a', label: '', actions: true,
                    render: (r) => (
                      <>
                        <button className="btn ghost icon" onClick={() => setEditZone(r)} aria-label={`Edit ${r.ZoneName}`}><Icon name="edit" size={15} /></button>
                        <button className="btn ghost icon" onClick={() => setDeleting({ kind: 'zone', row: r })} aria-label={`Delete ${r.ZoneName}`}><Icon name="trash" size={15} /></button>
                      </>
                    ),
                  },
                ]}
              />
            </section>
          </div>

          <Commission persons={data.persons} />
        </>
      )}

      {editPerson && <PersonForm initial={editPerson} onClose={() => setEditPerson(null)} onSaved={() => { setEditPerson(null); reload() }} />}
      {editZone && <ZoneForm initial={editZone} persons={data.persons} onClose={() => setEditZone(null)} onSaved={() => { setEditZone(null); reload() }} />}
      {deleting && (
        <Confirm
          title={deleting.kind === 'zone' ? 'Remove zone?' : 'Remove delivery person?'}
          message={
            deleting.kind === 'zone'
              ? `“${deleting.row.ZoneName}” will be removed. Zones that still have customers can’t be deleted — move them first.`
              : `${deleting.row.Name} will be removed. Reassign their zones first.`
          }
          confirmLabel="Remove"
          busy={busy}
          onConfirm={doDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}
