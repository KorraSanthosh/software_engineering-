import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes, Link } from 'react-router-dom'
import './App.css'

import Icon from './components/Icon'
import { VintageFlourish } from './components/Ornaments'
import { ToastProvider } from './components/ui'
import { api, API_BASE } from './lib/api'
import { longToday } from './lib/format'
import { AGENCY_CITY, AGENCY_NAME, AGENCY_TAGLINE } from './config'

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

const SECTIONS = [
  { to: '/', label: 'Front Page', icon: 'front', end: true },
  { to: '/customers', label: 'Customers', icon: 'users' },
  { to: '/subscriptions', label: 'Subscriptions', icon: 'repeat' },
  { to: '/publications', label: 'Publications', icon: 'paper' },
  { to: '/vacation-holds', label: 'Vacation Holds', icon: 'pause' },
  { to: '/deliveries', label: 'Daily Deliveries', icon: 'truck' },
  { to: '/routes', label: 'Zones & Staff', icon: 'map' },
  { to: '/billing', label: 'Billing', icon: 'receipt' },
  { to: '/payments', label: 'Payments', icon: 'wallet' },
]

// Day-of-year, printed like a newspaper issue number
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

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
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
                <Link to="/" className="mast">{AGENCY_NAME}</Link>
                <div className="masthead-double-rule" />
                <div className="tagline">{AGENCY_TAGLINE}</div>
              </div>

              <div className="masthead-strip">
                <span>The Daily Record & Ledger</span>
                <span className="hide-sm">Routes · Subscriptions · Holds · Invoices · Receipts</span>
                <span>{longToday()} · Edition No. {editionNo()}</span>
              </div>
            </header>

            <div className="sections">
              <nav aria-label="Sections">
                {SECTIONS.map((s) => (
                  <NavLink key={s.to} to={s.to} end={s.end}>
                    <Icon name={s.icon} size={15} />
                    {s.label}
                  </NavLink>
                ))}
              </nav>
            </div>

          <main className="page">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/subscriptions" element={<Subscriptions />} />
              <Route path="/publications" element={<Publications />} />
              <Route path="/vacation-holds" element={<VacationHolds />} />
              <Route path="/deliveries" element={<Deliveries />} />
              <Route path="/routes" element={<RoutesAndStaff />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>

          <footer className="colophon">
            <span>{AGENCY_NAME} · Agency Desk</span>
            <span>Printed on demand · {new Date().getFullYear()}</span>
          </footer>
        </div>
      </div>
    </ToastProvider>
  </BrowserRouter>
  )
}
