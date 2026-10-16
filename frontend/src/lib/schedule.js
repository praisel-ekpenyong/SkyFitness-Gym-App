// Week schedule / Day override: the write side (CONTEXT.md: Week schedule,
// Day override (Rescheduled)) plus the one dot classifier both schedule
// surfaces render from.
//
// Reads (`effectiveRoutineId`, `hasEffectiveOverride`, `effectiveRoutine`)
// stay in lib/history.js. Every write used to be an inline `update()`
// closure in a different view: DayOverride.set / DayAssign.set (sheets.jsx)
// and the RoutineEdit delete cascade. They share two keyed maps (`week`,
// `dayPlan`) and one falsy-means-clear convention, so they belong here.
//
// Contract: each writer takes the draft `s` inside `update()` (ADR 0004 —
// no localStorage touch). `detachRoutine` sweeps `week` + `dayPlan` only:
// the active workout degrades to freestyle when its routine is gone and
// finished `workouts[].routineId` is history that must never be swept.

/** Day-override value marking a date as declared rest (CONTEXT.md: Day override). */
export const REST = 'rest'

/** Weekday domain for the week schedule: Date.getDay() values, Sun–Sat. */
const isWeekday = day => Number.isInteger(day) && day >= 0 && day <= 6

/** True when the id names a live routine or the rest sentinel. */
const isSchedulable = (s, v) =>
  v === REST || (s?.routines || []).some(r => r && r.id === v)

/**
 * Write a one-off override for one date (CONTEXT.md: Day override).
 *
 * Falsy `v` clears back to the weekly plan, making the old implicit
 * convention explicit. An unknown routine id throws — the storage sanitize
 * pass is the only legitimate path for dangling ids, never a view write.
 *
 * @param {Object} s - Draft profile state with `dayPlan` and `routines`.
 * @param {string} iso - Calendar date in 'YYYY-MM-DD' format.
 * @param {string} v - Routine id, 'rest', or falsy to clear.
 */
export function setDayOverride(s, iso, v) {
  if (!v) { clearDayOverride(s, iso); return }
  if (!isSchedulable(s, v)) throw new Error(`Unknown routine for day override: ${v}`)
  s.dayPlan ??= {}
  s.dayPlan[iso] = v
}

/**
 * Clear the one-off override for one date, falling back to the week schedule.
 *
 * @param {Object} s - Draft profile state with `dayPlan`.
 * @param {string} iso - Calendar date in 'YYYY-MM-DD' format.
 */
export function clearDayOverride(s, iso) {
  if (s?.dayPlan) delete s.dayPlan[iso]
}

/**
 * Assign a routine to one weekday of the recurring schedule.
 *
 * Falsy `v` clears the day back to rest. The 'rest' sentinel is rejected:
 * an unassigned weekday already reads as rest, so there is nothing to write.
 *
 * @param {Object} s - Draft profile state with `week` and `routines`.
 * @param {number} day - Weekday index 0–6 (Date.getDay()).
 * @param {string} v - Routine id, or falsy to clear.
 */
export function assignWeekday(s, day, v) {
  if (!isWeekday(day)) throw new Error(`Weekday out of range: ${day}`)
  s.week ??= {}
  if (!v) { delete s.week[day]; return }
  if (v === REST || !isSchedulable(s, v)) throw new Error(`Unknown routine for weekday ${day}: ${v}`)
  s.week[day] = v
}

/**
 * Eagerly sweep a deleted routine from both schedule maps.
 *
 * Sweeping keeps the maps small, but it is not load-bearing: a stale entry
 * left behind resolves safely — `effectiveRoutineId` falls back to the week
 * schedule and `hasEffectiveOverride` reads false on unknown ids. Never
 * touches `routines` (the caller filters), `active`, or `workouts`.
 *
 * @param {Object} s - Draft profile state with `week` and `dayPlan`.
 * @param {string} routineId - Id of the routine being deleted.
 */
export function detachRoutine(s, routineId) {
  if (!routineId) return
  if (s?.week) Object.keys(s.week).forEach(k => { if (s.week[k] === routineId) delete s.week[k] })
  if (s?.dayPlan) Object.keys(s.dayPlan).forEach(k => { if (s.dayPlan[k] === routineId) delete s.dayPlan[k] })
}

/**
 * Classify one date's schedule dot from precomputed inputs.
 *
 * Both call sites (Home week strip, Calendar) already hold the trained
 * lookup (`doneDays` Set / `byDay` map), so the seam takes the precomputed
 * hit rather than rescanning `workouts` per cell. Priority: trained >
 * rescheduled (a live override resolving to a routine) > planned (week
 * schedule hit). A rest override (`ovr` without `effId`) shows no dot.
 *
 * @param {Object} args - Precomputed classification inputs.
 * @param {*} args.trained - Truthy when a workout was logged that date.
 * @param {string|null} args.effId - `effectiveRoutineId` for the date.
 * @param {boolean} args.ovr - `hasEffectiveOverride` for the date.
 * @returns {'done'|'ovr'|'plan'|''} Dot class without CSS prefix.
 */
export function dayStatus({ trained, effId, ovr }) {
  if (trained) return 'done'
  if (ovr && effId) return 'ovr'
  if (effId) return 'plan'
  return ''
}
