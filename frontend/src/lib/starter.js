// The Push/Pull/Legs starter plan. Shared by the "Load starter plan" action in Settings
// and by the demo build, which seeds a history on top of exactly these routines.
import { uid } from './format.js'
import { assignWeekday } from './schedule.js'

const SPEC = [
  ['Push Day', 'barbell', [['0025', 4, 8], ['0047', 3, 10], ['0426', 3, 10], ['0334', 3, 12], ['0241', 3, 12], ['0251', 3, 10]]],
  ['Pull Day', 'pullup', [['2330', 4, 10], ['0027', 4, 8], ['1323', 3, 10], ['0031', 3, 10], ['0313', 3, 12]]],
  ['Leg Day', 'legs', [['0043', 4, 8], ['0085', 3, 10], ['0739', 3, 12], ['0585', 3, 12], ['0586', 3, 12], ['0605', 4, 15]]]
]

// Fresh routine objects (new ids) — [push, pull, legs].
export const starterRoutines = () =>
  SPEC.map(([name, emoji, list]) => ({ id: uid(), name, emoji, ex: list.map(([id, sets, reps]) => ({ id, sets, reps, weight: 0 })) }))

/**
 * Write the starter plan into state: three fresh routines plus their Mon/Wed/Fri
 * assignments, through the schedule write seam (`assignWeekday`) — the one home
 * of the week-map write rules, so the starter plan can never drift from what
 * the plan sheet would write for the same call.
 *
 * On an empty profile this is simply `assignWeekday`'s happy path; on a profile
 * that already assigned those weekdays (or carries a legacy rest value) the
 * seam's own validation applies, so the caller sees the same failure as the
 * plan sheet instead of bypassing it.
 *
 * @param {Object} S - Application state atom.
 * @returns {string[]} The three assigned routine ids, in push/pull/legs order.
 */
export function applyStarterPlan(S) {
  S.routines ??= []
  const [push, pull, legs] = starterRoutines()
  S.routines.push(push, pull, legs)
  assignWeekday(S, 1, push.id)
  assignWeekday(S, 3, pull.id)
  assignWeekday(S, 5, legs.id)
  return [push.id, pull.id, legs.id]
}
