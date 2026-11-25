import { modeOf, isExerciseDone, ownRest } from './workout-model.js'
import { isWorkSet, doneWorkSets } from './workout-sets.js'
import { setProgressHighWater, supersetFlowStep } from './supersetFlow.js'
import { stepOf } from './session-view.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Entry} Entry */

/**
 * The rest after a set in a Step: the longest Rest duration among its Entries, an Entry
 * without its own counting as the Profile's (ADR 0029). Null when no Entry has its own,
 * so the effect runner applies the Profile's.
 * @param {Profile} S
 * @param {Entry[]} entries
 * @param {number[]} stepEntries
 * @returns {number | null}
 */
function stepRest(S, entries, stepEntries) {
  const own = stepEntries.map(i => ownRest(entries[i]?.target))
  if (!own.some(sec => sec != null)) return null
  const profile = S.restSec > 0 ? S.restSec : 0
  return Math.max(...own.map(sec => sec ?? profile))
}

/**
 * Toggle a Set's `done` flag and compute navigation, rest timer, and completion notice.
 * @param {Profile} S
 * @param {number} entryIdx
 * @param {number} setIdx
 */
export function toggleActiveSet(S, entryIdx, setIdx) {
  const A = S?.active
  const entry = A?.entries?.[entryIdx]
  if (!A || !entry || !entry.sets?.[setIdx]) return null

  const set = entry.sets[setIdx]
  const preFlipDone = doneWorkSets(entry).length
  const seededHw = typeof entry.hw === 'number' ? entry.hw : preFlipDone
  set.done = !set.done
  const checked = set.done

  const mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const cardioEntry = mode === 'cardio'
  const timedEntry = mode === 'time'

  const step = stepOf(A.entries, entryIdx)
  const stepEntries = step?.entries ?? [entryIdx]
  const isLastStep = step?.isLast ?? true
  const stepDone = !!step?.isDone

  let exJustDone = false
  let workoutDone = false

  if (checked) {
    if (stepDone && isLastStep) {
      workoutDone = true
    }
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
      if (stepDone) shouldStopRest = true
      if (!stepEntries || stepEntries.length <= 1) {
        if (!stepDone || !isLastStep) {
          shouldRest = true
        }
      } else {
        const flow = supersetFlowStep(A.entries, stepEntries, entryIdx)
        if (flow) {
          if (flow.unitDone) {
            if (!isLastStep) {
              shouldRest = true
            }
          } else {
            if (flow.nextIdx != null) {
              A.cur = flow.nextIdx
              navigated = true
            }
            if (flow.roundDone) {
              shouldRest = true
            }
          }
        }
      }
    }
  } else if (typeof entry.hw !== 'number') {
    entry.hw = seededHw
  }

  let next
  if (workoutDone) next = { kind: 'open-finish', targetIdx: null }
  else if (navigated) next = { kind: 'advance-to', targetIdx: A.cur }
  else next = { kind: 'stay', targetIdx: null }

  return {
    checked,
    mode,
    cur: A.cur,
    next,
    rest: { start: shouldRest, stop: shouldStopRest, sec: shouldRest ? stepRest(S, A.entries, stepEntries) : null },
    notice: exJustDone && cardioEntry ? 'cardio' : exJustDone && timedEntry ? 'timed' : null
  }
}
