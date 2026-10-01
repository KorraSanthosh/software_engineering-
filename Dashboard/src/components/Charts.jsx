import { useEffect, useMemo, useRef, useState } from 'react'

/** Track the rendered width so the SVG draws at 1:1 scale (text stays legible). */
function useWidth(fallback = 640) {
  const ref = useRef(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function niceMax(v) {
  if (!v || v <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / exp
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return n * exp
}

function compact(v) {
  const n = Number(v)
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)}L`
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(Math.round(n))
}

/** Rounded-top bar path anchored flat to the baseline. */
function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`
}

/**
 * Column chart. data: [{ label, value, ...segments }]
 * series (optional): [{ key, label, color }] to stack segments.
 */
export function ColumnChart({ data, series, height = 230, format = compact, tooltip }) {
  const [wrap, W] = useWidth()
  const [hover, setHover] = useState(null)
  const H = height
  const m = { t: 12, r: 8, b: 26, l: 42 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b

  const segs = series || [{ key: 'value', color: 'var(--ink)' }]
  const totals = data.map((d) => segs.reduce((s, k) => s + (Number(d[k.key]) || 0), 0))
  const max = niceMax(Math.max(0, ...totals))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const step = iw / Math.max(1, data.length)
  const bw = Math.max(4, Math.min(38, step * 0.62))
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(iw / 56)))

  return (
    <div className="chart" ref={wrap} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Column chart">
        <g className="grid">
          {ticks.map((t, i) => (
            <line key={i} x1={m.l} x2={W - m.r} y1={m.t + ih - (t / max) * ih} y2={m.t + ih - (t / max) * ih} />
          ))}
        </g>
        <g className="axis">
          {ticks.map((t, i) => (
            <text key={i} x={m.l - 8} y={m.t + ih - (t / max) * ih + 3} textAnchor="end">{format(t)}</text>
          ))}
          {data.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={i} x={m.l + step * i + step / 2} y={H - 8} textAnchor="middle">{d.label}</text>
            ) : null,
          )}
        </g>
        {data.map((d, i) => {
          const x = m.l + step * i + (step - bw) / 2
          let acc = 0
          const parts = segs.map((s, si) => {
            const v = Number(d[s.key]) || 0
            const h = (v / max) * ih
            const y = m.t + ih - acc - h
            acc += h
            const isTop = si === segs.length - 1 || segs.slice(si + 1).every((n) => !(Number(d[n.key]) > 0))
            // 2px surface gap between stacked segments
            const gap = si > 0 && h > 2 ? 2 : 0
            return isTop ? (
              <path key={s.key} d={barPath(x, y, bw, h - gap)} fill={s.color} opacity={hover == null || hover === i ? 1 : 0.35} />
            ) : (
              <rect key={s.key} x={x} y={y} width={bw} height={Math.max(0, h - gap)} fill={s.color} opacity={hover == null || hover === i ? 1 : 0.35} />
            )
          })
          return (
            <g key={i}>
              {parts}
              <rect
                x={m.l + step * i}
                y={m.t}
                width={step}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          )
        })}
        <line className="baseline" x1={m.l} x2={W - m.r} y1={m.t + ih} y2={m.t + ih} />
      </svg>
      {hover != null && (
        <div
          className="chart-tip"
          style={{ left: `${((m.l + step * hover + step / 2) / W) * 100}%`, top: `${((m.t + ih - (totals[hover] / max) * ih) / H) * 100}%` }}
        >
          {tooltip ? tooltip(data[hover]) : `${data[hover].label}: ${format(totals[hover])}`}
        </div>
      )}
      {series && series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Single-series line/area chart with crosshair tooltip. data: [{ label, value }] */
export function LineChart({ data, height = 200, format = compact, tooltip, color = 'var(--accent)' }) {
  const [wrap, W] = useWidth()
  const [hover, setHover] = useState(null)
  const H = height
  const m = { t: 12, r: 10, b: 26, l: 42 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const max = niceMax(Math.max(0, ...data.map((d) => Number(d.value) || 0)))
  const ticks = [0, 0.5, 1].map((t) => t * max)
  const pts = useMemo(
    () =>
      data.map((d, i) => [
        m.l + (data.length === 1 ? iw / 2 : (iw * i) / (data.length - 1)),
        m.t + ih - ((Number(d.value) || 0) / max) * ih,
      ]),
    [data, iw, ih, max, m.l, m.t],
  )
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
  const area = pts.length ? `${line} L${pts[pts.length - 1][0]},${m.t + ih} L${pts[0][0]},${m.t + ih} Z` : ''
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(iw / 64)))

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    let best = 0
    pts.forEach((p, i) => {
      if (Math.abs(p[0] - x) < Math.abs(pts[best][0] - x)) best = i
    })
    setHover(best)
  }

  return (
    <div className="chart" ref={wrap} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Line chart" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <g className="grid">
          {ticks.map((t, i) => (
            <line key={i} x1={m.l} x2={W - m.r} y1={m.t + ih - (t / max) * ih} y2={m.t + ih - (t / max) * ih} />
          ))}
        </g>
        <g className="axis">
          {ticks.map((t, i) => (
            <text key={i} x={m.l - 8} y={m.t + ih - (t / max) * ih + 3} textAnchor="end">{format(t)}</text>
          ))}
          {data.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={i} x={pts[i][0]} y={H - 8} textAnchor="middle">{d.label}</text>
            ) : null,
          )}
        </g>
        <path d={area} fill={color} opacity="0.08" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <line className="baseline" x1={m.l} x2={W - m.r} y1={m.t + ih} y2={m.t + ih} />
        {hover != null && (
          <>
            <line x1={pts[hover][0]} x2={pts[hover][0]} y1={m.t} y2={m.t + ih} stroke="var(--ink-3)" strokeDasharray="3 3" />
            <circle cx={pts[hover][0]} cy={pts[hover][1]} r="5" fill={color} stroke="var(--card)" strokeWidth="2" />
          </>
        )}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: `${(pts[hover][0] / W) * 100}%`, top: `${(pts[hover][1] / H) * 100}%` }}>
          {tooltip ? tooltip(data[hover]) : `${data[hover].label}: ${format(data[hover].value)}`}
        </div>
      )}
    </div>
  )
}

/** Horizontal ranked bars. items: [{ label, value, display }] */
export function BarList({ items, tone }) {
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0))
  return (
    <div className="bar-list">
      {items.map((it) => (
        <div className="bar-row" key={it.label} title={`${it.label}: ${it.display ?? it.value}`}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
          <span className="track">
            <span className={`fill${tone === 'red' ? ' red' : ''}`} style={{ width: `${((Number(it.value) || 0) / max) * 100}%` }} />
          </span>
          <span className="v">{it.display ?? it.value}</span>
        </div>
      ))}
    </div>
  )
}
