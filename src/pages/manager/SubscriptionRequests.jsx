import { useState } from 'react'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import { PageHead, Loading, ErrorState, Modal, Field, DataTable, useToast, Badge } from '../../components/ui'
import Icon from '../../components/Icon'

export default function SubscriptionRequests() {
  const toast = useToast()
  const { data: requests, loading, error, reload } = useAsync(() => api.subscriptionRequests.list(), [])
  const [reviewing, setReviewing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState('')

  if (loading) return <Loading />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const openReview = (req) => {
    setReviewing(req)
    setNotes(req.ManagerNotes || '')
  }

  const closeReview = () => {
    setReviewing(null)
  }

  const submitReview = async (status) => {
    setBusy(true)
    try {
      await api.subscriptionRequests.review(reviewing.RequestID, { Status: status, ManagerNotes: notes })
      toast(`Request marked as ${status}`)
      closeReview()
      reload()
    } catch (err) {
      toast(err.message || 'Failed to update request', 'error')
    } finally {
      setBusy(false)
    }
  }

  const cols = [
    { key: 'CreatedAt', label: 'Date', render: (r) => new Date(r.CreatedAt).toLocaleDateString() },
    { key: 'Customer', label: 'Customer', render: (r) => r.CustomerName || `Cust #${r.CustomerID}` },
    { key: 'ActionType', label: 'Action', render: (r) => <Badge tone={r.ActionType === 'Add' ? 'blue' : 'red'}>{r.ActionType}</Badge> },
    { key: 'Publication', label: 'Publication', render: (r) => r.OtherPublication || r.PublicationName || `Pub #${r.PublicationID}` },
    { key: 'Quantity', label: 'Quantity' },
    { key: 'Status', label: 'Status', render: (r) => <Badge>{r.Status}</Badge> },
  ]

  const pending = (requests || []).filter(r => r.Status === 'pending' || !r.Status)
  const resolved = (requests || []).filter(r => r.Status === 'approved' || r.Status === 'rejected')

  return (
    <>
      <PageHead kicker="Management" title="Subscription Requests" />

      <h3 style={{marginTop: '2rem'}}>Pending Requests</h3>
      <div className="panel">
        <DataTable 
          columns={cols} 
          rows={pending} 
          rowKey="RequestID" 
          onRowClick={openReview}
          empty="No pending requests." 
        />
      </div>

      <h3 style={{marginTop: '2rem'}}>Resolved Requests</h3>
      <div className="panel">
        <DataTable 
          columns={cols} 
          rows={resolved} 
          rowKey="RequestID" 
          empty="No resolved requests." 
        />
      </div>

      {reviewing && (
        <Modal title={`Review ${reviewing.ActionType} Request`} onClose={closeReview}>
          <div style={{ marginBottom: '1rem' }}>
            <p><strong>Customer:</strong> {reviewing.CustomerName || `ID: ${reviewing.CustomerID}`}</p>
            <p><strong>Action:</strong> {reviewing.ActionType}</p>
            <p><strong>Publication:</strong> {reviewing.OtherPublication || reviewing.PublicationName || `ID: ${reviewing.PublicationID}`}</p>
            <p><strong>Quantity:</strong> {reviewing.Quantity}</p>
            <p><strong>Customer Notes:</strong> {reviewing.Notes || 'None'}</p>
          </div>
          <Field label="Manager Notes">
            <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)}></textarea>
          </Field>
          <div className="modal-foot">
            <button className="btn" onClick={closeReview} disabled={busy}>Cancel</button>
            <button className="btn danger" onClick={() => submitReview('rejected')} disabled={busy}>Reject</button>
            <button className="btn primary" onClick={() => submitReview('approved')} disabled={busy}>Approve</button>
          </div>
        </Modal>
      )}
    </>
  )
}
