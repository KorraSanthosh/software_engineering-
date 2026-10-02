import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { AGENCY_NAME } from '../config'
import Icon from '../components/Icon'
import { VintageFlourish } from '../components/Ornaments'

export default function Login() {
  const { login, logout, loading } = useAuth()
  const navigate = useNavigate()
  const [selectedRole, setSelectedRole] = useState(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const user = await login(username, password)
      if (!selectedRole) {
        throw new Error('Please select a role before signing in.')
      }
      const userRole = (user.Role || '').toLowerCase()
      const expectedRole = selectedRole.toLowerCase()
      if (userRole !== expectedRole) {
        // Clear stored auth before showing mismatch error
        logout();
        const roleNames = { manager: 'manager', delivery_staff: 'delivery staff', customer: 'customer' };
        const friendly = roleNames[expectedRole] || expectedRole;
        throw new Error(`No ${friendly} with this username.`);
      }
      if (userRole === 'manager') navigate('/', { replace: true })
      else if (userRole === 'delivery_staff') navigate('/my-deliveries', { replace: true })
      else if (userRole === 'customer') navigate('/my-account', { replace: true })
      else navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-masthead">
          <div className="login-edition">★ Agency Portal ★</div>
          <VintageFlourish width={180} height={22} className="login-flourish" />
          <h1 className="login-title">{AGENCY_NAME}</h1>
          <div className="login-rule" />
          <p className="login-tagline">Circulation · Delivery · Billing</p>
        </div>

        {!selectedRole ? (
          <div className="login-roles-container">
            <h2 className="login-heading" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>Select Your Role</h2>
            <div className="login-roles">
              <div className="login-role-card" onClick={() => setSelectedRole('manager')} style={{ cursor: 'pointer' }}>
                <Icon name="front" size={20} />
                <strong>Manager</strong>
                <span>Full agency access</span>
              </div>
              <div className="login-role-card" onClick={() => setSelectedRole('delivery_staff')} style={{ cursor: 'pointer' }}>
                <Icon name="truck" size={20} />
                <strong>Delivery Staff</strong>
                <span>Daily route sheet</span>
              </div>
              <div className="login-role-card" onClick={() => setSelectedRole('customer')} style={{ cursor: 'pointer' }}>
                <Icon name="users" size={20} />
                <strong>Customer</strong>
                <span>Account & payments</span>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <h2 className="login-heading">Sign In ({selectedRole.replace('_', ' ')})</h2>

            {error && (
              <div className="login-error">
                <Icon name="alert" size={14} /> {error}
              </div>
            )}

            <div className="login-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoFocus
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Signing in…' : 'Enter the Newsroom'}
            </button>
            <button type="button" className="login-btn" onClick={() => { setSelectedRole(null); setError(''); }} style={{ marginTop: '0.5rem', background: '#e0e0e0', color: '#333' }}>
              Back to roles
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
