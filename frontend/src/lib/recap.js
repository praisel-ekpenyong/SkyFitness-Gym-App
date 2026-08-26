import { workSetsDone, workoutVolume } from './workout-model.js'
import { bestSetOf } from './onerm.js'

function monthKey(workout) {
  return String(workout?.d || '').slice(0, 7)
}

export function prevMonthKey(yearMonth) {
  const ym = String(yearMonth || '').slice(0, 7)
  const [yStr, mStr] = ym.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return ''
  const d = new Date(Date.UTC(y, m - 1, 1))
  d.setUTCMonth(d.getUTCMonth() - 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function sortedWorkouts(workouts) {
  return [...(workouts || [])].sort((a, b) => {
    const da = String(a?.d || '')
    const db = String(b?.d || '')
    if (da < db) return -1
    if (da > db) return 1
    const sa = Number(a?.start)
    const sb = Number(b?.start)
    const fa = Number.isFinite(sa) ? sa : 0
    const fb = Number.isFinite(sb) ? sb : 0
    return fa - fb
  })
}

function metricsFor(workouts) {
  let vol = 0
  let sets = 0
  let durationMs = 0
  const prs = []

  for (const w of workouts || []) {
    vol += workoutVolume(w)
    sets += workSetsDone(w)
    const start = Number(w.start)
    const end = Number(w.end)
    if (Number.isFinite(start) && Number.isFinite(end)) {
      const dur = end - start
      if (Number.isFinite(dur) && dur > 0) durationMs += dur
    }
    if (Array.isArray(w.prs)) {
      for (const id of w.prs) {
        if (id && !prs.includes(id)) prs.push(id)
      }
    }
  }

  return {
    vol,
    sets,
    workouts: (workouts || []).length,
    durationMs,
    prs,
  }
}

function e1RecordsByMonth(allWorkouts) {
  const sorted = sortedWorkouts(allWorkouts)
  const bestByEx = new Map()
  const byMonth = new Map()
  for (const w of sorted) {
    const wMonth = monthKey(w)
    for (const e of (w.entries || [])) {
      const exId = e?.id
      if (!exId) continue
      const best = bestSetOf(e)
      if (!best) continue
      const prevBest = bestByEx.get(exId)
      if (prevBest == null || best.est > prevBest) {
        bestByEx.set(exId, best.est)
        if (!byMonth.has(wMonth)) byMonth.set(wMonth, [])
        byMonth.get(wMonth).push({
          id: exId,
          est: best.est,
          w: best.w,
          r: best.r,
          d: w.d,
          t: w.start,
          prev: prevBest ?? 0,
        })
      }
    }
  }
  return byMonth
}

/**
 * Pure monthly recap.
 * @param {Array} workouts - S.workouts array
 * @param {string} unit - profile unit ('kg' | 'lb'), kept for API parity (formatting resolved by caller)
 * @param {string} yearMonth - 'YYYY-MM'
 * @returns {{ vol:number, sets:number, workouts:number, durationMs:number, prs:string[], e1prs:Array, prev:Object, deltas:Object }}
 */
export function monthRecap(workouts = [], unit = 'kg', yearMonth) {
  const ym = String(yearMonth || '').slice(0, 7)
  const prevYm = prevMonthKey(ym)

  const curWs = (workouts || []).filter(w => monthKey(w) === ym)
  const prevWs = prevYm ? (workouts || []).filter(w => monthKey(w) === prevYm) : []

  const cur = metricsFor(curWs)
  const prev = metricsFor(prevWs)
  const allE1Records = e1RecordsByMonth(workouts)
  const e1prs = allE1Records.get(ym) || []

  const prevOut = {
    vol: prev.vol,
    sets: prev.sets,
    workouts: prev.workouts,
    durationMs: prev.durationMs,
    prs: prev.prs,
    e1prs: allE1Records.get(prevYm) || [],
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
      // absolute delta when previous month has no workouts: delta is current value
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
