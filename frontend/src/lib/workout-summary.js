import { setsDone, workSetsDone } from './workout-model.js'
import { tonnage } from './training-log.js'

/**
 * How long a finished Workout took, or null when that is unknown.
 * Unknown means the start or end is missing or not a number, or the end is not after the start.
 */
function durationOf(w) {
  const start = Number(w?.start)
  const end = Number(w?.end)
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : null
}

/**
 * The Workout summary of one Workout: what every surface shows as its sets, time and Tonnage.
 * @param {Object} S - Profile state; its unit decides how loads are read.
 * @param {Object} w - A finished Workout.
 * @returns {{workSets: number, warmups: number, durationMs: number|null, tonnage: number}}
 *   Performed Work sets, performed Warm-up sets, duration (null when unknown) and Tonnage.
 */
export function workoutSummary(S, w) {
  const workSets = workSetsDone(w)
  return { workSets, warmups: setsDone(w) - workSets, durationMs: durationOf(w), tonnage: tonnage(S, w) }
}

/**
 * The Workout summary of a span of Workouts. Unknown durations are skipped, never read as zero.
 * @param {Object} S - Profile state.
 * @param {Object[]} workouts - Finished Workouts, in any order.
 * @returns {{workouts: number, workSets: number, durationMs: number, tonnage: number}}
 */
export function summarizeWorkouts(S, workouts) {
  const total = { workouts: 0, workSets: 0, durationMs: 0, tonnage: 0 }
  for (const w of workouts || []) {
    const one = workoutSummary(S, w)
    total.workouts++
    total.workSets += one.workSets
    total.durationMs += one.durationMs ?? 0
    total.tonnage += one.tonnage
  }
  return total
}
