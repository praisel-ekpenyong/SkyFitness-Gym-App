import { weekKey, mondayOf, workoutTimestamp, assertClock, DAY_MS, parseDay } from './dates.js'
import { doneWorkSets } from './workout-sets.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Workout} Workout */
/** @typedef {import('./types.js').Entry} Entry */
/** @typedef {import('./types.js').SetRow} SetRow */
/** @typedef {import('./types.js').EffortScale} EffortScale */

export const EFFORT = {
  rir: { f: 'rir', hd: 'RIR', step: 0.5, min: 0, max: 10 },
  rpe: { f: 'rpe', hd: 'RPE', step: 0.5, min: 6, max: 10 }
}

/**
 * @param {'rir' | 'rpe'} kind
 * @param {number | null | undefined} cur
 * @param {number} dir
 * @returns {number | null}
 */
export function stepEffort(kind, cur, dir) {
  const e = EFFORT[kind]
  if (!e) return cur ?? null
  if (cur == null) return dir < 0 ? null : e.min
  const n = Math.round((cur + dir * e.step) * 100) / 100
  if (dir < 0 && n < e.min) return null
  return dir > 0 ? Math.min(e.max, n) : Math.max(e.min, n)
}

/** @param {'rir' | 'rpe'} kind @param {number | null | undefined} v @returns {number | null | undefined} */
export const capEffort = (kind, v) =>
  (v == null || !EFFORT[kind] ? v : Math.min(EFFORT[kind].max, v))

/** @param {'rir' | 'rpe'} kind @param {number | null | undefined} v @returns {number | null | undefined} */
export const floorEffort = (kind, v) =>
  (v == null || !EFFORT[kind] ? v : Math.max(EFFORT[kind].min, v))

/** @param {Profile | null | undefined} S @returns {EffortScale} */
export const effortOf = S => {
  const e = S && S.effort
  return e === 'none' || e === 'rir' || e === 'rpe' ? e : 'none'
}

export const HARD_RIR = 3
export const MIN_RATED = 5

/** @param {Partial<SetRow> | null | undefined} s @returns {number | null} */
export const rirOf = s =>
  !s ? null : s.rir != null ? s.rir : s.rpe != null ? 10 - s.rpe : null

/** @param {'rir' | 'rpe'} kind @param {number | null | undefined} rir @returns {number | null} */
export const toScale = (kind, rir) =>
  rir == null ? null : Math.round((kind === 'rpe' ? 10 - rir : rir) * 10) / 10

/** @param {Profile | null | undefined} S @returns {'rir' | 'rpe'} */
export function displayScale(S) {
  const k = effortOf(S)
  if (k === 'rir' || k === 'rpe') return k
  let rir = 0, rpe = 0
  eachDoneSet(S, s => { if (s.rir != null) rir++; else if (s.rpe != null) rpe++ })
  return rpe > rir ? 'rpe' : 'rir'
}
/**
 * Label the effort scale for display headers.
 *
 * @param {'rir' | 'rpe'} kind - Effort scale key ('rir' or 'rpe') from displayScale; other values throw.
 * @returns {string} Display header for the scale.
 */
export const scaleName = (kind) => EFFORT[kind].hd

/**
 * @param {Profile | null | undefined} S
 * @param {(set: SetRow, workout: Workout, entry: Entry) => void} fn
 */
function eachDoneSet(S, fn) {
  for (const w of S?.workouts || []) {
    for (const e of w?.entries || []) {
      for (const s of doneWorkSets(e)) fn(s, w, e)
    }
  }
}

/** @param {Workout} w @param {number | undefined} days @param {number} now @returns {boolean} */
const inWindow = (w, days, now) =>
  !days || workoutTimestamp(w) > now - days * DAY_MS

/**
 * Average the rated effort of a set list in RIR units.
 *
 * @param {Array<SetRow> | null | undefined} sets - Sets carrying rir or rpe; unrated sets are ignored, nullish counts as empty.
 * @returns {number | null} Mean RIR across rated sets, or null when none are rated.
 */
export const avgRir = sets => {
  const vs = (sets || []).map(rirOf).filter(v => v != null)
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null
}

/** @param {Profile | null | undefined} S @param {number | undefined} days @param {number} now - The clock: epoch milliseconds. */
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

/** @param {Profile | null | undefined} S @returns {boolean} */
export function hasEffort(S) {
  let any = false
  eachDoneSet(S, s => { if (!any && rirOf(s) != null) any = true })
  return any
}

/** @param {Profile | null | undefined} S @param {number | undefined} days @param {number} now - The clock: epoch milliseconds. */
export function effortWeeks(S, days, now) {
  assertClock(now)
  /** @type {Map<string, { k: string, t: number, sum: number, n: number, sets: number }>} */
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
/**
 * Midday on the Monday of the week holding the day key, as epoch milliseconds.
 * @param {string} iso
 * @returns {number}
 */
const mondayNoon = iso => parseDay(mondayOf(iso)).getTime()

export const BUCKETS = 4
/** @param {Profile | null | undefined} S @param {number | undefined} days @param {number} now - The clock: epoch milliseconds. */
export function effortHistogram(S, days, now) {
  assertClock(now)
  /** @type {number[]} */
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

/** @param {Partial<SetRow> | null | undefined} s @returns {boolean} */
export const isHardSet = s => { const r = rirOf(s); return r != null && r <= HARD_RIR }
