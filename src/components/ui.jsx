import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'

/* ---------------------------------------------------------------
   Page header
---------------------------------------------------------------- */
export function PageHead({ kicker, title, dek, children }) {
  return (
    <header className="page-head">
      <div>
        {kicker && <div className="kicker">{kicker}</div>}
        <h1>{title}</h1>
        {dek && <p className="dek">{dek}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  )
}

/* ---------------------------------------------------------------
   Badges
---------------------------------------------------------------- */
const TONE = {
  active: 'green', delivered: 'green', paid: 'green', cash: 'grey', cheque: 'blue',
  suspended: 'red', failed: 'red', unpaid: 'red', cancelled: 'grey',
  partial: 'amber', pending: 'amber', upcoming: 'blue', ongoing: 'amber', completed: 'grey',
  newspaper: 'grey', magazine: 'blue',
}
export function Badge({ children, tone }) {
  const t = tone || TONE[String(children ?? '').toLowerCase()] || 'grey'
  return <span className={`badge ${t}`}>{children ?? '—'}</span>
}

/* ---------------------------------------------------------------
   States
---------------------------------------------------------------- */
export function Loading({ rows = 6 }) {
  return (
    <div style={{ padding: 18, display: 'grid', gap: 14 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ width: `${92 - ((i * 13) % 35)}%` }} />
      ))}
    </div>
  )
}

export function Empty({ title = 'Nothing here yet', children, action }) {
  return (
    <div className="state">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state error" role="alert">
      <h3>Couldn’t reach the press room</h3>
      <p>{error?.message || String(error)}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          <Icon name="refresh" size={14} /> Try again
        </button>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------
   Modal / Drawer
---------------------------------------------------------------- */
function useEscape(onClose) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}

let openModals = 0

export function Modal({ title, kicker, onClose, children, footer, wide }) {
  useEscape(onClose)
  // lets the print stylesheet print just the open modal (e.g. an invoice)
  useEffect(() => {
    openModals++
    document.body.classList.add('has-modal')
    return () => {
      openModals--
      if (openModals <= 0) document.body.classList.remove('has-modal')
    }
  }, [])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            {kicker && <div className="kicker">{kicker}</div>}
            <h2>{title}</h2>
          </div>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Drawer({ title, kicker, onClose, children, actions }) {
  useEscape(onClose)
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            {kicker && <div className="kicker">{kicker}</div>}
            <h2>{title}</h2>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {actions}
            <button className="btn ghost icon" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        </div>
        <div className="modal-body" style={{ flex: 1 }}>{children}</div>
      </aside>
    </>
  )
}

export function Confirm({ title = 'Are you sure?', message, confirmLabel = 'Delete', onConfirm, onClose, busy }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn danger" onClick={onConfirm} disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="trash" size={14} />} {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  )
}

/* ---------------------------------------------------------------
   Form field
---------------------------------------------------------------- */
export function Field({ label, hint, error, span2, children, htmlFor }) {
  return (
    <div className={`field${span2 ? ' span-2' : ''}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="search">
      <Icon name="search" size={15} />
      <input
        className="input"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
      />
    </div>
  )
}

/* ---------------------------------------------------------------
   Data table with sort + pagination
---------------------------------------------------------------- */
export function DataTable({ columns, rows, rowKey, onRowClick, pageSize = 15, empty, initialSort, flat }) {
  const [sort, setSort] = useState(initialSort || null) // { key, dir }
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    const get = col?.sortValue || ((r) => r[sort.key])
    const out = [...rows].sort((a, b) => {
      const x = get(a)
      const y = get(b)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      if (typeof x === 'number' && typeof y === 'number') return x - y
      const nx = Number(x), ny = Number(y)
      if (!isNaN(nx) && !isNaN(ny) && String(x).trim() !== '' && String(y).trim() !== '') return nx - ny
      return String(x).localeCompare(String(y), undefined, { numeric: true })
    })
    return sort.dir === 'desc' ? out.reverse() : out
  }, [rows, sort, columns])

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pages - 1)
  const slice = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  // reset to first page when data set shrinks
  const prevLen = useRef(rows.length)
  useEffect(() => {
    if (rows.length !== prevLen.current) {
      prevLen.current = rows.length
      setPage(0)
    }
  }, [rows.length])

  const toggle = (key) =>
    setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }))

  if (!rows.length) return <div className={`table-wrap${flat ? ' flat' : ''}`}>{empty || <Empty />}</div>

  return (
    <div className={`table-wrap${flat ? ' flat' : ''}`}>
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => {
              const sortable = c.sortable !== false && !c.actions
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  className={[sortable && 'sortable', c.align === 'right' && 'right'].filter(Boolean).join(' ')}
                  onClick={sortable ? () => toggle(c.key) : undefined}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                  {active && <Icon name={sort.dir === 'asc' ? 'arrowUp' : 'arrowDown'} size={11} style={{ marginLeft: 4, verticalAlign: -1 }} />}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {slice.map((r, i) => (
            <tr
              key={rowKey ? rowKey(r) : i}
              className={onRowClick ? 'clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={[c.align === 'right' && 'right', c.actions && 'actions', c.className].filter(Boolean).join(' ')}
                  onClick={c.actions ? (e) => e.stopPropagation() : undefined}
                >
                  {c.render ? c.render(r) : r[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > pageSize && (
        <div className="pager">
          <span>
            {safePage * pageSize + 1}–{Math.min(sorted.length, (safePage + 1) * pageSize)} of {sorted.length}
          </span>
          <div className="btns">
            <button className="btn sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
              <Icon name="chevL" size={14} />
            </button>
            <span>Page {safePage + 1} / {pages}</span>
            <button className="btn sm" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)} aria-label="Next page">
              <Icon name="chevR" size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------
   Toasts
---------------------------------------------------------------- */
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((message, type = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setItems((xs) => [...xs, { id, message, type }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
