import { useState } from 'react'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import { PageHead, Loading, ErrorState, Modal, Field, DataTable, useToast, Badge } from '../../components/ui'
import Icon from '../../components/Icon'

export default function MySubscriptionRequests() {
  const toast = useToast()
  const { data: requests, loading: loadingReqs, error, reload } = useAsync(() => api.me.subscriptionRequests(), [])
  const { data: publications } = useAsync(() => api.publications.list(), [])
  const { data: mySubs } = useAsync(() => api.me.subscriptions(), [])
  
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)

  // Form states
  const [actionType, setActionType] = useState('Add')
  const [pubId, setPubId] = useState('')
  const [otherPub, setOtherPub] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [subId, setSubId] = useState('') // For delete
  const [notes, setNotes] = useState('')

  if (loadingReqs) return <Loading />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const openAdd = () => {
    setActionType('Add')
    setPubId('')
    setOtherPub('')
    setQuantity(1)
    setNotes('')
    setAdding(true)
  }

  const openDelete = () => {
    setActionType('Delete')
    setSubId('')
    setQuantity(1)
    setNotes('')
    setDeleting(true)
  }

  const closeModals = () => {
    setAdding(false)
    setDeleting(false)
  }

  const submitAdd = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.me.createSubscriptionRequest({
        ActionType: 'Add',
        PublicationID: pubId === 'other' ? null : Number(pubId),
        OtherPublication: pubId === 'other' ? otherPub : null,
        Quantity: Number(quantity),
        Notes: notes
      })
      toast('Request to add subscription sent')
      closeModals()
      reload()
    } catch (err) {
      toast(err.message || 'Failed to submit request', 'error')
    } finally {
      setBusy(false)
    }
  }

  const submitDelete = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const selectedSub = (mySubs || []).find(s => s.SubscriptionID == subId)
      await api.me.createSubscriptionRequest({
        ActionType: 'Delete',
        SubscriptionID: Number(subId),
        PublicationID: selectedSub?.PublicationID,
        Quantity: Number(quantity),
        Notes: notes
      })
      toast('Request to delete subscription sent')
      closeModals()
      reload()
    } catch (err) {
      toast(err.message || 'Failed to submit request', 'error')
    } finally {
      setBusy(false)
    }
  }

  const cols = [
    { key: 'CreatedAt', label: 'Date', render: (r) => new Date(r.CreatedAt).toLocaleDateString() },
    { key: 'ActionType', label: 'Action', render: (r) => <Badge tone={r.ActionType === 'Add' ? 'blue' : 'red'}>{r.ActionType}</Badge> },
    { key: 'Publication', label: 'Publication', render: (r) => r.OtherPublication || r.PublicationName || `Pub #${r.PublicationID}` },
    { key: 'Quantity', label: 'Quantity' },
    { key: 'Status', label: 'Status', render: (r) => <Badge>{r.Status}</Badge> },
  ]

  const activeSubs = (mySubs || []).filter(s => s.Status === 'Active')

  return (
    <>
      <PageHead kicker="My Account" title="Subscription Requests">
        <button className="btn" onClick={openAdd}><Icon name="plus" size={14} /> Request New</button>
        <button className="btn danger" onClick={openDelete}><Icon name="trash" size={14} /> Request Removal</button>
      </PageHead>

      <div className="panel">
        <DataTable columns={cols} rows={requests || []} rowKey="RequestID" empty="No requests found." />
      </div>

      {adding && (
        <Modal title="Request New Subscription" onClose={closeModals}>
          <form onSubmit={submitAdd} id="add-form">
            <Field label="Publication">
              <select className="input" required value={pubId} onChange={e => setPubId(e.target.value)}>
                <option value="" disabled>Select publication</option>
                {(publications || []).map(p => (
                  <option key={p.PublicationID} value={p.PublicationID}>{p.Name}</option>
                ))}
                <option value="other">Other (Please specify)</option>
              </select>
            </Field>
            {pubId === 'other' && (
              <Field label="Specify Publication">
                <input className="input" required value={otherPub} onChange={e => setOtherPub(e.target.value)} />
              </Field>
            )}
            <Field label="Quantity">
              <input type="number" min="1" className="input" required value={quantity} onChange={e => setQuantity(e.target.value)} />
            </Field>
            <Field label="Notes (optional)">
              <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)}></textarea>
            </Field>
          </form>
          <div className="modal-foot">
            <button className="btn" onClick={closeModals} type="button">Cancel</button>
            <button className="btn primary" form="add-form" type="submit" disabled={busy}>Submit Request</button>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Request Subscription Removal" onClose={closeModals}>
          <form onSubmit={submitDelete} id="del-form">
            <Field label="Current Subscription">
              <select className="input" required value={subId} onChange={e => setSubId(e.target.value)}>
                <option value="" disabled>Select subscription to remove</option>
                {activeSubs.map(s => {
                  const isFuture = s.EffectiveDate && new Date(s.EffectiveDate) > new Date();
                  return (
                    <option key={s.SubscriptionID} value={s.SubscriptionID}>
                      {s.PublicationName || `Pub #${s.PublicationID}`} (Qty: {s.Quantity}) {isFuture ? '- Upcoming' : ''}
                    </option>
                  )
                })}
              </select>
            </Field>
            <Field label="Quantity to Remove">
              <input type="number" min="1" className="input" required value={quantity} onChange={e => setQuantity(e.target.value)} />
            </Field>
            <Field label="Notes (optional)">
              <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)}></textarea>
            </Field>
          </form>
          <div className="modal-foot">
            <button className="btn" onClick={closeModals} type="button">Cancel</button>
            <button className="btn danger" form="del-form" type="submit" disabled={busy}>Submit Request</button>
          </div>
        </Modal>
      )}
    </>
  )
}
