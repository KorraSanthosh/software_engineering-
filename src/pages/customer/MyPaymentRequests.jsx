import { useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAsync } from '../../lib/hooks'
import { money, date } from '../../lib/format'
import { PageHead, Badge, Loading, ErrorState, DataTable, Modal, Field, useToast } from '../../components/ui'
import Icon from '../../components/Icon'

const STATUS_TONE = {
  pending: 'pending',
  accepted: 'paid',
  rejected: 'failed',
}

export default function MyPaymentRequests() {
  const { user } = useAuth()
  const { data: overdue } = useAsync(() => api.me.overdue(), [])
  const { data: requests, loading, error, reload } = useAsync(() => api.me.paymentRequests(), [])
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount] = useState('')
  const [refNumber, setRefNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const toast = useToast()

  if (loading) return <Loading />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const reqs = requests || []
  const totalOverdue = overdue?.total_overdue || 0
  const hasPending = reqs.some(r => r.Status === 'pending')

  const handleSubmit = async () => {
    setFormError('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setFormError('Enter a valid amount.'); return }
    if (amt > totalOverdue + 0.01) { setFormError(`Amount cannot exceed your overdue balance of ${money(totalOverdue)}.`); return }
    if (!refNumber.trim()) { setFormError('Enter the payment reference number.'); return }

    setSaving(true)
    try {
      await api.me.createPaymentRequest({
        CustomerID: user?.LinkedID,
        Amount: amt,
        ReferenceNumber: refNumber.trim(),
      })
      toast('Payment request submitted! The manager will verify your payment.')
      setShowForm(false)
      setAmount('')
      setRefNumber('')
      reload()
    } catch (err) {
      setFormError(err.message || 'Failed to submit request')
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    { key: 'RequestID', label: '#', sortable: true },
    { key: 'Amount', label: 'Amount', render: (r) => money(r.Amount), align: 'right', sortable: true },
    { key: 'ReferenceNumber', label: 'Ref. Number', sortable: true },
    {
      key: 'Status', label: 'Status',
      render: (r) => <Badge tone={STATUS_TONE[r.Status]}>{r.Status.charAt(0).toUpperCase() + r.Status.slice(1)}</Badge>,
      sortable: true,
    },
    { key: 'ManagerNote', label: 'Manager Note', render: (r) => r.ManagerNote || '—' },
    { key: 'CreatedAt', label: 'Submitted', render: (r) => date(r.CreatedAt), sortable: true },
  ]

  return (
    <>
      <PageHead
        kicker="My Account"
        title="Payment Requests"
        dek={`Submit an inline payment reference for the manager to verify. Your overdue: ${money(totalOverdue)}`}
      >
        {totalOverdue > 0 && !hasPending && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="send" size={14} /> New Payment Request
          </button>
        )}
        {hasPending && (
          <span style={{fontSize: '0.82rem', color: 'var(--accent)', fontStyle: 'italic'}}>
            ⏳ You have a pending request. Wait for the manager to review it.
          </span>
        )}
      </PageHead>

      {/* Status notifications for recent requests */}
      {reqs.filter(r => r.Status !== 'pending').slice(0, 3).map(r => (
        <div key={r.RequestID} className={`panel`} style={{
          padding: '0.75rem 1rem',
          marginBottom: '0.5rem',
          borderLeft: `4px solid ${r.Status === 'accepted' ? 'var(--green)' : 'var(--accent)'}`,
          display: 'flex', alignItems: 'center', gap: '0.75rem',
        }}>
          <Icon name={r.Status === 'accepted' ? 'check' : 'x'} size={18}
            style={{color: r.Status === 'accepted' ? 'var(--green)' : 'var(--accent)'}} />
          <div>
            <strong style={{fontSize: '0.85rem'}}>
              Payment of {money(r.Amount)} — {r.Status === 'accepted' ? '✅ Accepted' : '❌ Rejected'}
            </strong>
            {r.ManagerNote && (
              <p style={{margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--ink-3)'}}>
                Manager's note: "{r.ManagerNote}"
              </p>
            )}
          </div>
        </div>
      ))}

      {reqs.length === 0 ? (
        <div className="panel" style={{padding: '3rem', textAlign: 'center'}}>
          <Icon name="wallet" size={40} style={{color: 'var(--ink-3)', marginBottom: '1rem'}} />
          <h3 style={{fontFamily: 'var(--font-head)', margin: 0}}>No Payment Requests Yet</h3>
          <p style={{color: 'var(--ink-3)', marginTop: '0.5rem'}}>
            Submit an inline payment reference and the manager will verify it.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={reqs}
          rowKey="RequestID"
          initialSort={{ key: 'CreatedAt', dir: 'desc' }}
        />
      )}

      {showForm && (
        <Modal
          title="Submit Payment Request"
          kicker="Inline Payment Verification"
          onClose={() => { setShowForm(false); setFormError('') }}
          footer={
            <>
              <button className="btn" onClick={() => { setShowForm(false); setFormError('') }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Submitting…' : 'Submit Request'}
              </button>
            </>
          }
        >
          <div style={{background: 'var(--paper-2)', padding: '0.75rem 1rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem'}}>
            <strong>Your total overdue:</strong> <span style={{color: 'var(--accent)', fontFamily: 'var(--font-mono)'}}>{money(totalOverdue)}</span>
            <br />
            <span style={{color: 'var(--ink-3)', fontSize: '0.78rem'}}>
              You can only submit a payment request within your outstanding balance.
            </span>
          </div>

          {formError && (
            <div className="login-error" style={{marginBottom: '1rem'}}>
              <Icon name="alert" size={14} /> {formError}
            </div>
          )}

          <Field label="Payment Amount (₹)">
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={totalOverdue}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={`Max: ${money(totalOverdue)}`}
            />
          </Field>

          <Field label="Payment Reference Number" hint="Enter the UPI/NEFT/IMPS transaction reference from your bank">
            <input
              type="text"
              value={refNumber}
              onChange={e => setRefNumber(e.target.value)}
              placeholder="e.g. UPI123456789"
            />
          </Field>
        </Modal>
      )}
    </>
  )
}
