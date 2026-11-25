import { loadRecords, e1rmRecords } from './training-log.js'
import { summarizeWorkouts } from './workout-summary.js'
import { isoOf, monthKey } from './dates.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Workout} Workout */
/** @typedef {import('./types.js').ActiveWorkout} ActiveWorkout */
/** @typedef {import('./types.js').WeighIn} WeighIn */

/**
 * Step a calendar month key back by one month.
 *
 * @param {string | Workout | ActiveWorkout | WeighIn | null | undefined} yearMonth - 'YYYY-MM' string or dated record carrying `d`.
 * @returns {string} Previous month as 'YYYY-MM', or '' when the input is not a valid month.
 */
export function prevMonthKey(yearMonth) {
  const ym = monthKey(yearMonth)
  const [yStr, mStr] = ym.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return ''
  return monthKey(isoOf(new Date(y, m - 2, 1)))
}

/**
 * @typedef {{ id: string, est: number, w: number, r: number, prev: number, d: string, t: number }} MonthE1RMRecord
 * @typedef {{ vol: number, sets: number, workouts: number, durationMs: number, prs: string[], e1prs: MonthE1RMRecord[] }} MonthMetrics
 */

/**
 * @param {Profile} S
 * @param {Workout[]} workouts
 * @returns {MonthMetrics}
 */
function metricsFor(S, workouts) {
  const sum = summarizeWorkouts(S, workouts)
  /** @type {string[]} */
  const prs = []
  /** @type {MonthE1RMRecord[]} */
  const e1prs = []

  for (const w of workouts || []) {
    for (const r of loadRecords(S, w)) if (!prs.includes(r.id)) prs.push(r.id)
    for (const r of e1rmRecords(S, w)) e1prs.push({ ...r, d: w.d, t: w.start })
  }

  return {
    vol: sum.tonnage,
    sets: sum.workSets,
    workouts: sum.workouts,
    durationMs: sum.durationMs,
    prs,
    e1prs,
  }
}

/**
 * Pure monthly recap.
 * @param {Profile} S - Profile; its `workouts` are read and `unit` is the unit of the volume and of the Records
 * @param {string} yearMonth - 'YYYY-MM'
 * @returns {{ vol: number, sets: number, workouts: number, durationMs: number, prs: string[], e1prs: MonthE1RMRecord[], prev: MonthMetrics, deltas: Record<'vol' | 'sets' | 'workouts' | 'durationMs', number | null> }}
 */
export function monthRecap(S, yearMonth) {
  const workouts = S?.workouts || []
  const ym = monthKey(yearMonth)
  const prevYm = prevMonthKey(ym)

  const curWs = (workouts || []).filter(w => monthKey(w) === ym)
  const prevWs = prevYm ? (workouts || []).filter(w => monthKey(w) === prevYm) : []

  const cur = metricsFor(S, curWs)
  const prev = metricsFor(S, prevWs)
  const e1prs = cur.e1prs

  const prevOut = {
    vol: prev.vol,
    sets: prev.sets,
    workouts: prev.workouts,
    durationMs: prev.durationMs,
    prs: prev.prs,
    e1prs: prev.e1prs,
  }

  const viewedEmpty = cur.workouts === 0
  const prevEmpty = prev.workouts === 0

  /** @type {Record<'vol' | 'sets' | 'workouts' | 'durationMs', number | null>} */
  const deltas = { vol: null, sets: null, workouts: null, durationMs: null }
  for (const k of /** @type {const} */ (['vol', 'sets', 'workouts', 'durationMs'])) {
    const c = cur[k]
    const p = prev[k]
    if (viewedEmpty) {
      deltas[k] = null
    } else if (prevEmpty) {
      deltas[k] = c
    } else if (p === 0 || p == null) {
      deltas[k] = c === 0 ? 0 : c
    } else {
      deltas[k] = ((c - p) / p) * 100
    }
  }

  return {
    vol: cur.vol,
    sets: cur.sets,
    workouts: cur.workouts,
    durationMs: cur.durationMs,
    prs: cur.prs,
    e1prs,
    prev: prevOut,
    deltas,
  }
}
