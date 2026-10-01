import { useState } from 'react'
import { api } from '../lib/api'
import { useToast } from '../components/ui'

export default function Settings() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ new_username: '', new_password: '', otp: '' })
  const [loading, setLoading] = useState(false)
  const { addToast } = useToast()

  const handleRequestOtp = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.auth.requestOtp({ new_username: form.new_username })
      addToast(res.message || 'OTP sent', 'success')
      setStep(2)
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.auth.changeCredentials(form)
      addToast('Credentials updated successfully. Please log in again.', 'success')
      setStep(1)
      setForm({ new_username: '', new_password: '', otp: '' })
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="desk-layout">
      <div className="desk-main" style={{ maxWidth: '400px', margin: '0 auto' }}>
        <div className="desk-card">
          <h2 className="desk-heading">Settings</h2>
          <p style={{ marginBottom: '1rem', color: '#666' }}>Change your account credentials.</p>
          {step === 1 && (
            <form onSubmit={handleRequestOtp} className="form-stack">
              <label>
                New Username:
                <input type="text" value={form.new_username} onChange={(e) => setForm({...form, new_username: e.target.value})} required minLength={3} maxLength={50} />
              </label>
              <label>
                New Password:
                <input type="password" value={form.new_password} onChange={(e) => setForm({...form, new_password: e.target.value})} required minLength={6} />
              </label>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Requesting...' : 'Request OTP'}
              </button>
            </form>
          )}
          {step === 2 && (
            <form onSubmit={handleVerify} className="form-stack">
              <p style={{ marginBottom: '1rem' }}>An OTP has been sent. Please enter it below.</p>
              <label>
                OTP:
                <input type="text" value={form.otp} onChange={(e) => setForm({...form, otp: e.target.value})} required />
              </label>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Verifying...' : 'Verify & Save'}
              </button>
              <button type="button" onClick={() => setStep(1)} style={{ marginTop: '0.5rem', background: '#e0e0e0', padding: '0.5rem', border: 'none', cursor: 'pointer' }}>
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
