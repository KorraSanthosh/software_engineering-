import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useToast } from '../../components/ui'

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  const [form, setForm] = useState({
    username: '', password: '', role: 'customer', display_name: '', linked_id: ''
  })
  const [submitting, setSubmitting] = useState(false)

  const loadUsers = async () => {
    try {
      setLoading(true)
      const data = await api.users.list()
      setUsers(data)
    } catch (e) {
      addToast('Failed to load users: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        linked_id: form.linked_id ? parseInt(form.linked_id, 10) : null
      }
      await api.users.register(payload)
      addToast('User created successfully.', 'success')
      setForm({ username: '', password: '', role: 'customer', display_name: '', linked_id: '' })
      loadUsers()
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="desk-layout">
      <div className="desk-main">
        <h2 className="desk-heading">User Management</h2>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Display Name</th>
                <th>Role</th>
                <th>Linked ID</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.UserID}>
                  <td>{u.Username}</td>
                  <td>{u.DisplayName}</td>
                  <td>{u.Role}</td>
                  <td>{u.LinkedID || '-'}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan="4" className="empty-state">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <div className="desk-sidebar">
        <div className="desk-card">
          <h3>Create User</h3>
          <form onSubmit={handleSubmit} className="form-stack">
            <label>
              Username:
              <input type="text" value={form.username} onChange={(e) => setForm({...form, username: e.target.value})} required minLength={3} maxLength={50} />
            </label>
            <label>
              Password:
              <input type="password" value={form.password} onChange={(e) => setForm({...form, password: e.target.value})} required minLength={6} />
            </label>
            <label>
              Display Name:
              <input type="text" value={form.display_name} onChange={(e) => setForm({...form, display_name: e.target.value})} required />
            </label>
            <label>
              Role:
              <select value={form.role} onChange={(e) => setForm({...form, role: e.target.value})}>
                <option value="manager">Manager</option>
                <option value="delivery_staff">Delivery Staff</option>
                <option value="customer">Customer</option>
              </select>
            </label>
            <label>
              Linked ID (Optional):
              <input type="number" value={form.linked_id} onChange={(e) => setForm({...form, linked_id: e.target.value})} />
            </label>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
