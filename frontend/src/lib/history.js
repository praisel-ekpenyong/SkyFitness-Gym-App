// Core state and workout history queries over state object S.
// Domain-specific operations have been migrated to their canonical deep modules:
// - Effort scales & steppers: lib/effort.js
// - Superset pairing & units: lib/supersetFlow.js
// - Set/row models & metrics: lib/workout-model.js
// - Label & time formatting:  lib/format.js

import { weekKey, isoOf } from './format.js'

// Backward-compatible re-exports
export { EFFORT, stepEffort, capEffort, effortOf } from './effort.js'
export { cleanupSg, pairAdjacent, unpairSuperset, supersetUnits, unitOf, hasWork, isExerciseDone } from './supersetFlow.js'
export {
  modeOf, isTimed, isBw, isPerSide, sideReps, repStep,
  defaultConfig, freestyleConfig, buildSets, workoutVolume,
  setsDone, setsDoneActive, cascadeWeight, insertWarmupRow,
  removeRowAt, workSetsDone, metricRowsForEntry, metricModeForEntry,
  bestWeightForEntry, bestWeightFor, lastEntryFor, MODES, PHASES, ROW_DEFAULTS, SETS_DEFAULTS, makeRow
} from './workout-model.js'
export { fmtSec, setLabel, exLine } from './format.js'

/**
 * Resolve the routine scheduled for a specific date ('YYYY-MM-DD').
 *
 * Priority:
 * 1. Specific date override (`S.dayPlan[iso]`). Returns null if marked 'rest'.
 * 2. If the overridden routine was deleted, falls back to the recurring weekday schedule.
 * 3. Recurring weekday schedule (`S.week[dayIndex]`).
 *
 * @param {Object} S - Application state atom containing `dayPlan`, `routines`, and `week`.
 * @param {string} iso - Calendar date string in 'YYYY-MM-DD' format.
 * @returns {string|null} Routine ID string, or null for rest/unscheduled days.
 */
export function effectiveRoutineId(S, iso) {
  const ov = S?.dayPlan?.[iso]
  if (ov === 'rest') return null
  if (ov && (S?.routines || []).some(r => r.id === ov)) return ov
  const wd = new Date(iso + 'T12:00:00').getDay()
  return S?.week?.[wd] || null
}

/**
 * Determine whether a date has an active schedule override that resolves to a valid target.
 *
 * An override counts as active only if it specifies 'rest' or references an existing routine.
 * A stale override pointing to a deleted routine returns false to prevent lingering badges.
 *
 * @param {Object} S - Application state atom.
 * @param {string} iso - Calendar date string in 'YYYY-MM-DD' format.
 * @returns {boolean} True if a valid schedule override exists for the date.
 */
export function hasEffectiveOverride(S, iso) {
  const ov = S?.dayPlan?.[iso]
  if (ov === undefined) return false
  if (ov === 'rest') return true
  return (S?.routines || []).some(r => r && r.id === ov)
}

/**
 * Retrieve the full routine object scheduled for a specific date.
 *
 * @param {Object} S - Application state atom.
 * @param {string} iso - Calendar date string in 'YYYY-MM-DD' format.
 * @returns {Object|null} Routine definition object, or null for rest/unscheduled days.
 */
export function effectiveRoutine(S, iso) {
  const id = effectiveRoutineId(S, iso)
  return id ? (S?.routines || []).find(r => r.id === id) || null : null
}

/**
 * Retrieve the most recently logged body weight entry.
 *
 * @param {Object} S - Application state atom containing `bodyweight` array.
 * @returns {{ d: string, w: number }|null} Latest bodyweight entry, or null if none recorded.
 */
export const lastBW = S => (S?.bodyweight?.length ? S.bodyweight[S.bodyweight.length - 1] : null)

/**
 * Calculate the count of consecutive weeks with at least one logged workout, counting back from current week.
 *
 * Evaluates weekly buckets using `weekKey`. The current calendar week can be in-progress without breaking
 * a trailing streak from the prior week.
 *
 * @param {Object} S - Application state atom containing `workouts`.
 * @returns {number} Number of consecutive active weeks (capped at 520 weeks / 10 years).
 */
export function streakWeeks(S, now = Date.now()) {
  if (!S?.workouts?.length) return 0
  const weeks = new Set(S.workouts.map(w => weekKey(w.d)))
  let streak = 0
  const cur = new Date(now)
  for (let i = 0; i < 520; i++) {
    const wk = weekKey(isoOf(cur))
    if (weeks.has(wk)) streak++
    else if (i > 0) break
    cur.setDate(cur.getDate() - 7)
  }
  return streak
}
