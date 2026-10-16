// Toggle decision — one slice of the active-workout lifecycle.
//
// Flipping a set Row's done flag plus every navigation consequence: the
// `next` action sheets render (no re-derivation across the seam), rest-timer
// intent, and the weight-commit follow-up. Session construction lives in
// active-session.js, set surgery in active-sets.js, finishing in
// active-finish.js.
import { modeOf, isBw, isWarmupRow, hasWork, isExerciseDone } from './workout-model.js'
import {
  supersetUnits, unitOf,
  setProgressHighWater, supersetFlowStep
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
 * Owns the complete state transition for a set toggle: flips `set.done`,
 * tracks the per-Entry high-water mark of completed Work sets (ignoring
 * Warm-up sets) on `entry.hw`, detects exercise, superset unit, and whole
 * Workout completion, executes superset wrap-around navigation (`A.cur`),
 * and flags the working-weight confirmation sheet (`topW`).
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
 *   - `next`: which sheet opens next — 'open-topweight' | 'open-finish' | 'advance-to' | 'stay',
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
  const preFlipDone = entry.sets.reduce((n, s) => n + (s.done && !isWarmupRow(s) ? 1 : 0), 0)
  const seededHw = typeof entry.hw === 'number' ? entry.hw : preFlipDone
  set.done = !set.done
  const checked = set.done

  const mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const cardioEntry = mode === 'cardio'
  const timedEntry = mode === 'time'

  // Toggle never adds, removes or reorders entries, so the group geometry
  // (index/sg-based) is unaffected by the done-flag flip above and stays
  // valid for every completion check below.
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
    // The completion consequences — top-weight prompt, "logged" notices — are for
    // work finishing, never for ticking prep: an entry left with no work rows has
    // no top set to crown and nothing completed to announce (CONTEXT.md: Warm-up set).
    const hasWorkRows = entry.sets.some(s => !isWarmupRow(s))
    if (isExerciseDone(entry) && hasWorkRows) {
      exJustDone = true
      // Prompt at most once per Entry: an uncheck/re-check of the final set must
      // not reopen the sheet.
      if (loaded && !entry.asked) {
        entry.asked = true
        askTop = true
      }
    }
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
    mode,
    cur: A.cur,
    next,
    rest: { start: shouldRest, stop: shouldStopRest },
    notice: exJustDone && cardioEntry ? 'cardio' : exJustDone && timedEntry ? 'timed' : null
  }
}
