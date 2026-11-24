
import { weekKey, isoOf } from './dates.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Routine} Routine */

/**
 * Remove a workout by ID from `S.workouts`.
 * @param {Profile} S
 * @param {string} id
 * @returns {boolean}
 */
export function deleteWorkout(S, id) {
  const before = (S.workouts || []).length
  S.workouts = (S.workouts || []).filter(w => w.id !== id)
  return S.workouts.length !== before
}

/**
 * Resolve the Routine ID scheduled for `iso`, applying Day override before Week schedule.
 * @param {Profile | null | undefined} S
 * @param {string} iso
 * @returns {string | null}
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
 * Whether `iso` has a valid Day override (`'rest'` or an existing Routine ID).
 * @param {Profile | null | undefined} S
 * @param {string} iso
 * @returns {boolean}
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
 * @param {Profile | null | undefined} S - Application state atom.
 * @param {string} iso - Calendar date string in 'YYYY-MM-DD' format.
 * @returns {Routine | null} Routine definition object, or null for rest/unscheduled days.
 */
export function effectiveRoutine(S, iso) {
  const id = effectiveRoutineId(S, iso)
  return id ? (S?.routines || []).find(r => r.id === id) || null : null
}

/**
 * Count how many of the last `n` calendar weeks had at least one Workout.
 * @param {Profile | null | undefined} S
 * @param {number} [n=12]
 * @param {number} [now=Date.now()]
 * @returns {number}
 */
export function trainedWeeks(S, n = 12, now = Date.now()) {
  if (!S?.workouts?.length) return 0
  const weeks = new Set(S.workouts.map(w => weekKey(w.d)))
  const cur = new Date(now)
  let count = 0
  for (let i = 0; i < n; i++) {
    if (weeks.has(weekKey(isoOf(cur)))) count++
    cur.setDate(cur.getDate() - 7)
  }
  return count
}
