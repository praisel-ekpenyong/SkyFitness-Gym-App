import { weekKey, isoOf } from './format.js'
import { hasWorkSet } from './workout-model.js'

/** Freezes each rule can bank. */
export const FREEZE_BANK = { strict: 0, gentle: 1, generous: 2 }
const DEFAULT_RULE = 'gentle'
const EARN_EVERY = 4
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** The profile's freeze rule; absent or unknown reads as Gentle. */
export function streakRuleOf(S) {
  const rule = S?.streakRule
  return typeof rule === 'string' && Object.hasOwn(FREEZE_BANK, rule) ? rule : DEFAULT_RULE
}

// Monday of the ISO week holding the given day key, as a day key.
function mondayOf(iso) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return isoOf(d)
}

// Walks the weeks from the first counted week up to the current week under one bank size.
function walk(counted, currentMonday, bank) {
  const weeks = {}
  let run = 0
  let best = 0
  let freezes = 0
  const starts = [...counted].sort()
  if (starts.length) {
    const cur = new Date(starts[0] + 'T12:00:00')
    for (let key = isoOf(cur); key <= currentMonday; key = isoOf(cur)) {
      const isCurrent = key === currentMonday
      const wk = weekKey(key)
      let earned = false
      let state
      if (counted.has(key)) {
        state = 'counted'
        run++
        if (run % EARN_EVERY === 0 && freezes < bank) {
          freezes++
          earned = true
        }
        best = Math.max(best, run)
      } else if (isCurrent) {
        state = 'open'
      } else if (freezes > 0) {
        state = 'frozen'
        freezes--
      } else if (run > 0) {
        state = 'broke'
        run = 0
      } else {
        state = 'missed'
      }
      weeks[wk] = { state, run, bank: freezes, earned }
      cur.setDate(cur.getDate() + 7)
    }
  }
  return { run, best, freezes, weeks, thisWeekCounted: counted.has(currentMonday) }
}

/**
 * The week streak under the profile's freeze rule, recomputed from the workouts on every call.
 * A week counts when it holds a Workout with a performed Work set.
 * @param {object} S - Profile with `workouts` and an optional `streakRule`.
 * @param {Date|number} today - The clock: a Date or epoch milliseconds.
 * @returns {{rule: string, current: number, best: number, freezes: number, toNextFreeze: number,
 *   thisWeekCounted: boolean, weeks: Object<string, {state: string, run: number, bank: number, earned: boolean}>,
 *   preview: Object<string, {current: number, best: number}>}}
 */
export function streakOf(S, today = Date.now()) {
  const counted = new Set()
  for (const w of S?.workouts || []) {
    if (!DAY_RE.test(w?.d) || !(w.entries || []).some(hasWorkSet)) continue
    counted.add(mondayOf(w.d))
  }
  const currentMonday = mondayOf(isoOf(new Date(today)))
  const rule = streakRuleOf(S)
  const main = walk(counted, currentMonday, FREEZE_BANK[rule])
  const preview = Object.fromEntries(Object.keys(FREEZE_BANK).map(name => {
    const r = walk(counted, currentMonday, FREEZE_BANK[name])
    return [name, { current: r.run, best: r.best }]
  }))
  return {
    rule,
    current: main.run,
    best: main.best,
    freezes: main.freezes,
    toNextFreeze: EARN_EVERY - (main.run % EARN_EVERY),
    thisWeekCounted: main.thisWeekCounted,
    weeks: main.weeks,
    preview,
  }
}
