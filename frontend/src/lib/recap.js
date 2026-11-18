import { loadRecords, e1rmRecords } from './training-log.js'
import { summarizeWorkouts } from './workout-summary.js'
import { monthKey } from './dates.js'

/**
 * Step a calendar month key back by one month.
 *
 * @param {string|Object} yearMonth - 'YYYY-MM' string or workout-like object carrying d.
 * @returns {string} Previous month as 'YYYY-MM', or '' when the input is not a valid month.
 */
export function prevMonthKey(yearMonth) {
  const ym = monthKey(yearMonth)
  const [yStr, mStr] = ym.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return ''
  const d = new Date(Date.UTC(y, m - 1, 1))
  d.setUTCMonth(d.getUTCMonth() - 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function metricsFor(S, workouts) {
  const sum = summarizeWorkouts(S, workouts)
  const prs = []
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
 * @param {Object} S - Profile; its `workouts` are read and `unit` is the unit of the volume and of the Records
 * @param {string} yearMonth - 'YYYY-MM'
 * @returns {{ vol:number, sets:number, workouts:number, durationMs:number, prs:string[], e1prs:Array, prev:Object, deltas:Object }}
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

  const deltas = {}
  for (const k of ['vol', 'sets', 'workouts', 'durationMs']) {
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
