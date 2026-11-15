import { modeOf, metricModeForEntry, metricRowsForEntry, bestWeightForEntry, hasWorkSet } from './workout-model.js'
import { workoutTimestamp } from './format.js'

const unitFor = (S, mode) =>
  mode === 'cardio' ? 'km/h' : mode === 'time' ? 's' : S?.unit

const bestRowValue = (rows, mode) =>
  Math.max(0, ...rows.map(s => (mode === 'cardio' ? (s.speed || 0) : mode === 'time' ? (s.sec || 0) : (s.w || 0))))

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
