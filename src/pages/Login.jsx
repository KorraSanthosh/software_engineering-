import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { AGENCY_NAME } from '../config'
import Icon from '../components/Icon'
import { VintageFlourish } from '../components/Ornaments'

export default function Login() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const user = await login(username, password)
      if (user.Role === 'manager') navigate('/', { replace: true })
      else if (user.Role === 'delivery_staff') navigate('/my-deliveries', { replace: true })
      else if (user.Role === 'customer') navigate('/my-account', { replace: true })
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

        <form onSubmit={handleSubmit} className="login-form">
          <h2 className="login-heading">Sign In to Your Desk</h2>

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
        </form>

        <div className="login-roles">
          <div className="login-role-card">
            <Icon name="front" size={20} />
            <strong>Manager</strong>
            <span>Full agency access</span>
          </div>
          <div className="login-role-card">
            <Icon name="truck" size={20} />
            <strong>Delivery Staff</strong>
            <span>Daily route sheet</span>
          </div>
          <div className="login-role-card">
            <Icon name="users" size={20} />
            <strong>Customer</strong>
            <span>Account & payments</span>
          </div>
        </div>
      </div>
    </div>
  )
}
