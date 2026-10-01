import { useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAsync } from '../../lib/hooks'
import { date, isoDate, addDays } from '../../lib/format'
import { PageHead, Badge, Loading, ErrorState, useToast } from '../../components/ui'
import Icon from '../../components/Icon'

export default function DeliveryPortal() {
  const { user } = useAuth()
  const [day, setDay] = useState(isoDate())
  const { data, loading, error, reload } = useAsync(() => api.myDeliveries.list({ date: day }), [day])
  const [busy, setBusy] = useState({})
  const toast = useToast()

  const deliveries = data?.deliveries || []
  const person = data?.delivery_person
  const stats = {
    total: data?.total || 0,
    delivered: data?.delivered || 0,
    failed: data?.failed || 0,
  }

  const toggleStatus = async (did, current) => {
    const newStatus = current === 'Delivered' ? 'Failed' : 'Delivered'
    setBusy(b => ({ ...b, [did]: true }))
    try {
      await api.myDeliveries.setStatus([did], newStatus)
      toast(`Delivery #${did} marked as ${newStatus}`)
      reload()
    } catch (err) {
      toast(err.message || 'Update failed')
    } finally {
      setBusy(b => ({ ...b, [did]: false }))
    }
  }

  const markAllDelivered = async () => {
    const pending = deliveries.filter(d => d.DeliveryStatus !== 'Delivered').map(d => d.DeliveryID)
    if (!pending.length) { toast('All deliveries already marked!'); return }
    setBusy({ all: true })
    try {
      await api.myDeliveries.setStatus(pending, 'Delivered')
      toast(`${pending.length} deliveries marked as Delivered`)
      reload()
    } catch (err) {
      toast(err.message || 'Update failed')
    } finally {
      setBusy({})
    }
  }

  const prevDay = () => setDay(isoDate(addDays(day, -1)))
  const nextDay = () => setDay(isoDate(addDays(day, 1)))
  const goToday = () => setDay(isoDate())

  return (
    <>
      <PageHead
        kicker="Delivery Portal"
        title={`Route Sheet — ${person?.Name || user?.DisplayName || 'My Route'}`}
        dek={`Deliveries for ${date(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
      >
        <button className="btn" onClick={markAllDelivered} disabled={busy.all || loading}>
          <Icon name="check" size={14} /> Mark All Delivered
        </button>
        <button className="btn" onClick={() => window.print()}>
          <Icon name="printer" size={14} /> Print
        </button>
      </PageHead>

      {/* Day navigator */}
      <div className="panel" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '0.75rem'}}>
        <button className="btn btn-sm" onClick={prevDay}><Icon name="chevL" size={14} /></button>
        <input type="date" value={day} onChange={e => setDay(e.target.value)} style={{fontFamily: 'var(--font-mono)', fontSize: '0.85rem'}} />
        <button className="btn btn-sm" onClick={goToday}>Today</button>
        <button className="btn btn-sm" onClick={nextDay}><Icon name="chevR" size={14} /></button>
      </div>

      {/* Stats bar */}
      <div className="stats" style={{marginTop: '1rem'}}>
        <div className="stat">
          <Icon name="truck" size={18} />
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Total Stops</span>
        </div>
        <div className="stat">
          <Icon name="check" size={18} />
          <span className="stat-value" style={{color: 'var(--green)'}}>{stats.delivered}</span>
          <span className="stat-label">Delivered</span>
        </div>
        <div className="stat">
          <Icon name="alert" size={18} />
          <span className="stat-value" style={{color: stats.failed > 0 ? 'var(--accent)' : 'inherit'}}>{stats.failed}</span>
          <span className="stat-label">Failed</span>
        </div>
      </div>

      {/* Delivery list */}
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        deliveries.length === 0 ? (
          <div className="panel" style={{padding: '3rem', textAlign: 'center', marginTop: '1rem'}}>
            <Icon name="truck" size={40} style={{color: 'var(--ink-3)', marginBottom: '1rem'}} />
            <h3 style={{fontFamily: 'var(--font-head)', margin: 0}}>No Deliveries</h3>
            <p style={{color: 'var(--ink-3)', marginTop: '0.5rem'}}>No deliveries scheduled for this date on your route.</p>
          </div>
        ) : (
          <div className="panel" style={{marginTop: '1rem'}}>
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Zone</th>
                  <th>Stop</th>
                  <th>Customer</th>
                  <th>Address</th>
                  <th>Publication</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d, i) => (
                  <tr key={d.DeliveryID}>
                    <td>{i + 1}</td>
                    <td>{d.ZoneName || '—'}</td>
                    <td style={{fontFamily: 'var(--font-mono)'}}>{d.RouteSequence}</td>
                    <td><strong>{d.CustomerName}</strong></td>
                    <td style={{fontSize: '0.8rem', color: 'var(--ink-3)'}}>{d.Address}</td>
                    <td>{d.PublicationName}</td>
                    <td style={{fontFamily: 'var(--font-mono)', textAlign: 'center'}}>{d.QuantityDelivered}</td>
                    <td>
                      <Badge tone={d.DeliveryStatus === 'Delivered' ? 'delivered' : 'failed'}>
                        {d.DeliveryStatus}
                      </Badge>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm"
                        onClick={() => toggleStatus(d.DeliveryID, d.DeliveryStatus)}
                        disabled={busy[d.DeliveryID]}
                        title={d.DeliveryStatus === 'Delivered' ? 'Mark as Failed' : 'Mark as Delivered'}
                      >
                        <Icon name={d.DeliveryStatus === 'Delivered' ? 'x' : 'check'} size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </>
  )
}
