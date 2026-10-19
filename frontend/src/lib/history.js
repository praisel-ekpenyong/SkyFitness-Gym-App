// History: the schedule and streak reads every Home/Calendar/hero consumer
// shares, plus the history write side (deleteWorkout). Row/set helpers, effort
// scales, superset pairing and labels live in their canonical modules —
// workout-model.js, effort.js, supersetFlow.js and format.js — and are no
// longer re-routed through here.

import { weekKey, isoOf } from './format.js'

/**
 * Delete one Workout from history for good (the workout-detail confirm path).
 *
 * Removes exactly the workout record and nothing else. Bests (`S.exWeights`)
 * and Records (`w.prs` on surviving workouts) keep standing — a Best is
 * "heaviest ever recorded", not "heaviest of what remains", so deleting history
 * never lowers a suggestion or unremembers a PR.
 *
 * @param {Object} S - Application state atom.
 * @param {string} id - Workout id to delete.
 * @returns {boolean} True when a workout with that id was removed.
 */
export function deleteWorkout(S, id) {
  const before = (S.workouts || []).length
  S.workouts = (S.workouts || []).filter(w => w.id !== id)
  return S.workouts.length !== before
}

/**
 * Resolve the routine scheduled for a specific date ('YYYY-MM-DD').
 *
 * Priority:
 * 1. Specific date override (`S.dayPlan[iso]`). Returns null if marked 'rest'.
 * 2. If the overridden routine was deleted, falls back to the recurring weekday schedule.
 * 3. Recurring weekday schedule (`S.week[dayIndex]`). A legacy 'rest' value
 *    reads as unscheduled — the write seam rejects it, but older stores
 *    may hold one.
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
  const id = S?.week?.[wd] || null
  return id === 'rest' ? null : id
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
 * Calculate the count of consecutive weeks with at least one logged workout, counting back from current week.
 *
 * Evaluates weekly buckets using `weekKey`. The current calendar week can be in-progress without breaking
 * a trailing streak from the prior week.
 *
 * @param {Object} S - Application state atom containing `workouts`.
 * @returns {number} Number of consecutive active weeks (capped at 520 weeks / 10 years).
 */
export function streakWeeks(S) {
  if (!S?.workouts?.length) return 0
  const weeks = new Set(S.workouts.map(w => weekKey(w.d)))
  let streak = 0
  const cur = new Date()
  for (let i = 0; i < 520; i++) {
    const wk = weekKey(isoOf(cur))
    if (weeks.has(wk)) streak++
    else if (i > 0) break
    cur.setDate(cur.getDate() - 7)
  }
  return streak
}
