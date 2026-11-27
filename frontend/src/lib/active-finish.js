import { assertClock } from './dates.js'
import { isPerformed } from './workout-sets.js'
import { loadRecords, e1rmRecords } from './training-log.js'
import { EXIDX } from './exercises.js'
import { exerciseMuscleSnapshot } from './muscles.js'
import { diffRoutineWithSession } from './routine-sync.js'
import { sortWorkouts } from './profile/index.js'
import { readProspectivePrescription } from './prospective-prescription.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Workout} Workout */
/** @typedef {import('./types.js').ActiveWorkout} ActiveWorkout */
/** @typedef {import('./types.js').Entry} Entry */
/** @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').MuscleSnapshot} MuscleSnapshot */
/** @typedef {ReturnType<typeof diffRoutineWithSession> & { routineId: string, routineName: string }} RoutineSync */

/**
 * Freeze an ActiveWorkout into a finished Workout record. The Prescription records come from the
 * one Prospective Prescription reading, which the Session boundary writes to the Training log.
 * @param {ActiveWorkout} active
 * @param {{ end: number, unit: Unit, snapshotFor?: (entry: Entry) => MuscleSnapshot | null, prospective: ReturnType<typeof readProspectivePrescription> }} options - `end` is the clock: epoch milliseconds.
 * @returns {Workout}
 * @throws {TypeError} When `end` is not a finite number or no reading is supplied.
 */
export function buildCompletedWorkout(active, { end, unit, snapshotFor, prospective }) {
  assertClock(end, 'end')
  if (!prospective?.entries) {
    throw new TypeError('buildCompletedWorkout needs a Prospective Prescription reading')
  }
  const entries = (active?.entries || []).map(entry => {
    /** @type {Entry} */
    const completed = {
      id: entry.id,
      sets: entry.sets,
      target: entry.target || null,
    }
    const note = typeof entry.notes === 'string' ? entry.notes.trim() : undefined
    if (note) {
      completed.notes = note.slice(0, 500)
    }
    // ADR 0037: the reading guarantees the record; this boundary writes it.
    const plan = prospective.entries[entry.id]?.plan || null
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
 * @returns {{ workout: Workout, prs: string[], e1prs: Array<{ id: string, est: number, w: number, r: number, prev: number }>, routineSync: RoutineSync | null } | null}
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

  const prospective = readProspectivePrescription(A, S)
  const w = buildCompletedWorkout(A, {
    end: Date.now(),
    unit: A.unit || S?.unit || 'kg',
    snapshotFor: en => (EXIDX[en.id]?.custom ? exerciseMuscleSnapshot(EXIDX[en.id]) : null),
    prospective,
  })

  const prs = loadRecords(S, w).map(r => r.id)
  const e1prs = e1rmRecords(S, w)

  S.workouts = sortWorkouts([...(S.workouts || []), w])
  S.active = null
  return { workout: w, prs, e1prs, routineSync }
}
