import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes, Link, Navigate } from 'react-router-dom'
import './App.css'

import Icon from './components/Icon'
import { VintageFlourish } from './components/Ornaments'
import { ToastProvider } from './components/ui'
import { api, API_BASE } from './lib/api'
import { longToday } from './lib/format'
import { AGENCY_CITY, AGENCY_NAME, AGENCY_TAGLINE } from './config'
import { AuthProvider, useAuth } from './lib/auth'
import ProtectedRoute from './components/ProtectedRoute'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import Subscriptions from './pages/Subscriptions'
import VacationHolds from './pages/VacationHolds'
import Publications from './pages/Publications'
import RoutesAndStaff from './pages/RoutesAndStaff'
import Deliveries from './pages/Deliveries'
import Billing from './pages/Billing'
import Payments from './pages/Payments'
import NotFound from './pages/NotFound'
import PaymentVerification from './pages/manager/PaymentVerification'
import DeliveryPortal from './pages/delivery/DeliveryPortal'
import CustomerPortal from './pages/customer/CustomerPortal'
import MyOverdue from './pages/customer/MyOverdue'
import MyVacationHolds from './pages/customer/MyVacationHolds'
import MyPaymentRequests from './pages/customer/MyPaymentRequests'

const MANAGER_SECTIONS = [
  { to: '/', label: 'Front Page', icon: 'front', end: true },
  { to: '/customers', label: 'Customers', icon: 'users' },
  { to: '/subscriptions', label: 'Subscriptions', icon: 'repeat' },
  { to: '/publications', label: 'Publications', icon: 'paper' },
  { to: '/vacation-holds', label: 'Vacation Holds', icon: 'pause' },
  { to: '/deliveries', label: 'Daily Deliveries', icon: 'truck' },
  { to: '/routes', label: 'Zones & Staff', icon: 'map' },
  { to: '/billing', label: 'Billing', icon: 'receipt' },
  { to: '/payments', label: 'Payments', icon: 'wallet' },
  { to: '/payment-requests', label: 'Payment Requests', icon: 'check' },
]

const DELIVERY_SECTIONS = [
  { to: '/my-deliveries', label: 'My Deliveries', icon: 'truck', end: true },
]

const CUSTOMER_SECTIONS = [
  { to: '/my-account', label: 'My Account', icon: 'front', end: true },
  { to: '/my-account/overdue', label: 'My Overdue', icon: 'receipt' },
  { to: '/my-account/vacation-holds', label: 'Vacation Holds', icon: 'pause' },
  { to: '/my-account/payment-requests', label: 'Payment Requests', icon: 'wallet' },
]

function editionNo() {
  const now = new Date()
  return Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000)
}

function ApiStatus() {
  const [ok, setOk] = useState(null)
  useEffect(() => {
    let alive = true
    const ping = () =>
      api
        .health()
        .then(() => alive && setOk(true))
        .catch(() => alive && setOk(false))
    ping()
    const t = setInterval(ping, 30000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  return (
    <span className="api-status" title={API_BASE}>
      <span className={`dot${ok === true ? ' ok' : ok === false ? ' bad' : ''}`} />
      {ok === null ? 'Connecting…' : ok ? 'Wire live' : 'Wire down'}
    </span>
  )
}

function RoleLabel({ role }) {
  const labels = {
    manager: 'Manager',
    delivery_staff: 'Delivery Staff',
    customer: 'Customer',
  }
  return <span className="user-role">{labels[role] || role}</span>
}

function AppShell() {
  const { user, isAuthenticated, logout, isManager, isDeliveryStaff, isCustomer } = useAuth()

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  const sections = isManager
    ? MANAGER_SECTIONS
    : isDeliveryStaff
      ? DELIVERY_SECTIONS
      : isCustomer
        ? CUSTOMER_SECTIONS
        : []

  return (
    <div className="shell-wrapper">
      <div className="shell">
        <header className="masthead">
          <div className="masthead-top">
            <span className="masthead-edition-tag">★ Special Edition ★</span>
            <VintageFlourish width={210} height={26} className="masthead-flourish" />
            <div className="masthead-top-right">
              <span className="masthead-city hide-sm">{AGENCY_CITY}</span>
              <ApiStatus />
            </div>
          </div>

          <div className="masthead-title">
            <Link to={isManager ? '/' : isDeliveryStaff ? '/my-deliveries' : '/my-account'} className="mast">
              {AGENCY_NAME}
            </Link>
            <div className="masthead-double-rule" />
            <div className="tagline">{AGENCY_TAGLINE}</div>
          </div>

          <div className="masthead-strip">
            <div className="user-menu">
              <Icon name="users" size={13} />
              <span>{user?.DisplayName || user?.Username}</span>
              <RoleLabel role={user?.Role} />
              <button className="logout-btn" onClick={logout}>Sign Out</button>
            </div>
            <span className="hide-sm">Routes · Subscriptions · Holds · Invoices · Receipts</span>
            <span>{longToday()} · Edition No. {editionNo()}</span>
          </div>
        </header>

        <div className="sections">
          <nav aria-label="Sections">
            {sections.map((s) => (
              <NavLink key={s.to} to={s.to} end={s.end}>
                <Icon name={s.icon} size={15} />
                {s.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <main className="page">
          <Routes>
            {/* Manager routes */}
            <Route path="/" element={<ProtectedRoute roles={['manager']}><Dashboard /></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute roles={['manager']}><Customers /></ProtectedRoute>} />
            <Route path="/subscriptions" element={<ProtectedRoute roles={['manager']}><Subscriptions /></ProtectedRoute>} />
            <Route path="/publications" element={<ProtectedRoute roles={['manager']}><Publications /></ProtectedRoute>} />
            <Route path="/vacation-holds" element={<ProtectedRoute roles={['manager']}><VacationHolds /></ProtectedRoute>} />
            <Route path="/deliveries" element={<ProtectedRoute roles={['manager']}><Deliveries /></ProtectedRoute>} />
            <Route path="/routes" element={<ProtectedRoute roles={['manager']}><RoutesAndStaff /></ProtectedRoute>} />
            <Route path="/billing" element={<ProtectedRoute roles={['manager']}><Billing /></ProtectedRoute>} />
            <Route path="/payments" element={<ProtectedRoute roles={['manager']}><Payments /></ProtectedRoute>} />
            <Route path="/payment-requests" element={<ProtectedRoute roles={['manager']}><PaymentVerification /></ProtectedRoute>} />

            {/* Delivery staff routes */}
            <Route path="/my-deliveries" element={<ProtectedRoute roles={['delivery_staff']}><DeliveryPortal /></ProtectedRoute>} />

            {/* Customer routes */}
            <Route path="/my-account" element={<ProtectedRoute roles={['customer']}><CustomerPortal /></ProtectedRoute>} />
            <Route path="/my-account/overdue" element={<ProtectedRoute roles={['customer']}><MyOverdue /></ProtectedRoute>} />
            <Route path="/my-account/vacation-holds" element={<ProtectedRoute roles={['customer']}><MyVacationHolds /></ProtectedRoute>} />
            <Route path="/my-account/payment-requests" element={<ProtectedRoute roles={['customer']}><MyPaymentRequests /></ProtectedRoute>} />

            <Route path="/login" element={<Navigate to={isManager ? '/' : isDeliveryStaff ? '/my-deliveries' : '/my-account'} replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        <footer className="colophon">
          <span>{AGENCY_NAME} · Agency Desk</span>
          <span>Printed on demand · {new Date().getFullYear()}</span>
        </footer>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
