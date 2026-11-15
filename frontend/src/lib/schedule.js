
export const REST = 'rest'

const isWeekday = day => Number.isInteger(day) && day >= 0 && day <= 6

const isSchedulable = (s, v) =>
  v === REST || (s?.routines || []).some(r => r && r.id === v)

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

export function assignWeekday(s, day, v) {
  if (!isWeekday(day)) throw new Error(`Weekday out of range: ${day}`)
  s.week ??= {}
  if (!v) { delete s.week[day]; return }
  if (v === REST) throw new Error(`Cannot assign rest to weekday ${day}: clear it with a falsy value`)
  if (!isSchedulable(s, v)) throw new Error(`Unknown routine for weekday ${day}: ${v}`)
  s.week[day] = v
}

export function detachRoutine(s, routineId) {
  if (!routineId) return
  if (s?.week) Object.keys(s.week).forEach(k => { if (s.week[k] === routineId) delete s.week[k] })
  if (s?.dayPlan) Object.keys(s.dayPlan).forEach(k => { if (s.dayPlan[k] === routineId) delete s.dayPlan[k] })
}

export function dayStatus({ trained, effId, ovr }) {
  if (trained) return 'done'
  if (ovr && effId) return 'ovr'
  if (effId) return 'plan'
  return ''
}
