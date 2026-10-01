import { useState } from 'react'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import { money, date } from '../../lib/format'
import { PageHead, Badge, Loading, ErrorState, DataTable, Modal, Field, SearchBox, useToast } from '../../components/ui'
import Icon from '../../components/Icon'

const STATUS_TONE = {
  pending: 'pending',
  accepted: 'paid',
  rejected: 'failed',
}

export default function PaymentVerification() {
  const [filter, setFilter] = useState('pending')
  const { data, loading, error, reload } = useAsync(() => api.paymentRequests.list({ status: filter || undefined }), [filter])
  const [selected, setSelected] = useState(null)
  const [action, setAction] = useState(null) // 'accept' | 'reject'
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const reqs = data || []

  const handleReview = async () => {
    if (!selected || !action) return
    setBusy(true)
    try {
      const result = await api.paymentRequests.review(selected.RequestID, {
        status: action === 'accept' ? 'accepted' : 'rejected',
        note: note.trim(),
      })
      toast(result.message || `Payment request ${action}ed`)
      setSelected(null)
      setAction(null)
      setNote('')
      reload()
    } catch (err) {
      toast(err.message || 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    { key: 'RequestID', label: '#', sortable: true },
    { key: 'CustomerName', label: 'Customer', sortable: true },
    { key: 'Amount', label: 'Amount', render: (_, r) => <strong>{money(r.Amount)}</strong>, align: 'right', sortable: true },
    { key: 'ReferenceNumber', label: 'Reference #', sortable: true,
      render: (_, r) => <code style={{fontFamily: 'var(--font-mono)', fontSize: '0.85rem', background: 'var(--paper-2)', padding: '0.15rem 0.4rem', borderRadius: '3px'}}>{r.ReferenceNumber}</code>
    },
    {
      key: 'Status', label: 'Status',
      render: (_, r) => <Badge tone={STATUS_TONE[r.Status]}>{r.Status.charAt(0).toUpperCase() + r.Status.slice(1)}</Badge>,
      sortable: true,
    },
    { key: 'CreatedAt', label: 'Submitted', render: (_, r) => date(r.CreatedAt), sortable: true },
    {
      key: 'actions', label: 'Actions',
      render: (_, r) => r.Status === 'pending' ? (
        <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); setSelected(r); setAction(null); setNote('') }}>
          <Icon name="eye" size={13} /> Review
        </button>
      ) : (
        <span style={{fontSize: '0.78rem', color: 'var(--ink-3)'}}>{r.ManagerNote || '—'}</span>
      ),
    },
  ]

  return (
    <>
      <PageHead
        kicker="Manager"
        title="Payment Verification"
        dek="Review customer inline payment references and verify them against your mobile transactions."
      >
        <select value={filter} onChange={e => setFilter(e.target.value)} className="form-select" style={{padding: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.82rem'}}>
          <option value="pending">Pending Only</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="">All Requests</option>
        </select>
      </PageHead>

      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        reqs.length === 0 ? (
          <div className="panel" style={{padding: '3rem', textAlign: 'center'}}>
            <Icon name="check" size={40} style={{color: 'var(--green)', marginBottom: '1rem'}} />
            <h3 style={{fontFamily: 'var(--font-head)', margin: 0}}>
              {filter === 'pending' ? 'No Pending Requests' : 'No Requests Found'}
            </h3>
            <p style={{color: 'var(--ink-3)', marginTop: '0.5rem'}}>All caught up!</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={reqs}
            rowKey="RequestID"
            initialSort={{ key: 'CreatedAt', dir: 'desc' }}
          />
        )
      )}

      {selected && (
        <Modal
          title={`Payment Request #${selected.RequestID}`}
          kicker="Verify Reference Number"
          onClose={() => { setSelected(null); setAction(null) }}
          footer={
            action ? (
              <>
                <button className="btn" onClick={() => setAction(null)}>Back</button>
                <button
                  className={`btn ${action === 'accept' ? 'btn-primary' : 'btn-danger'}`}
                  onClick={handleReview}
                  disabled={busy}
                  style={action === 'reject' ? {background: 'var(--accent)', color: 'white'} : {}}
                >
                  {busy ? 'Processing…' : action === 'accept' ? '✓ Confirm Accept' : '✗ Confirm Reject'}
                </button>
              </>
            ) : (
              <>
                <button className="btn" onClick={() => { setSelected(null) }}>Close</button>
                <button className="btn" onClick={() => setAction('reject')} style={{borderColor: 'var(--accent)', color: 'var(--accent)'}}>
                  <Icon name="x" size={13} /> Reject
                </button>
                <button className="btn btn-primary" onClick={() => setAction('accept')}>
                  <Icon name="check" size={13} /> Accept
                </button>
              </>
            )
          }
        >
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
            <div>
              <div style={{fontSize: '0.72rem', fontFamily: 'var(--font-banner)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '0.25rem'}}>Customer</div>
              <strong>{selected.CustomerName}</strong>
              <span style={{fontSize: '0.82rem', color: 'var(--ink-3)'}}> (#{selected.CustomerID})</span>
            </div>
            <div>
              <div style={{fontSize: '0.72rem', fontFamily: 'var(--font-banner)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '0.25rem'}}>Amount</div>
              <strong style={{fontSize: '1.2rem', fontFamily: 'var(--font-mono)', color: 'var(--accent)'}}>{money(selected.Amount)}</strong>
            </div>
          </div>

          <div style={{background: 'var(--paper-2)', padding: '1rem', borderRadius: '4px', marginBottom: '1rem', textAlign: 'center'}}>
            <div style={{fontSize: '0.72rem', fontFamily: 'var(--font-banner)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '0.5rem'}}>Payment Reference Number</div>
            <code style={{fontSize: '1.3rem', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--ink)'}}>{selected.ReferenceNumber}</code>
            <p style={{fontSize: '0.78rem', color: 'var(--ink-3)', marginTop: '0.5rem', marginBottom: 0}}>
              ☝ Check this reference number in your mobile banking / UPI app transactions
            </p>
          </div>

          <div style={{fontSize: '0.82rem', color: 'var(--ink-3)'}}>
            Submitted: {date(selected.CreatedAt)}
          </div>

          {action && (
            <div style={{marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--rule)'}}>
              <Field label={action === 'accept' ? 'Approval Note (optional)' : 'Rejection Reason'}>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={action === 'accept' ? 'e.g. Verified in UPI transactions' : 'e.g. Reference number not found in transactions'}
                  rows={3}
                  style={{width: '100%', fontFamily: 'var(--font-ui)', fontSize: '0.85rem', padding: '0.5rem', border: '1.5px solid var(--rule)', borderRadius: '3px', resize: 'vertical', boxSizing: 'border-box'}}
                />
              </Field>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
