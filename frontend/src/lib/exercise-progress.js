// Exercise progress over logged workouts: the one reading of "how is this
// exercise moving" that every progress surface renders from.
//
// Stats.jsx used to rebuild this pipeline inline on every render: the top-set
// series, the per-exercise current best, and the Mode resolution each
// reimplemented the log's best-load read with mode awareness. A Mode-resolution bug
// fixed in the view stayed broken everywhere else, and none of it was testable
// without the DOM. The view now renders from this seam; the pipeline is tested
// in Node.
import { modeOf, metricModeForEntry, metricRowsForEntry, bestWeightForEntry, hasWorkSet } from './workout-model.js'
import { workoutTimestamp } from './format.js'

/** Unit a headline number reads in: loads in the profile unit, holds in seconds, cardio in km/h. */
const unitFor = (S, mode) =>
  mode === 'cardio' ? 'km/h' : mode === 'time' ? 's' : S?.unit

/** Highest scored value of one entry's completed rows under a non-reps mode. */
const bestRowValue = (rows, mode) =>
  Math.max(0, ...rows.map(s => (mode === 'cardio' ? (s.speed || 0) : mode === 'time' ? (s.sec || 0) : (s.w || 0))))

/**
 * Resolve the Mode an exercise currently trains under (GLOSSARY.md: Mode).
 *
 * The latest logged entry is authoritative: its completed rows decide, with
 * reps winning when rows genuinely mix; a target with an explicit mode pins
 * otherwise untyped rows to it (rows built by makeRow carry no mode of
 * their own). An exercise never trained falls back to the catalogue, like
 * every fresh plan.
 *
 * @param {Object} S - Application state atom containing `workouts`.
 * @param {string} exId - Exercise identifier.
 * @returns {string} 'reps', 'time', or 'cardio'.
 */
export function modeFor(S, exId) {
  for (let i = (S?.workouts || []).length - 1; i >= 0; i--) {
    const en = (S.workouts[i].entries || []).find(e => e.id === exId)
    if (en) {
      const mode = metricModeForEntry(en)
      if (mode) return mode
    }
  }
  return modeOf({ id: exId })
}

/**
 * One chronological point per workout where the exercise produced a top set.
 *
 * Sessions logged in another mode drop out rather than reading as lighter top
 * sets: a 90-second hold is not a weaker 90 kg single. Reps points score via
 * `bestWeightForEntry` (warm-ups excluded, legacy topW honored); timed and
 * cardio points score the longest hold and top speed. Each point carries the
 * scored sets and the target they were trained against, so labels and the
 * effort overlay read the session back the way it was logged.
 *
 * @param {Object} S - Application state atom containing `workouts`.
 * @param {string} exId - Exercise identifier.
 * @returns {Array<{ t: number, y: number, d: string, sets: Array<Object>, target: Object|undefined }>}
 *   Chronological top-set points for trend charting.
 */
export function topSetSeries(S, exId) {
  const mode = modeFor(S, exId)
  const pts = []
  for (const w of S?.workouts || []) {
    const en = (w.entries || []).find(e => e.id === exId)
    if (!en) continue
    if (metricModeForEntry(en) !== mode) continue
    const doneSets = metricRowsForEntry(en, mode)
    const mx = mode === 'reps' ? bestWeightForEntry(en) : bestRowValue(doneSets, mode)
    if (mx > 0) pts.push({ t: workoutTimestamp(w), y: mx, d: w.d, sets: doneSets, target: en.target })
  }
  return pts
}

/**
 * The latest session that produced a best for an exercise, with its unit.
 *
 * Reads newest-first and returns the first session scoring above zero, so a
 * latest session with nothing scored (all sets unticked) does not zero out an
 * established best. Loads read in the profile unit; holds and cardio speeds
 * read in their own units.
 *
 * @param {Object} S - Application state atom containing `workouts` and `unit`.
 * @param {string} exId - Exercise identifier.
 * @returns {{ mx: number, unit: string }} Latest best and the unit it reads in.
 */
export function currentBest(S, exId) {
  for (let i = (S?.workouts || []).length - 1; i >= 0; i--) {
    const en = (S.workouts[i].entries || []).find(e => e.id === exId)
    if (!en) continue
    const mode = metricModeForEntry(en) || modeOf({ id: exId })
    const rows = metricRowsForEntry(en, mode)
    const mx = mode === 'reps' ? bestWeightForEntry(en) : bestRowValue(rows, mode)
    if (mx > 0) return { mx, unit: unitFor(S, mode) }
  }
  return { mx: 0, unit: unitFor(S, 'reps') }
}

/**
 * Whole weeks since a completed muscle-training timestamp.
 *
 * @param {number} now Current render-time timestamp in milliseconds.
 * @param {number} lastTrained Timestamp of the latest completed training event.
 * @returns {number} Non-negative whole weeks, including zero for ages under seven days.
 */
export function weeksSinceTraining(now, lastTrained) {
  return Math.max(0, Math.floor((now - lastTrained) / 86400000 / 7))
}

/**
 * Timestamp of an exercise's latest performed work set across history.
 *
 * The retained-strength model reads effective work: warm-up rows are prep, not
 * stimulus. Exercise identity is the entry id alone, so imported rows without a
 * name snapshot still count.
 *
 * @param {Array<Object>} workouts - Workout history with `start`/`d` and entry set arrays.
 * @param {string} exId - Exercise identifier.
 * @returns {number|null} Latest workout timestamp in milliseconds, or null when the exercise was never trained.
 */
export function lastWorkSetAt(workouts, exId) {
  let latest = null
  for (const workout of workouts || []) {
    const ts = workoutTimestamp(workout)
    if (!Number.isFinite(ts) || (latest != null && ts <= latest)) continue
    const trained = (workout.entries || []).some(e => e.id === exId && hasWorkSet(e))
    if (trained) latest = ts
  }
  return latest
}
