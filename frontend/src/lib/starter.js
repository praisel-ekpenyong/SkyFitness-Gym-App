import { assignWeekday } from './schedule.js'
import { actRoutine } from './routines.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Routine} Routine */

/** @type {[string, string, [string, number, number][]][]} */
const SPEC = [
  ['Push Day', 'barbell', [['0025', 4, 8], ['0047', 3, 10], ['0426', 3, 10], ['0334', 3, 12], ['0241', 3, 12], ['0251', 3, 10]]],
  ['Pull Day', 'pullup', [['2330', 4, 10], ['0027', 4, 8], ['1323', 3, 10], ['0031', 3, 10], ['0313', 3, 12]]],
  ['Leg Day', 'legs', [['0043', 4, 8], ['0085', 3, 10], ['0739', 3, 12], ['0585', 3, 12], ['0586', 3, 12], ['0605', 4, 15]]]
]

/** @returns {Partial<Routine>[]} The starter Routines as `import` takes them. */
export const starterRoutines = () =>
  SPEC.map(([name, emoji, list]) => ({ name, emoji, ex: list.map(([id, sets, reps]) => ({ id, sets, reps, weight: 0 })) }))

/**
 * @param {Profile} S
 * @returns {[string, string, string]}
 */
export function applyStarterPlan(S) {
  S.routines ??= []
  const [push, pull, legs] = starterRoutines().map(routine => actRoutine(S, { type: 'import', routine }).result?.id ?? '')
  assignWeekday(S, 1, push)
  assignWeekday(S, 3, pull)
  assignWeekday(S, 5, legs)
  return [push, pull, legs]
}
