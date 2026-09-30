const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})
const inrShort = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})
const intFmt = new Intl.NumberFormat('en-IN')

export const money = (v) => (v == null || v === '' || isNaN(Number(v)) ? '—' : inr.format(Number(v)))
export const moneyShort = (v) => (v == null || isNaN(Number(v)) ? '—' : inrShort.format(Number(v)))
export const int = (v) => (v == null || isNaN(Number(v)) ? '—' : intFmt.format(Number(v)))
export const pct = (v, d = 1) => (v == null || isNaN(Number(v)) ? '—' : `${(Number(v) * 100).toFixed(d)}%`)

/** Parse "YYYY-MM-DD" (or ISO datetime) as a *local* date, avoiding UTC off-by-one. */
export function parseDate(v) {
  if (!v) return null
  if (v instanceof Date) return v
  const s = String(v)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(s)
  return isNaN(d) ? null : d
}

export function date(v, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  const d = parseDate(v)
  return d ? d.toLocaleDateString('en-IN', opts) : '—'
}

export function monthLabel(v, long = false) {
  const d = parseDate(v)
  return d ? d.toLocaleDateString('en-IN', { month: long ? 'long' : 'short', year: 'numeric' }) : '—'
}

/** Local date → "YYYY-MM-DD" */
export function isoDate(d = new Date()) {
  const x = d instanceof Date ? d : parseDate(d)
  if (!x) return ''
  const mm = String(x.getMonth() + 1).padStart(2, '0')
  const dd = String(x.getDate()).padStart(2, '0')
  return `${x.getFullYear()}-${mm}-${dd}`
}

export function firstOfMonth(d = new Date()) {
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1))
}

export function addDays(d, n) {
  const x = parseDate(d) || new Date()
  const y = new Date(x)
  y.setDate(y.getDate() + n)
  return y
}

export function daysBetween(a, b) {
  const x = parseDate(a)
  const y = parseDate(b)
  if (!x || !y) return null
  return Math.round((y - x) / 86400000)
}

export const longToday = () =>
  new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
