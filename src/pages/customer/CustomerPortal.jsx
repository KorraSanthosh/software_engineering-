import { useAuth } from '../../lib/auth'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import { money } from '../../lib/format'
import { PageHead, Loading, ErrorState } from '../../components/ui'
import { EditorialBoxHeader } from '../../components/Ornaments'
import Icon from '../../components/Icon'
import { Link } from 'react-router-dom'

export default function CustomerPortal() {
  const { user } = useAuth()
  const { data: overdue, loading, error } = useAsync(() => api.me.overdue(), [])
  const { data: subs } = useAsync(() => api.me.subscriptions(), [])
  const { data: holds } = useAsync(() => api.me.vacationHolds(), [])
  const { data: payReqs } = useAsync(() => api.me.paymentRequests(), [])

  if (loading) return <Loading />
  if (error) return <ErrorState error={error} />

  const customer = overdue?.customer
  const totalOverdue = overdue?.total_overdue || 0
  const activeSubs = (subs || []).filter(s => s.Status === 'Active')
  
  // Group by publication to hide old superseded subscriptions
  const pubGroups = {}
  activeSubs.forEach(s => {
    if (!pubGroups[s.PublicationID]) pubGroups[s.PublicationID] = []
    pubGroups[s.PublicationID].push(s)
  })
  
  const displaySubs = []
  Object.values(pubGroups).forEach(group => {
    group.sort((a, b) => new Date(b.EffectiveDate) - new Date(a.EffectiveDate))
    const now = new Date()
    // Find the latest effective one that has already started
    const current = group.find(s => new Date(s.EffectiveDate) <= now)
    // Find any future ones
    const futures = group.filter(s => new Date(s.EffectiveDate) > now)
    if (current) displaySubs.push(current)
    displaySubs.push(...futures)
  })

  const activeHolds = (holds || []).filter(h => {
    const now = new Date().toISOString().slice(0, 10)
    return h.EndDate >= now
  })
  const pendingReqs = (payReqs || []).filter(r => r.Status === 'pending')

  return (
    <>
      <PageHead
        kicker="Customer Portal"
        title={`Welcome, ${customer?.Name || user?.DisplayName || 'Reader'}`}
        dek={`Account #${customer?.CustomerID || user?.LinkedID} · ${customer?.Status === 'Active' ? '✓ Active' : '⚠ Suspended'}`}
      />

      <div className="stats">
        <Link to="/my-account/overdue" className="stat" style={{textDecoration: 'none', color: 'inherit'}}>
          <Icon name="receipt" size={18} />
          <span className="stat-value" style={{color: totalOverdue > 0 ? 'var(--accent)' : 'var(--green)'}}>
            {money(totalOverdue)}
          </span>
          <span className="stat-label">Outstanding Balance</span>
        </Link>

        <Link to="/my-account/overdue" className="stat" style={{textDecoration: 'none', color: 'inherit'}}>
          <Icon name="alert" size={18} />
          <span className="stat-value">{overdue?.invoices?.length || 0}</span>
          <span className="stat-label">Unpaid Invoices</span>
        </Link>

        <div className="stat">
          <Icon name="repeat" size={18} />
          <span className="stat-value">{displaySubs.filter(s => new Date(s.EffectiveDate) <= new Date()).length}</span>
          <span className="stat-label">Active Subscriptions</span>
        </div>

        <Link to="/my-account/payment-requests" className="stat" style={{textDecoration: 'none', color: 'inherit'}}>
          <Icon name="wallet" size={18} />
          <span className="stat-value">{pendingReqs.length}</span>
          <span className="stat-label">Pending Requests</span>
        </Link>
      </div>

      <div className="grid-2" style={{marginTop: '1.5rem'}}>
        <div className="panel">
          <EditorialBoxHeader title="Quick Actions" />
          <div style={{padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
            <Link to="/my-account/overdue" className="btn btn-secondary" style={{textAlign: 'center'}}>
              <Icon name="receipt" size={14} /> View Overdue Invoices
            </Link>
            <Link to="/my-account/vacation-holds" className="btn btn-secondary" style={{textAlign: 'center'}}>
              <Icon name="pause" size={14} /> Manage Vacation Holds
            </Link>
            <Link to="/my-account/payment-requests" className="btn btn-secondary" style={{textAlign: 'center'}}>
              <Icon name="wallet" size={14} /> Submit Payment Request
            </Link>
          </div>
        </div>

        <div className="panel">
          <EditorialBoxHeader title="My Subscriptions" />
          <div style={{padding: '1rem'}}>
            {displaySubs.length === 0 ? (
              <p style={{color: 'var(--ink-3)', fontSize: '0.85rem'}}>No active subscriptions.</p>
            ) : (
              displaySubs.map(s => {
                const isFuture = s.EffectiveDate && new Date(s.EffectiveDate) > new Date();
                return (
                  <div key={s.SubscriptionID} style={{display: 'flex', flexDirection: 'column', padding: '0.4rem 0', borderBottom: '1px solid var(--rule)'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between'}}>
                      <span style={{fontWeight: 600}}>{s.PublicationName || `Pub #${s.PublicationID}`}</span>
                      <span style={{fontFamily: 'var(--font-mono)', fontSize: '0.85rem'}}>×{s.Quantity} · {money(s.PricePerIssue)}/issue</span>
                    </div>
                    {isFuture && (
                      <span style={{fontSize: '0.8rem', color: 'var(--amber)', marginTop: '0.2rem'}}>
                        Will come into action on {new Date(s.EffectiveDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </>
  )
}
