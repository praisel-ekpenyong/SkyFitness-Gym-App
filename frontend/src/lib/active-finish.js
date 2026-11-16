import { doneWorkSets, isPerformed } from './workout-model.js'
import { best } from './training-log.js'
import { is1RMRecord } from './onerm.js'
import { EXIDX } from './exercises.js'
import { exerciseMuscleSnapshot } from './muscles.js'
import { diffRoutineWithSession } from './routine-sync.js'
import { normalizeWeight, round1 } from './units.js'

export function heaviestSetWeight(entry) {
  let mx = 0
  for (const s of doneWorkSets(entry)) {
    const w = Number(s.w)
    if (Number.isFinite(w) && w > mx) mx = w
  }
  return mx
}

export function heaviestForEntry(entry) {
  const base = heaviestSetWeight(entry)
  const top = Number(entry?.topW)
  if (Number.isFinite(top) && top > base) return top
  return base
}

export function mergeExWeight(S, exId, weight, dateISO) {
  const w = Number(weight)
  if (!Number.isFinite(w) || w <= 0) return false
  if (!exId) return false
  if (!S.exWeights) S.exWeights = {}
  const targetUnit = S?.unit || 'kg'
  const cur = S.exWeights[exId]
  const curNormalized = cur && typeof cur.w === 'number'
    ? normalizeWeight(cur.w, cur.unit || targetUnit, targetUnit)
    : 0
  if (!cur || w > curNormalized) {
    S.exWeights[exId] = { w: round1(w), d: dateISO, unit: targetUnit }
    return true
  }
  return false
}

function planRecord(plan) {
  if (!plan || typeof plan !== 'object') return null
  const out = { kind: plan.kind }
  for (const key of ['weight', 'reps', 'sec', 'sets']) {
    if (plan[key] != null) out[key] = plan[key]
  }
  return out
}

export function buildCompletedWorkout(active, { end = Date.now(), prs = [], unit = 'kg', snapshotFor } = {}) {
  const entries = (active?.entries || []).map(entry => {
    const completed = {
      id: entry.id,
      sets: entry.sets,
      target: entry.target || null,
    }
    if (entry.topW) completed.topW = entry.topW
    const note = typeof entry.notes === 'string' ? entry.notes.trim() : undefined
    if (note) {
      completed.notes = note.slice(0, 500)
    }
    const plan = planRecord(entry.plan)
    if (plan) completed.plan = plan
    const snapshot = typeof snapshotFor === 'function' ? snapshotFor(entry) : null
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) && Object.keys(snapshot).length) {
      completed.muscleSnapshot = { ...snapshot }
    }
    return completed
  }).filter(entry => (entry.sets || []).some(isPerformed))

  return {
    id: active.id,
    d: active.d,
    start: active.start,
    end,
    routineId: active.routineId,
    name: active.name,
    bw: active.bw,
    unit: active.unit || unit,
    entries,
    prs,
  }
}

export function completeActiveSession(S, opts = {}) {
  const _now = opts.now || Date.now
  const A = S.active
  if (!A) return null
  const prs = []
  const e1prs = []

  for (const e of A.entries) {
    const mxSets = heaviestSetWeight(e)
    if (mxSets > 0) {
      const bestHistory = best(S, e.id)
      if (mxSets > bestHistory) prs.push(e.id)
    }
    const rec = is1RMRecord(S, e.id, e)
    if (rec && !prs.includes(e.id)) e1prs.push({ id: e.id, ...rec })
  }

  let routineSync = null
  if (A.routineId && Array.isArray(S.routines)) {
    const routine = S.routines.find(r => r.id === A.routineId)
    if (routine) {
      const diff = diffRoutineWithSession(routine, A)
      if (diff?.hasDiff) {
        routineSync = {
          ...diff,
          routineId: routine.id,
          routineName: routine.name,
        }
      }
    }
  }

  const w = buildCompletedWorkout(A, {
    end: _now(),
    prs,
    unit: A.unit || S?.unit || 'kg',
    snapshotFor: en => (EXIDX[en.id]?.custom ? exerciseMuscleSnapshot(EXIDX[en.id]) : null),
  })

  for (const e of w.entries) {
    const mx = heaviestForEntry(e)
    if (mx > 0) mergeExWeight(S, e.id, mx, w.d)
  }

  S.workouts = [...(S.workouts || []), w]
  S.workouts.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.start - b.start))
  S.active = null
  return { workout: w, prs, e1prs, routineSync }
}
