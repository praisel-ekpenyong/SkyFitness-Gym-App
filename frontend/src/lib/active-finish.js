import { isPerformed } from './workout-sets.js'
import { loadRecords, e1rmRecords } from './training-log.js'
import { EXIDX } from './exercises.js'
import { exerciseMuscleSnapshot } from './muscles.js'
import { diffRoutineWithSession } from './routine-sync.js'
import { sortWorkouts } from './profile/index.js'

function planRecord(plan) {
  if (!plan || typeof plan !== 'object') return null
  const out = { kind: plan.kind }
  for (const key of ['weight', 'reps', 'sec', 'sets']) {
    if (plan[key] != null) out[key] = plan[key]
  }
  return out
}

export function buildCompletedWorkout(active, { end, unit = 'kg', snapshotFor } = {}) {
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
  }
}

export function completeActiveSession(S) {
  const A = S.active
  if (!A) return null
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
    end: Date.now(),
    unit: A.unit || S?.unit || 'kg',
    snapshotFor: en => (EXIDX[en.id]?.custom ? exerciseMuscleSnapshot(EXIDX[en.id]) : null),
  })

  const prs = loadRecords(S, w).map(r => r.id)
  const e1prs = e1rmRecords(S, w)

  S.workouts = sortWorkouts([...(S.workouts || []), w])
  S.active = null
  return { workout: w, prs, e1prs, routineSync }
}
