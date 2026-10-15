// Toggle decision — one slice of the active-workout lifecycle.
//
// Flipping a set Row's done flag plus every navigation consequence: the
// `next` action sheets render (no re-derivation across the seam), rest-timer
// intent, and the weight-commit follow-up. Session construction lives in
// active-session.js, set surgery in active-sets.js, finishing in
// active-finish.js.
import { modeOf, isBw } from './workout-model.js'
import {
  supersetUnits, unitOf, hasWork,
  setProgressHighWater, supersetFlowStep, isExerciseDone
} from './supersetFlow.js'
import { applyWorkingWeight } from './active-finish.js'

/**
 * Describe the superset unit holding `entryIdx`.
 *
 * Single home for the group geometry both toggle and the weight-commit
 * follow-up read, so sheets never re-derive it across the seam.
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
 * Preview the follow-up to recording a working weight, without mutating.
 *
 * Pure read of the current entries: when the unit is done the follow-up is
 * an advance (or the finish prompt on the last unit), otherwise the sheet
 * just closes. Labels and the commit path share this one function.
 *
 * Valid only after the toggle opened the weight prompt (`next.kind ===
 * 'open-topweight'`, i.e. a loaded reps Entry just finished): geometry alone
 * cannot tell a cardio finale (no weight step) from a loaded one, so callers
 * must not peek units the toggle didn't flag. Returns null when the entry
 * is gone (the finish-under-sheet teardown race).
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of entry in active session.
 * @returns {{ kind: string, targetIdx: number|null, unitDone: boolean, isLastUnit: boolean, unitSize: number }|null}
 *   `kind` is 'topweight-then-advance' | 'topweight-then-finish' | 'stay';
 *   `unitSize` is the member count of the holding superset unit (1 when solo),
 *   so sheets can phrase partner hints without re-deriving geometry.
 */
export function peekWeightCommit(S, entryIdx) {
  const entry = S?.active?.entries?.[entryIdx]
  if (!entry) return null
  const entries = S.active.entries
  const { units, unit, unitIdx, isLastUnit } = describeUnit(entries, entryIdx)
  const unitDone = !!unit.length && !unit.some(i => hasWork(entries, i))
  const unitSize = unit.length
  if (!unitDone) return { kind: 'stay', targetIdx: null, unitDone, isLastUnit, unitSize }
  if (isLastUnit) return { kind: 'topweight-then-finish', targetIdx: null, unitDone, isLastUnit, unitSize }
  const targetIdx = units[unitIdx + 1]?.[0] ?? null
  return { kind: 'topweight-then-advance', targetIdx, unitDone, isLastUnit, unitSize }
}

/**
 * Record the confirmed working weight and return the follow-up in one call.
 *
 * Recording and deciding share the call so the Active workout can never
 * change between them (the sheet's teardown race). Returns null when the
 * weight is invalid or the entry is gone.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of entry in active session.
 * @param {number} weight - Working load in active units.
 * @param {Object} [opts] - Injectable clock options for testing (`todayISO`).
 * @returns {{ kind: string, targetIdx: number|null, unitDone: boolean, isLastUnit: boolean, unitSize: number }|null}
 */
export function commitWorkingWeight(S, entryIdx, weight, opts = {}) {
  const ok = applyWorkingWeight(S, entryIdx, weight, opts)
  if (!ok) return null
  return peekWeightCommit(S, entryIdx)
}

/**
 * Toggle completion of a set row and compute all workout lifecycle transitions.
 *
 * Encapsulates the complete state transition for a set toggle:
 * - Flips `set.done` boolean.
 * - Tracks high-water mark progress on work sets (ignoring warm-up rows).
 * - Detects exercise, superset unit, and entire workout completion.
 * - Executes superset wrap-around navigation (`A.cur`).
 * - Flags when working weight confirmation sheet (`topW`) should prompt.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of active entry.
 * @param {number} setIdx - Index of set row being toggled.
 * @param {Object} [opts] - Session progress tracking options.
 * @param {number} [opts.highWater=0] - Previous high-water count of completed work sets in mounted exercise.
 * @returns {Object|null} Declarative outcome descriptor for UI side effects, or null on invalid target:
 *   - `checked`: boolean indicating new `done` state of the set.
 *   - `askTop`: boolean indicating working-weight confirmation sheet should open.
 *   - `workoutDone`: boolean indicating all units in the workout are finished.
 *   - `exJustDone`: boolean indicating the current exercise just finished all work sets.
 *   - `cardioEntry`: boolean indicating if entry is cardio mode.
 *   - `timedEntry`: boolean indicating if entry is timed mode.
 *   - `mode`: 'reps' | 'time' | 'cardio'.
 *   - `newHighWater`: updated maximum completed work sets.
 *   - `navigated`: boolean indicating whether `active.cur` transitioned to a partner/next unit.
 *   - `shouldRest`: boolean indicating rest timer should start.
 *   - `shouldStopRest`: boolean indicating running rest timer should cancel.
 *   - `roundDone`: boolean indicating all members in current superset round are completed.
 *   - `unitDone`: boolean indicating entire superset unit is completed.
 *   - `cur`: current active exercise index after any navigation.
 *   - `next`: which sheet opens next — 'open-topweight' | 'open-finish' | 'advance-to' | 'stay',
 *     with `targetIdx` for 'advance-to'. Sheets render it; they never re-derive geometry.
 */
