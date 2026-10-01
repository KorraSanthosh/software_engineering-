import { useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { PageHead, Field, useToast } from '../components/ui'
import Icon from '../components/Icon'

export default function Settings() {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ new_username: '', new_password: '', otp: '' })
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const handleRequestOtp = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.auth.requestOtp({ new_username: form.new_username })
      toast(res.message || 'OTP sent')
      setStep(2)
    } catch (e) {
      toast(e.message || 'Failed to request OTP', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.auth.changeCredentials(form)
      toast('Credentials updated successfully. Please log in again.')
      setStep(1)
      setForm({ new_username: '', new_password: '', otp: '' })
    } catch (e) {
      toast(e.message || 'Verification failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageHead
        kicker="Account"
        title="Settings & Security"
        dek="Change your username and password via OTP verification sent to your registered mobile number."
      />

      <div className="panel" style={{ maxWidth: 500, margin: '2rem auto', padding: '2rem' }}>
        <h3 style={{ fontFamily: 'var(--font-head)', margin: '0 0 1.5rem', fontSize: '1.25rem' }}>
          Change Credentials
        </h3>

        {step === 1 && (
          <form onSubmit={handleRequestOtp}>
            <Field label="New Username">
              <input
                type="text"
                value={form.new_username}
                onChange={(e) => setForm({ ...form, new_username: e.target.value })}
                required
                minLength={3}
                maxLength={50}
                placeholder="Enter new username"
              />
            </Field>
            <Field label="New Password">
              <input
                type="password"
                value={form.new_password}
                onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                required
                minLength={6}
                placeholder="Must be at least 6 characters"
              />
            </Field>
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? 'Requesting...' : 'Request OTP'} <Icon name="send" size={14} style={{ marginLeft: 6 }} />
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerify}>
            <div style={{ padding: '0.75rem', background: 'var(--paper-2)', borderRadius: 4, marginBottom: '1.5rem', fontSize: '0.85rem' }}>
              <strong>OTP Sent!</strong>
              <p style={{ margin: '0.25rem 0 0', color: 'var(--ink-2)' }}>
                Please check your registered mobile number for the 6-digit code.
              </p>
            </div>
            <Field label="Verification Code (OTP)">
              <input
                type="text"
                value={form.otp}
                onChange={(e) => setForm({ ...form, otp: e.target.value })}
                required
                placeholder="Enter 6-digit OTP"
                autoComplete="off"
              />
            </Field>
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setStep(1)} className="btn">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? 'Verifying...' : 'Verify & Save'} <Icon name="check" size={14} style={{ marginLeft: 6 }} />
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
