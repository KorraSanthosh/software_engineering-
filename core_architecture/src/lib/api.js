// ---------------------------------------------------------------------------
// API client — every backend URL the UI uses lives in this one file.
// Base URL comes from VITE_API_URL (see .env.example); defaults to the
// FastAPI dev server on :8000. All backend routes live under /api.
// ---------------------------------------------------------------------------
export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const PREFIX = '/api'

async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(API_BASE + PREFIX + path)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
    })
  }
  let res
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error(`Cannot reach the API at ${API_BASE}. Is the backend running?`)
  }
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    let msg = data?.detail ?? data?.message ?? data
    if (Array.isArray(msg)) msg = msg.map((d) => `${(d.loc || []).slice(1).join('.')}: ${d.msg}`).join('; ')
    throw new Error(typeof msg === 'string' && msg ? msg : `Request failed (${res.status})`)
  }
  return data
}

const crud = (base) => ({
  list: (params) => request(base, { params }),
  get: (id) => request(`${base}/${id}`),
  create: (body) => request(base, { method: 'POST', body }),
  update: (id, body) => request(`${base}/${id}`, { method: 'PUT', body }),
  remove: (id) => request(`${base}/${id}`, { method: 'DELETE' }),
})

export const api = {
  health: () => request('/health'),

  zones: crud('/zones'),
  deliveryPersons: crud('/delivery-persons'),
  customers: {
    ...crud('/customers'),
    // Rule 4: flag reminders (>30 days) and suspend customers with dues older than 60 days
    autoSuspend: () => request('/system/process-overdues', { method: 'POST' }),
  },
  publications: crud('/publications'),
  subscriptions: {
    ...crud('/subscriptions'),
    // original endpoint — enforces the one-week advance notice rule
    create: (body) => request(`/customers/${body.CustomerID}/subscriptions`, { method: 'POST', body }),
  },
  vacationHolds: {
    ...crud('/vacation-holds'),
    // original endpoint — the "out of station" requirement
    create: (body) => request(`/customers/${body.CustomerID}/vacations`, { method: 'POST', body }),
  },

  deliveries: {
    list: (params) => request('/deliveries', { params }),
    // Rules 1 + 3: build the day's ledger in route order, skipping holds, locking prices
    generate: (date) => request('/deliveries/generate', { method: 'POST', params: { date } }),
    // Printable route for one delivery person (original endpoint)
    route: (date, deliveryPersonId) => request('/deliveries/routes', { params: { date, deliveryPersonId } }),
    // original batch endpoint: [{ deliveryId, status }]
    setStatus: (ids, status) =>
      request('/deliveries/batch-update', { method: 'PUT', body: { updates: ids.map((deliveryId) => ({ deliveryId, status })) } }),
  },

  invoices: {
    list: (params) => request('/invoices', { params }),
    get: (id) => request(`/invoices/${id}`),
    // invoices dated the 1st of `month` bill the previous month's deliveries
    generate: (month) => request('/invoices/generate-monthly', { method: 'POST', body: { month } }),
    markReminder: (id) => request(`/invoices/${id}/reminder`, { method: 'POST' }),
  },

  payments: crud('/payments'),

  reports: {
    dashboard: () => request('/reports/dashboard'),
    // Rule 2: SUM(QuantityDelivered × PriceAtDelivery) × CommissionRate
    commission: async (monthIso) => {
      const [year, month] = monthIso.split('-').map(Number)
      const r = await request('/reports/commissions', { params: { year, month } })
      return r?.commissions ?? []
    },
    summary: (year, month) => request('/reports/agency-summary', { params: { year, month } }),
  },
}
