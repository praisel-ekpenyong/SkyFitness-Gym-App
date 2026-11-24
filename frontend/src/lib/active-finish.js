import { isPerformed } from './workout-sets.js'
import { loadRecords, e1rmRecords } from './training-log.js'
import { EXIDX } from './exercises.js'
import { exerciseMuscleSnapshot } from './muscles.js'
import { diffRoutineWithSession } from './routine-sync.js'
import { sortWorkouts } from './profile/index.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Workout} Workout */
/** @typedef {import('./types.js').ActiveWorkout} ActiveWorkout */
/** @typedef {import('./types.js').Entry} Entry */
/** @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Prescription} Prescription */
/** @typedef {import('./types.js').PrescriptionRecord} PrescriptionRecord */
/** @typedef {import('./types.js').MuscleSnapshot} MuscleSnapshot */

/**
 * @param {Prescription | PrescriptionRecord | null | undefined} plan
 * @returns {PrescriptionRecord | null}
 */
function planRecord(plan) {
  if (!plan || typeof plan !== 'object') return null
  /** @type {PrescriptionRecord} */
  const out = { kind: plan.kind }
  for (const key of /** @type {const} */ (['weight', 'reps', 'sec', 'sets'])) {
    if (plan[key] != null) out[key] = plan[key]
  }
  return out
}

/**
 * Freeze an ActiveWorkout into a finished Workout record.
 * @param {ActiveWorkout} active
 * @param {{ end?: number, unit?: Unit, snapshotFor?: (entry: Entry) => MuscleSnapshot | null }} [options]
 * @returns {Workout}
 */
export function buildCompletedWorkout(active, { end = Date.now(), unit = 'kg', snapshotFor } = {}) {
  const entries = (active?.entries || []).map(entry => {
    /** @type {Entry} */
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

/**
 * Finish `S.active`, append the completed Workout to `S.workouts`, and return records and routine diff.
 * @param {Profile} S
 * @returns {{ workout: Workout, prs: string[], e1prs: Array<{ id: string, est: number, w: number, r: number, prev: number }>, routineSync: (ReturnType<typeof diffRoutineWithSession> & { routineId: string, routineName: string }) | null } | null}
 */
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
