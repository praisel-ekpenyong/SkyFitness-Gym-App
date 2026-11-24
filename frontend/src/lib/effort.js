import { weekKey, mondayOf, workoutTimestamp, assertClock } from './dates.js'
import { doneWorkSets } from './workout-sets.js'

export const EFFORT = {
  rir: { f: 'rir', hd: 'RIR', step: 0.5, min: 0, max: 10 },
  rpe: { f: 'rpe', hd: 'RPE', step: 0.5, min: 6, max: 10 }
}

export function stepEffort(kind, cur, dir) {
  const e = EFFORT[kind]
  if (!e) return cur ?? null
  if (cur == null) return dir < 0 ? null : e.min
  const n = Math.round((cur + dir * e.step) * 100) / 100
  if (dir < 0 && n < e.min) return null
  return dir > 0 ? Math.min(e.max, n) : Math.max(e.min, n)
}

export const capEffort = (kind, v) =>
  (v == null || !EFFORT[kind] ? v : Math.min(EFFORT[kind].max, v))

export const floorEffort = (kind, v) =>
  (v == null || !EFFORT[kind] ? v : Math.max(EFFORT[kind].min, v))

export const effortOf = S => {
  const e = S && S.effort
  return e === 'none' || EFFORT[e] ? e : 'none'
}

export const HARD_RIR = 3
export const MIN_RATED = 5

export const rirOf = s =>
  !s ? null : s.rir != null ? s.rir : s.rpe != null ? 10 - s.rpe : null

export const toScale = (kind, rir) =>
  rir == null ? null : Math.round((kind === 'rpe' ? 10 - rir : rir) * 10) / 10

export function displayScale(S) {
  const k = effortOf(S)
  if (EFFORT[k]) return k
  let rir = 0, rpe = 0
  eachDoneSet(S, s => { if (s.rir != null) rir++; else if (s.rpe != null) rpe++ })
  return rpe > rir ? 'rpe' : 'rir'
}
/**
 * Label the effort scale for display headers.
 *
 * @param {string} kind - Effort scale key ('rir' or 'rpe') from displayScale; other values throw.
 * @returns {string} Display header for the scale.
 */
export const scaleName = (kind) => EFFORT[kind].hd

function eachDoneSet(S, fn) {
  for (const w of S?.workouts || []) {
    for (const e of w?.entries || []) {
      for (const s of doneWorkSets(e)) fn(s, w, e)
    }
  }
}

const inWindow = (w, days, now) =>
  !days || workoutTimestamp(w) > now - days * 86400000

/**
 * Average the rated effort of a set list in RIR units.
 *
 * @param {Array<Object>|null|undefined} sets - Sets carrying rir or rpe; unrated sets are ignored, nullish counts as empty.
 * @returns {number|null} Mean RIR across rated sets, or null when none are rated.
 */
export const avgRir = sets => {
  const vs = (sets || []).map(rirOf).filter(v => v != null)
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null
}

export function effortSummary(S, days, now) {
  assertClock(now)
  let done = 0, rated = 0, sum = 0, hard = 0
  eachDoneSet(S, (s, w) => {
    if (!inWindow(w, days, now)) return
    done++
    const r = rirOf(s)
    if (r == null) return
    rated++; sum += r
    if (r <= HARD_RIR) hard++
  })
  return {
    done, rated, hard,
    avg: rated >= MIN_RATED ? sum / rated : null,
    hardPct: rated >= MIN_RATED ? hard / rated : null
  }
}

export function hasEffort(S) {
  let any = false
  eachDoneSet(S, s => { if (!any && rirOf(s) != null) any = true })
  return any
}

export function effortWeeks(S, days, now) {
  assertClock(now)
  const wk = new Map()
  eachDoneSet(S, (s, w) => {
    if (!inWindow(w, days, now)) return
    const k = weekKey(w.d)
    let e = wk.get(k)
    if (!e) wk.set(k, e = { k, t: mondayNoon(w.d), sum: 0, n: 0, sets: 0 })
    e.sets++
    const r = rirOf(s)
    if (r != null) { e.sum += r; e.n++ }
  })
  return [...wk.values()].filter(e => e.n >= 2).sort((a, b) => a.t - b.t)
    .map(e => ({ t: e.t, rir: e.sum / e.n, n: e.n, sets: e.sets }))
}
// Midday on the Monday of the week holding the day key, as epoch milliseconds.
const mondayNoon = iso => +new Date(mondayOf(iso) + 'T12:00:00')

export const BUCKETS = 4
export function effortHistogram(S, days, now) {
  assertClock(now)
  const bins = new Array(BUCKETS + 1).fill(0)
  let rated = 0
  eachDoneSet(S, (s, w) => {
    if (!inWindow(w, days, now)) return
    const r = rirOf(s)
    if (r == null) return
    rated++
    bins[Math.min(BUCKETS, Math.max(0, Math.floor(r)))]++
  })
  return bins.map((n, i) => ({ rir: i, tail: i === BUCKETS, n, pct: rated ? n / rated : 0 }))
}

export const isHardSet = s => { const r = rirOf(s); return r != null && r <= HARD_RIR }