export function toggleActiveSet(S, entryIdx, setIdx, opts = {}) {
  const A = S?.active
  const entry = A?.entries?.[entryIdx]
  if (!entry || !entry.sets?.[setIdx]) return null

  const set = entry.sets[setIdx]
  set.done = !set.done
  const checked = set.done

  const mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const cardioEntry = mode === 'cardio'
  const timedEntry = mode === 'time'

  // Toggle never adds, removes or reorders entries, so the group geometry derived
  // here before the done-flag flip stays valid for every completion check below.
  const { units, unit, unitIdx, isLastUnit } = describeUnit(A.entries, entryIdx)
  // Warm-up rows are prep, not work. The unit is done when no member has an
  // undone work row — the same `hasWork` rule the superset step below reads, so
  // an unticked warm-up can no longer keep a finished unit reading as unfinished.
  const unitDone = !unit.some(ui => hasWork(A.entries, ui))

  let askTop = false
  let exJustDone = false
  let workoutDone = false

  if (checked) {
    if (unitDone && isLastUnit) {
      workoutDone = true
    }
    const loaded = mode === 'reps' && !(isBw({ ...(entry.target || {}), id: entry.id }) && !entry.sets.some(x => x.w > 0))
    if (isExerciseDone(entry)) {
      exJustDone = true
      if (loaded && !entry.asked) {
        entry.asked = true
        askTop = true
      }
    }
  }

  let newHighWater = opts.highWater
  let navigated = false
  let shouldRest = false
  let shouldStopRest = false
  let roundDone = false

  if (checked) {
    const currentHw = opts.highWater != null ? opts.highWater : 0
    const progress = setProgressHighWater(entry, currentHw)
    newHighWater = progress.highWater

    if (progress.isNew) {
      // A unit whose rows are all ticked ends any running rest timer — but only on
      // genuinely new progress, so re-checking finished work never cuts rest short.
      if (unitDone) shouldStopRest = true
      if (!unit || unit.length <= 1) {
        if (!unitDone) {
          shouldRest = true
        }
      } else {
        const step = supersetFlowStep(A.entries, unit, entryIdx)
        if (step) {
          if (step.unitDone) {
            if (!isLastUnit) {
              const nextUnit = units[unitIdx + 1]
              if (!askTop && nextUnit?.length) {
                A.cur = nextUnit[0]
                navigated = true
              }
              shouldRest = true
            }
          } else {
            if (step.nextIdx != null) {
              A.cur = step.nextIdx
              navigated = true
            }
            if (step.roundDone) {
              shouldRest = true
              roundDone = true
            }
          }
        }
      }
    }
  }

  // One decision, computed where the geometry already lives. `askTop` keeps
  // priority over `workoutDone`: the weight prompt opens first and its own
  // follow-up (topweight-then-finish) carries the finish prompt.
  let next
  if (askTop) next = { kind: 'open-topweight', targetIdx: null }
  else if (workoutDone) next = { kind: 'open-finish', targetIdx: null }
  else if (navigated) next = { kind: 'advance-to', targetIdx: A.cur }
  else next = { kind: 'stay', targetIdx: null }

  return {
    checked,
    askTop,
    workoutDone,
    exJustDone,
    cardioEntry,
    timedEntry,
    mode,
    newHighWater,
    navigated,
    shouldRest,
    shouldStopRest,
    roundDone,
    unitDone,
    cur: A.cur,
    next
  }
}
