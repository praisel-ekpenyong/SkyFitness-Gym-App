import { useLayoutEffect, useRef, useState } from 'react'
import { fmtNum, fmtDate, MONTHS, isoOf } from '../lib/format.js'
import { t } from '../lib/i18n.js'

const FALLBACK_W = 340   // before layout, and in environments that have no layout at all

// Drawn in real pixels from a measured width rather than stretching a fixed viewBox: a viewBox
// scales its labels with the chart, so the same 11px tick came out 30px tall on a desktop card.
function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(FALLBACK_W)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => { const cw = el.clientWidth; if (cw > 0) setW(cw) }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

// points: [{ t: ms, y: num, d?: iso, m?: 0..1, note?: str }] sorted by t.
//   m    marks the point — a second reading carried by the same dot (bigger and more solid =
//        more of it). Used for effort on the weight curve, where the two belong on one line:
//        the same weight with less left in the tank is not the same session.
//   note extra text for that point's tooltip.
// opts: { h, unit, color, axes, goal, invert }
//   invert flips the y axis, for a scale that counts down as it gets harder (RIR). Without it
//   a curve of reps-in-reserve reads upside down, with the hardest sets at the floor.
export default function LineChart({ points, h = 150, unit = '', color = 'var(--data)', axes = true, goal = null, invert = false }) {
  const [wrapRef, W] = useWidth()
  const tipRef = useRef(null)
  const [hover, setHover] = useState(null)   // { x, y, iso, v }

  // The tooltip is placed after layout, from its measured size, so it can never hang off the
  // clip at the first or last point. Writing straight to the node keeps this off the render path.
  useLayoutEffect(() => {
    const tip = tipRef.current, wrap = wrapRef.current
    if (!hover || !tip || !wrap) return
    const cw = wrap.clientWidth
    const tw = tip.offsetWidth, th = tip.offsetHeight
    const M = 4
    tip.style.left = Math.max(M, Math.min(cw - tw - M, hover.x - tw / 2)) + 'px'
    // Parked at the top, but dropped below the point when it would cover the value it reports.
    tip.style.top = (hover.y < th + 14 ? Math.min(h - th - M, hover.y + 14) : M) + 'px'
  })

  if (!points || points.length === 0) return <div className="chart-nodata" ref={wrapRef}>{t('No data yet')}</div>
  const H = h
  const P = { l: axes ? 34 : 6, r: 8, t: 10, b: axes ? 22 : 8 }
  const single = points.length === 1
  const pts = single ? [points[0], points[0]] : points
  const ys = pts.map(p => p.y)
  let ymin = Math.min(...ys), ymax = Math.max(...ys)
  if (goal != null && isFinite(goal)) { ymin = Math.min(ymin, goal); ymax = Math.max(ymax, goal) }
  if (ymin === ymax) { ymin -= 1; ymax += 1 }
  const pad = (ymax - ymin) * 0.12; ymin -= pad; ymax += pad
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1
  const X = v => (t1 === t0 ? (P.l + W - P.r) / 2 : P.l + (v - t0) / (t1 - t0) * (W - P.l - P.r))
  const Y = y => {
    const f = (y - ymin) / (ymax - ymin)
    return P.t + (invert ? f : 1 - f) * (H - P.t - P.b)
  }

  const grid = []
  if (axes) {
    const range = ymax - ymin, raw = range / 3
    const pow = Math.pow(10, Math.floor(Math.log10(raw)))
    let step = 10 * pow
    for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) { step = m * pow; break }
    for (let v = Math.ceil(ymin / step) * step; v <= ymax + 1e-9; v += step) {
      const y = Y(v)
      grid.push(<g key={'y' + v}>
        <line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="var(--sep-op)" strokeWidth="1" />
        <text x={P.l - 7} y={y + 4} textAnchor="end" fontSize="11" fill="var(--label-3)">{fmtNum(v)}</text>
      </g>)
    }
    const d0 = new Date(t0), d1 = new Date(t1)
    const ticks = []
    let m = new Date(d0.getFullYear(), d0.getMonth() + 1, 1)
    while (m <= d1) { ticks.push({ t: +m, txt: t(MONTHS[m.getMonth()]) }); m = new Date(m.getFullYear(), m.getMonth() + 1, 1) }
    if (ticks.length === 0 && !single) {
      for (let i = 0; i <= 2; i++) {
        const tv = t0 + (t1 - t0) * i / 2, dd = new Date(tv)
        ticks.push({ t: tv, txt: dd.getDate() + ' ' + t(MONTHS[dd.getMonth()]), anchor: i === 0 ? 'start' : i === 2 ? 'end' : 'middle' })
      }
    }
    const every = Math.max(1, Math.ceil(ticks.length / (W < 480 ? 6 : 10)))
    ticks.forEach((tk, i) => {
      if (i % every) return
      grid.push(<text key={'x' + i} x={X(tk.t)} y={H - 6} textAnchor={tk.anchor || 'middle'} fontSize="11" fill="var(--label-3)">{tk.txt}</text>)
    })
  }

  const poly = pts.map(p => X(p.t).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ')
  const last = pts[pts.length - 1]
  const hoverPts = (single ? [points[0]] : points).map(p => ({ x: X(p.t), y: Y(p.y), iso: p.d || isoOf(new Date(p.t)), v: p.y, note: p.note }))
  const marked = points.some(p => p.m != null)

  const onMove = e => {
    const c = e.touches ? e.touches[0] : e
    if (!c || c.clientX === undefined || !wrapRef.current) return
    const r = wrapRef.current.getBoundingClientRect()
    const vx = (c.clientX - r.left)
    let best = hoverPts[0]
    hoverPts.forEach(p => { if (Math.abs(p.x - vx) < Math.abs(best.x - vx)) best = p })
    setHover(best)
  }

  return (
    <div className="chart-i" ref={wrapRef}
      onMouseMove={onMove} onMouseDown={onMove}
      onMouseLeave={() => setHover(null)}
      onTouchStart={onMove} onTouchMove={onMove}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Chart of {0} readings, latest {1}', points.length, fmtNum(last.y) + (unit ? ' ' + unit : ''))}>
        {grid}
        {goal != null && isFinite(goal) && <>
          <line x1={P.l} y1={Y(goal)} x2={W - P.r} y2={Y(goal)} stroke="var(--label-2)" strokeWidth="1" strokeDasharray="3 3" />
          <text x={W - P.r} y={Y(goal) - 5} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--label-2)">{t('Goal')} {fmtNum(goal)}</text>
        </>}
        <polygon points={`${X(pts[0].t).toFixed(1)},${H - P.b} ${poly} ${X(last.t).toFixed(1)},${H - P.b}`} fill={color} opacity=".1" />
        <polyline points={poly} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {marked && pts.map((p, i) => (p.m == null ? null :
          <circle key={'m' + i} cx={X(p.t)} cy={Y(p.y)} r={2 + p.m * 2.5} fill={color} opacity={0.3 + p.m * 0.7} />))}
        <circle cx={X(last.t)} cy={Y(last.y)} r="3.5" fill={color} />
        {hover && <g>
          <line className="cvl" x1={hover.x} y1={P.t} x2={hover.x} y2={H - P.b} stroke="var(--label-3)" strokeWidth="1" />
          <circle cx={hover.x} cy={hover.y} r="4.5" fill={color} stroke="var(--surface)" strokeWidth="2" />
        </g>}
      </svg>
      {hover && <div className="ctip" ref={tipRef}>
        {fmtDate(hover.iso, true)} · {fmtNum(hover.v)}{unit ? ' ' + unit : ''}{hover.note ? ' · ' + hover.note : ''}
      </div>}
    </div>
  )
}
