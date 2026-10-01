import { useState } from 'react'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import { date, isoDate, addDays, daysBetween } from '../../lib/format'
import { PageHead, Badge, Loading, ErrorState, DataTable, Modal, Field, useToast } from '../../components/ui'
import Icon from '../../components/Icon'

function holdStatus(h) {
  const now = isoDate()
  if (h.EndDate < now) return 'completed'
  if (h.StartDate > now) return 'upcoming'
  return 'ongoing'
}

export default function MyVacationHolds() {
  const { data, loading, error, reload } = useAsync(() => api.me.vacationHolds(), [])
  const [showForm, setShowForm] = useState(false)
  const [start, setStart] = useState(isoDate(addDays(new Date(), 1)))
  const [end, setEnd] = useState(isoDate(addDays(new Date(), 7)))
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  if (loading) return <Loading />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const holds = data || []

  const handleSubmit = async () => {
    setSaving(true)
    try {
      await api.me.createVacationHold({ StartDate: start, EndDate: end })
      toast('Vacation hold created! Deliveries will be paused during this period.')
      setShowForm(false)
      reload()
    } catch (err) {
      toast(err.message || 'Failed to create hold')
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    { key: 'HoldID', label: '#', sortable: true },
    { key: 'StartDate', label: 'From', render: (_, r) => date(r.StartDate), sortable: true },
    { key: 'EndDate', label: 'To', render: (_, r) => date(r.EndDate), sortable: true },
    {
      key: 'Duration', label: 'Days',
      render: (_, r) => {
        const d = daysBetween(r.StartDate, r.EndDate)
        return d !== null ? d + 1 : '—'
      },
      sortable: true,
    },
    {
      key: 'Status', label: 'Status',
      render: (_, r) => {
        const s = holdStatus(r)
        return <Badge tone={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</Badge>
      },
    },
  ]

  return (
    <>
      <PageHead
        kicker="My Account"
        title="Vacation Holds"
        dek="Pause deliveries while you're away — without cancelling your subscriptions."
      >
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={14} /> New Hold
        </button>
      </PageHead>

      {holds.length === 0 ? (
        <div className="panel" style={{padding: '3rem', textAlign: 'center'}}>
          <Icon name="pause" size={40} style={{color: 'var(--ink-3)', marginBottom: '1rem'}} />
          <h3 style={{fontFamily: 'var(--font-head)', margin: 0}}>No Vacation Holds</h3>
          <p style={{color: 'var(--ink-3)', marginTop: '0.5rem'}}>You haven't scheduled any delivery pauses.</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={holds}
          rowKey="HoldID"
          initialSort={{ key: 'StartDate', dir: 'desc' }}
        />
      )}

      {showForm && (
        <Modal
          title="Schedule Vacation Hold"
          kicker="Deliveries will be paused"
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving…' : 'Create Hold'}
              </button>
            </>
          }
        >
          <Field label="Start Date">
            <input type="date" value={start} onChange={e => setStart(e.target.value)} min={isoDate(addDays(new Date(), 0))} />
          </Field>
          <Field label="End Date">
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} min={start} />
          </Field>
          {start && end && daysBetween(start, end) !== null && (
            <p style={{fontSize: '0.85rem', color: 'var(--ink-3)', marginTop: '0.5rem'}}>
              Deliveries paused for <strong>{daysBetween(start, end) + 1} day(s)</strong>.
            </p>
          )}
        </Modal>
      )}
    </>
  )
}
