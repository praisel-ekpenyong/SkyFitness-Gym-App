
/** @typedef {import('./types.js').Profile} Profile */

export const REST = 'rest'

/** @param {unknown} day @returns {day is number} */
const isWeekday = day => typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6

/** @param {Profile | null | undefined} s @param {unknown} v @returns {v is string} */
const isSchedulable = (s, v) =>
  v === REST || (s?.routines || []).some(r => r && r.id === v)

/**
 * Set or clear a Day override on `s.dayPlan`.
 * @param {Profile} s
 * @param {string} iso
 * @param {string | null | undefined} v
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
 * @param {Profile | null | undefined} s - Draft profile state with `dayPlan`.
 * @param {string} iso - Calendar date in 'YYYY-MM-DD' format.
 */
export function clearDayOverride(s, iso) {
  if (s?.dayPlan) delete s.dayPlan[iso]
}

/**
 * Assign or clear a Routine on weekday `day` (0-6).
 * @param {Profile} s
 * @param {number} day
 * @param {string | null | undefined} v
 */
export function assignWeekday(s, day, v) {
  if (!isWeekday(day)) throw new Error(`Weekday out of range: ${day}`)
  s.week ??= {}
  if (!v) { delete s.week[day]; return }
  if (v === REST) throw new Error(`Cannot assign rest to weekday ${day}: clear it with a falsy value`)
  if (!isSchedulable(s, v)) throw new Error(`Unknown routine for weekday ${day}: ${v}`)
  s.week[day] = v
}

/**
 * Remove all references to `routineId` from `s.week` and `s.dayPlan`.
 * @param {Profile | null | undefined} s
 * @param {string} routineId
 */
export function detachRoutine(s, routineId) {
  if (!routineId) return
  if (s?.week) Object.keys(s.week).forEach(k => { if (s.week[k] === routineId) delete s.week[k] })
  if (s?.dayPlan) Object.keys(s.dayPlan).forEach(k => { if (s.dayPlan[k] === routineId) delete s.dayPlan[k] })
}

/**
 * @param {{ trained?: boolean, effId?: string | null, ovr?: boolean }} status
 * @returns {'done' | 'ovr' | 'plan' | ''}
 */
export function dayStatus({ trained, effId, ovr }) {
  if (trained) return 'done'
  if (ovr && effId) return 'ovr'
  if (effId) return 'plan'
  return ''
}
