// Toggle decision — one slice of the active-workout lifecycle.
//
// Flipping a set Row's done flag plus every navigation consequence: the
// `next` action sheets render (no re-derivation across the seam), rest-timer
// intent, and the Next key's target once a unit's work is done. Session construction lives in
// active-session.js, set surgery in active-sets.js, finishing in
// active-finish.js.
import { modeOf, isWorkSet, doneWorkSets, hasWork, isExerciseDone } from './workout-model.js'
import {
  supersetUnits, unitOf,
  setProgressHighWater, supersetFlowStep
} from './supersetFlow.js'

/**
 * Describe the superset unit holding `entryIdx`.
 *
 * Single home for the group geometry both toggle and the Next key read, so sheets never re-derive it across the seam.
 *
 * @param {Array<Object>} entries - Active workout entries array.
 * @param {number} entryIdx - Index of the entry of interest.
 * @returns {{ units: Array<Array<number>>, unit: Array<number>, unitIdx: number, isLastUnit: boolean }}
 */
export function describeUnit(entries, entryIdx) {
  const units = supersetUnits(entries)
  const unit = unitOf(units, entryIdx)
  const unitIdx = units.findIndex(u => u === unit)
  const isLastUnit = unitIdx >= units.length - 1
  return { units, unit, unitIdx, isLastUnit }
}

/**
 * Whether the unit's work is done: no member has an undone Work set. Warm-up rows are prep, not
 * work, so an unticked Warm-up set never keeps a finished unit reading as unfinished. The one rule
 * the toggle (rest, finish) and the Next key read, and the same `hasWork` rule the superset step uses.
 *
 * @param {Array<Object>} entries - Active workout entries array.
 * @param {Array<number>} unit - Entry indices of the unit (`describeUnit`).
 * @returns {boolean}
 */
const unitWorkDone = (entries, unit) => !unit.some(i => hasWork(entries, i))

/**
 * The Entry the Next key moves to, once the open unit's work is done.
 *
 * Returns the first Entry of the following Entry or superset when every Work
 * set of the unit holding `entryIdx` is performed (unticked Warm-up sets do
 * not count). Returns null while work is left, on the last unit (the finish
 * prompt opens there instead), for a unit with no Work sets, or when the
 * Entry is gone. Every Mode reads the same; the view renders, never judges.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of an Entry in the open unit.
 * @returns {number|null} Index of the next unit's first Entry, or null.
 */
export function nextUnitTarget(S, entryIdx) {
  const entries = S?.active?.entries
  if (!entries?.[entryIdx]) return null
  const { units, unit, unitIdx, isLastUnit } = describeUnit(entries, entryIdx)
  if (isLastUnit) return null
  const hasWorkRows = unit.some(i => (entries[i].sets || []).some(isWorkSet))
  if (!hasWorkRows || !unitWorkDone(entries, unit)) return null
  return units[unitIdx + 1]?.[0] ?? null
}

/**
 * Toggle completion of a set row and compute all workout lifecycle transitions.
 *
 * Owns the complete state transition for a set toggle: flips `set.done`,
 * tracks the per-Entry high-water mark of completed Work sets (ignoring
 * Warm-up sets) on `entry.hw`, detects exercise, superset unit, and whole
 * Workout completion, and executes superset wrap-around navigation (`A.cur`).
 * The heaviest performed Work set is read from the log at finish; nothing
 * asks the lifter to confirm a weight (ADR 0020).
 *
 * Callers read `checked` (set-complete sound) and the three effect channels:
 * sheets render `next`, the rest timer reads `rest`, toasts read `notice`.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of active entry.
 * @param {number} setIdx - Index of set row being toggled.
 * @returns {Object|null} Declarative outcome for UI side effects, or null on invalid target:
 *   - `checked`: new `done` state of the set.
 *   - `mode`: 'reps' | 'time' | 'cardio'.
 *   - `cur`: active exercise index after any navigation.
 *   - `next`: which sheet opens next — 'open-finish' | 'advance-to' | 'stay',
 *     with `targetIdx` for 'advance-to'. Sheets render it; they never re-derive geometry.
 *   - `rest`: `{ start, stop }` rest-timer intent (start rest, stop running rest).
 *   - `notice`: null | 'cardio' | 'timed' — transient toast hint when an Entry
 *     just finished; null when no toast applies.
 */
export function toggleActiveSet(S, entryIdx, setIdx) {
  const A = S?.active
  const entry = A?.entries?.[entryIdx]
  if (!entry || !entry.sets?.[setIdx]) return null

  const set = entry.sets[setIdx]
  // The per-Entry high-water mark lives here, not in the caller: entries
  // created before this seam owned progress carry no `hw`, so seed from the
  // pre-flip Work-set count (the old mount baseline). Splicing entries keeps
  // each mark with its Entry, so removal can no longer shift marks.
  const preFlipDone = doneWorkSets(entry).length
  const seededHw = typeof entry.hw === 'number' ? entry.hw : preFlipDone
  set.done = !set.done
  const checked = set.done

  const mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const cardioEntry = mode === 'cardio'
  const timedEntry = mode === 'time'

  // Toggle never adds, removes or reorders entries, so the group geometry
  // (index/sg-based) is unaffected by the done-flag flip above and stays
  // valid for every completion check below.
  const { unit, isLastUnit } = describeUnit(A.entries, entryIdx)
  const unitDone = unitWorkDone(A.entries, unit)

  let exJustDone = false
  let workoutDone = false

  if (checked) {
    if (unitDone && isLastUnit) {
      workoutDone = true
    }
    // The "logged" notices are for work finishing, never for ticking prep: an
    // entry left with no work rows has nothing completed to announce
    // (GLOSSARY.md: Warm-up set).
    const hasWorkRows = entry.sets.some(isWorkSet)
    if (isExerciseDone(entry) && hasWorkRows) exJustDone = true
  }

  let newHighWater = seededHw
  let navigated = false
  let shouldRest = false
  let shouldStopRest = false

  if (checked) {
    const progress = setProgressHighWater(entry, seededHw)
    newHighWater = progress.highWater
    entry.hw = newHighWater
    if (progress.isNew) {
      // A unit whose rows are all ticked ends any running rest timer — but only on
      // genuinely new progress, so re-checking finished work never cuts rest short.
      if (unitDone) shouldStopRest = true
      if (!unit || unit.length <= 1) {
        if (!unitDone || !isLastUnit) {
          shouldRest = true
        }
      } else {
        const step = supersetFlowStep(A.entries, unit, entryIdx)
        if (step) {
          if (step.unitDone) {
            if (!isLastUnit) {
              shouldRest = true
            }
          } else {
            if (step.nextIdx != null) {
              A.cur = step.nextIdx
              navigated = true
            }
            if (step.roundDone) {
              shouldRest = true
            }
          }
        }
      }
    }
  } else if (typeof entry.hw !== 'number') {
    // Seed even on an uncheck: a legacy Entry's first interaction may be an
    // uncheck, and the later re-check must then not count as new progress.
    entry.hw = seededHw
  }

  // One decision, computed where the geometry already lives.
  let next
  if (workoutDone) next = { kind: 'open-finish', targetIdx: null }
  else if (navigated) next = { kind: 'advance-to', targetIdx: A.cur }
  else next = { kind: 'stay', targetIdx: null }

  return {
    checked,
    mode,
    cur: A.cur,
    next,
    rest: { start: shouldRest, stop: shouldStopRest },
    notice: exJustDone && cardioEntry ? 'cardio' : exJustDone && timedEntry ? 'timed' : null
  }
}
