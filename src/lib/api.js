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
      headers: (() => {
        const h = {}
        if (body !== undefined) h['Content-Type'] = 'application/json'
        const tk = localStorage.getItem('na_token')
        if (tk) h['Authorization'] = `Bearer ${tk}`
        return Object.keys(h).length ? h : undefined
      })(),
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

  // === Manager: Subscription Requests ===
  subscriptionRequests: {
    list: async () => {
      return JSON.parse(localStorage.getItem('na_sub_reqs') || '[]');
    },
    review: async (id, body) => {
      const reqs = JSON.parse(localStorage.getItem('na_sub_reqs') || '[]');
      const idx = reqs.findIndex(r => r.RequestID === id);
      if (idx >= 0) {
        reqs[idx].Status = body.Status;
        reqs[idx].ManagerNotes = body.ManagerNotes;
        
        // If approved, modify the database!
        if (body.Status === 'approved') {
          const req = reqs[idx];
          if (req.ActionType === 'Add') {
            const date = new Date();
            date.setDate(date.getDate() + 8); // 1-week rule
            
            // Get current subscriptions to check if they already have this publication
            const custSubs = await request('/subscriptions', { params: { customer_id: req.CustomerID } });
            const currentSub = custSubs
              .filter(s => s.PublicationID === req.PublicationID && s.Status === 'Active')
              .sort((a, b) => new Date(b.EffectiveDate) - new Date(a.EffectiveDate))[0];
              
            const newQuantity = currentSub ? Number(currentSub.Quantity) + Number(req.Quantity) : Number(req.Quantity);

            // In the real system we post to the subscriptions endpoint
            await request(`/customers/${req.CustomerID}/subscriptions`, {
              method: 'POST',
              body: {
                CustomerID: req.CustomerID,
                PublicationID: req.PublicationID,
                Quantity: newQuantity,
                EffectiveDate: date.toISOString().split('T')[0],
                Status: 'Active'
              }
            });
          } else if (req.ActionType === 'Delete') {
            // For delete, they request to remove N copies. We should update the quantity or cancel it.
            const custSubs = await request('/subscriptions', { params: { customer_id: req.CustomerID } });
            const currentSub = custSubs.find(s => s.SubscriptionID === req.SubscriptionID);
            if (currentSub) {
              const remaining = Number(currentSub.Quantity) - Number(req.Quantity);
              if (remaining > 0) {
                const date = new Date();
                date.setDate(date.getDate() + 8);
                await request(`/customers/${req.CustomerID}/subscriptions`, {
                  method: 'POST',
                  body: {
                    CustomerID: req.CustomerID,
                    PublicationID: req.PublicationID,
                    Quantity: remaining,
                    EffectiveDate: date.toISOString().split('T')[0],
                    Status: 'Active'
                  }
                });
              } else {
                await request(`/subscriptions/${req.SubscriptionID}`, { method: 'DELETE' });
              }
            }
          }
        }
        localStorage.setItem('na_sub_reqs', JSON.stringify(reqs));
      }
      return { success: true };
    },
  },

  // === Customer self-service ===
  me: {
    overdue: () => request('/me/overdue'),
    subscriptions: () => request('/me/subscriptions'),
    vacationHolds: () => request('/me/vacation-holds'),
    createVacationHold: (body) => request('/me/vacation-holds', { method: 'POST', body }),
    paymentRequests: () => request('/me/payment-requests'),
    createPaymentRequest: (body) => request('/me/payment-requests', { method: 'POST', body }),
    subscriptionRequests: async () => {
      const user = JSON.parse(localStorage.getItem('na_user') || '{}');
      const reqs = JSON.parse(localStorage.getItem('na_sub_reqs') || '[]');
      return reqs.filter(r => r.CustomerID === user.LinkedID);
    },
    createSubscriptionRequest: async (body) => {
      const user = JSON.parse(localStorage.getItem('na_user') || '{}');
      const reqs = JSON.parse(localStorage.getItem('na_sub_reqs') || '[]');
      
      const newReq = {
        RequestID: Date.now(),
        CustomerID: user.LinkedID,
        CustomerName: user.DisplayName || user.Username,
        CreatedAt: new Date().toISOString(),
        Status: 'pending',
        ...body
      };
      
      reqs.push(newReq);
      localStorage.setItem('na_sub_reqs', JSON.stringify(reqs));
      return newReq;
    },
  },

  // === Delivery staff self-service ===
  myDeliveries: {
    list: (params) => request('/my-deliveries', { params }),
    setStatus: (ids, status) =>
      request('/my-deliveries/batch-update', { method: 'PUT', body: { updates: ids.map((deliveryId) => ({ deliveryId, status })) } }),
  },

  // === Payment verification (manager) ===
  paymentRequests: {
    list: (params) => request('/payment-requests', { params }),
    review: (id, body) => request(`/payment-requests/${id}`, { method: 'PUT', body }),
  },

  auth: {
    requestOtp: (body) => request('/auth/request-otp', { method: 'POST', body }),
    changeCredentials: (body) => request('/auth/change-credentials', { method: 'POST', body }),
  },

  users: {
    list: () => request('/auth/users'),
    register: (body) => request('/auth/register', { method: 'POST', body }),
    requestDeleteOtp: (body) => request('/auth/request-delete-otp', { method: 'POST', body }),
    delete: (userId, otp) => request(`/auth/users/${userId}?otp=${encodeURIComponent(otp)}`, { method: 'DELETE' }),
  },
}
