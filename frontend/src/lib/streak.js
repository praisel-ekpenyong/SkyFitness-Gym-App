import { weekKey, isoOf, mondayOf } from './dates.js'
import { hasWorkSet } from './workout-model.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {{ state: 'counted' | 'broke' | 'missed' | 'open', run: number }} WeekStreakEntry */

/**
 * The Week streak: weeks trained in a row, recomputed from the workouts on every call.
 * A week counts when it holds a Workout with a performed Work set. The current week stays open
 * until it ends; any earlier week without one breaks the streak.
 * @param {Profile | null | undefined} S - Profile with `workouts`.
 * @param {Date|number} [today] - The clock: a Date or epoch milliseconds.
 * @returns {{current: number, best: number, thisWeekCounted: boolean,
 *   weeks: Record<string, WeekStreakEntry>}}
 */
export function streakOf(S, today = Date.now()) {
  /** @type {Set<string>} */
  const counted = new Set()
  for (const w of S?.workouts || []) {
    if (!(w.entries || []).some(hasWorkSet)) continue
    counted.add(mondayOf(w.d))
  }
  const currentMonday = mondayOf(isoOf(new Date(today)))
  /** @type {Record<string, WeekStreakEntry>} */
  const weeks = {}
  let current = 0
  let best = 0
  // A malformed day key's Monday reads 'NaN-…', which sorts after every real day, so the walk never reaches it.
  const first = [...counted].sort()[0]
  if (first) {
    const cur = new Date(first + 'T12:00:00')
    for (let key = isoOf(cur); key <= currentMonday; key = isoOf(cur)) {
      /** @type {'counted' | 'broke' | 'missed' | 'open'} */
      let state
      if (counted.has(key)) {
        state = 'counted'
        current++
        best = Math.max(best, current)
      } else if (key === currentMonday) {
        state = 'open'
      } else if (current > 0) {
        state = 'broke'
        current = 0
      } else {
        state = 'missed'
      }
      weeks[weekKey(key)] = { state, run: current }
      cur.setDate(cur.getDate() + 7)
    }
  }
  return { current, best, thisWeekCounted: counted.has(currentMonday), weeks }
}
