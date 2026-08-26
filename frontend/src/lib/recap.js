import { workSetsDone, isWarmupRow } from './workout-model.js'
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
    // tonnage: w.r * w.w for done non-warmup sets (warm-ups excluded)
    for (const e of (w.entries || [])) {
      for (const s of (e.sets || [])) {
        if (!s?.done) continue
        if (isWarmupRow(s)) continue
        const wv = Number(s.w)
        const rv = Number(s.r)
        if (Number.isFinite(wv) && Number.isFinite(rv) && wv !== 0 && rv !== 0) {
          vol += wv * rv
        } else if (Number.isFinite(wv) && Number.isFinite(rv)) {
          vol += (Number.isFinite(wv) ? wv : 0) * (Number.isFinite(rv) ? rv : 0)
        }
      }
    }
    sets += workSetsDone(w)
    const start = Number(w.start)
    const end = Number(w.end)
    if (Number.isFinite(start) && Number.isFinite(end)) {
      const dur = end - start
      if (Number.isFinite(dur) && dur > 0) durationMs += dur
    }
    if (Array.isArray(w.prs)) {
      for (const id of w.prs) if (id) prs.push(id)
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

function e1RecordsFor(allWorkouts, yearMonth) {
  const sorted = sortedWorkouts(allWorkouts)
  const bestByEx = new Map()
  const records = []
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
        if (wMonth === yearMonth) {
          records.push({
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
  }
  return records
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
  const e1prs = e1RecordsFor(workouts, ym)

  // prev object exposed for UI deltas; keep numeric plus prs/e1prs for completeness but minimal contract is numeric
  const prevOut = {
    vol: prev.vol,
    sets: prev.sets,
    workouts: prev.workouts,
    durationMs: prev.durationMs,
    prs: prev.prs,
    e1prs: e1RecordsFor(workouts, prevYm),
  }

  const viewedEmpty = cur.workouts === 0

  const deltas = {}
  for (const k of ['vol', 'sets', 'workouts', 'durationMs']) {
    const c = cur[k]
    const p = prev[k]
    if (viewedEmpty) {
      deltas[k] = null
    } else if (p === 0 || p == null) {
      // absolute delta when previous empty: absolute value equals current (cur - 0)
      deltas[k] = c
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
