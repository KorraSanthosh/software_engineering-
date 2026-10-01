import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { PageHead, DataTable, Modal, Field, useToast, Badge } from '../../components/ui'
import Icon from '../../components/Icon'

const ROLE_LABELS = {
  manager: 'Manager',
  delivery_staff: 'Delivery Staff',
  customer: 'Customer'
}

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showDelete, setShowDelete] = useState(null) // holds user object to delete
  const [deleteStep, setDeleteStep] = useState(1)
  const [deleteOtp, setDeleteOtp] = useState('')
  const [deleting, setDeleting] = useState(false)
  
  const toast = useToast()

  const [form, setForm] = useState({
    username: '', password: '', role: 'customer', display_name: '', linked_id: '', phone: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const loadUsers = async () => {
    try {
      setLoading(true)
      const data = await api.users.list()
      setUsers(data || [])
    } catch (e) {
      toast('Failed to load users: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        linked_id: form.linked_id ? parseInt(form.linked_id, 10) : null
      }
      await api.users.register(payload)
      toast('User created successfully.')
      setShowCreate(false)
      setForm({ username: '', password: '', role: 'customer', display_name: '', linked_id: '', phone: '' })
      loadUsers()
    } catch (e) {
      setFormError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRequestDeleteOtp = async (user) => {
    setDeleting(true)
    try {
      const res = await api.users.requestDeleteOtp({ user_id: user.UserID })
      toast(res.message || 'OTP sent to user.')
      setDeleteStep(2)
    } catch (e) {
      toast(e.message || 'Failed to request delete OTP', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleConfirmDelete = async () => {
    setDeleting(true)
    try {
      await api.users.delete(showDelete.UserID, deleteOtp)
      toast(`User ${showDelete.Username} deleted successfully.`)
      setShowDelete(null)
      loadUsers()
    } catch (e) {
      toast(e.message || 'Failed to delete user', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: 'UserID', label: '#', sortable: true },
    { key: 'Username', label: 'Username', sortable: true },
    { key: 'DisplayName', label: 'Display Name', sortable: true },
    { 
      key: 'Role', label: 'Role',
      render: (r) => <Badge tone={r.Role === 'manager' ? 'pending' : r.Role === 'delivery_staff' ? 'upcoming' : 'paid'}>{ROLE_LABELS[r.Role]}</Badge>,
      sortable: true
    },
    { key: 'Phone', label: 'Mobile', render: (r) => r.Phone || '—' },
    { key: 'LinkedID', label: 'Linked ID', render: (r) => r.LinkedID || '—', sortable: true },
    {
      key: 'Actions', label: '', align: 'right',
      render: (r) => (
        <button className="btn sm" onClick={() => { setShowDelete(r); setDeleteStep(1); setDeleteOtp(''); }} title="Delete User">
          <Icon name="x" size={14} style={{ color: 'var(--accent)' }} />
        </button>
      )
    }
  ]

  return (
    <>
      <PageHead
        kicker="Agency Admin"
        title="User Management"
        dek="Manage staff and customer login accounts."
      >
        <button className="btn btn-primary" onClick={() => { setShowCreate(true); setFormError(''); }}>
          <Icon name="plus" size={14} /> Register User
        </button>
      </PageHead>

      <DataTable
        columns={columns}
        rows={users}
        rowKey="UserID"
        initialSort={{ key: 'UserID', dir: 'asc' }}
        loading={loading}
      />

      {showCreate && (
        <Modal
          title="Register New User"
          kicker="Account Creation"
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Account'}
              </button>
            </>
          }
        >
          {formError && (
            <div className="login-error" style={{ marginBottom: '1rem' }}>
              <Icon name="alert" size={14} /> {formError}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Field label="Role">
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="manager">Manager</option>
                <option value="delivery_staff">Delivery Staff</option>
                <option value="customer">Customer</option>
              </select>
            </Field>
            <Field label="Linked ID" hint="CustomerID or DeliveryPersonID">
              <input type="number" value={form.linked_id} onChange={(e) => setForm({ ...form, linked_id: e.target.value })} />
            </Field>
          </div>
          <Field label="Display Name">
            <input type="text" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required />
          </Field>
          <Field label="Mobile Number" hint="Indian number (+91 or 10 digits)">
            <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required placeholder="e.g. 9876543210" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Field label="Username">
              <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required minLength={3} maxLength={50} />
            </Field>
            <Field label="Password">
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
            </Field>
          </div>
        </Modal>
      )}

      {showDelete && (
        <Modal
          title="Delete Account"
          kicker="Manager Override"
          onClose={() => setShowDelete(null)}
          footer={
            <>
              <button className="btn" onClick={() => setShowDelete(null)}>Cancel</button>
              {deleteStep === 1 ? (
                <button className="btn btn-primary" onClick={() => handleRequestDeleteOtp(showDelete)} disabled={deleting}>
                  {deleting ? 'Requesting...' : 'Request Verification Code'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleConfirmDelete} disabled={deleting || !deleteOtp}>
                  {deleting ? 'Deleting...' : 'Confirm Deletion'}
                </button>
              )}
            </>
          }
        >
          <div style={{ padding: '0.75rem', background: 'var(--paper-2)', borderRadius: 4, marginBottom: '1.5rem', fontSize: '0.85rem' }}>
            <strong>Deleting: {showDelete.Username} ({showDelete.DisplayName})</strong>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--ink-2)' }}>
              To authorize deletion, the user must provide you with the OTP sent to their registered mobile number.
            </p>
          </div>

          {deleteStep === 2 && (
            <Field label="Verification Code (OTP) from User">
              <input
                type="text"
                value={deleteOtp}
                onChange={(e) => setDeleteOtp(e.target.value)}
                placeholder="Enter 6-digit OTP"
                autoComplete="off"
                autoFocus
              />
            </Field>
          )}
        </Modal>
      )}
    </>
  )
}
