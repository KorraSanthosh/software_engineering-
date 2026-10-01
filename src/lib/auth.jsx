import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { API_BASE } from './api'

const AuthContext = createContext(null)

const TOKEN_KEY = 'na_token'
const USER_KEY = 'na_user'

async function authRequest(path, { method = 'GET', body, token } = {}) {
  const url = API_BASE + '/api' + path
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`
  let res
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Cannot reach the API server.')
  }
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    let msg = data?.detail ?? data?.message ?? data
    if (typeof msg !== 'string') msg = `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(USER_KEY)
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [loading, setLoading] = useState(false)

  const login = useCallback(async (username, password) => {
    setLoading(true)
    try {
      const data = await authRequest('/auth/login', {
        method: 'POST',
        body: { username, password },
      })
      const tok = data.access_token
      const usr = data.user
      localStorage.setItem(TOKEN_KEY, tok)
      localStorage.setItem(USER_KEY, JSON.stringify(usr))
      setToken(tok)
      setUser(usr)
      return usr
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  // Verify token is still valid on mount
  useEffect(() => {
    if (!token) return
    authRequest('/auth/me', { token })
      .then(u => {
        setUser(u)
        localStorage.setItem(USER_KEY, JSON.stringify(u))
      })
      .catch(() => logout())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    isAuthenticated: !!user && !!token,
    isManager: user?.Role === 'manager',
    isDeliveryStaff: user?.Role === 'delivery_staff',
    isCustomer: user?.Role === 'customer',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}
