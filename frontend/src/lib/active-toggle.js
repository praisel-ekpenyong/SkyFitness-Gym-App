import { modeOf, isWorkSet, doneWorkSets, hasWork, isExerciseDone } from './workout-model.js'
import {
  supersetUnits, unitOf,
  setProgressHighWater, supersetFlowStep
} from './supersetFlow.js'

function describeUnit(entries, entryIdx) {
  const units = supersetUnits(entries)
  const unit = unitOf(units, entryIdx)
  const unitIdx = units.findIndex(u => u === unit)
  const isLastUnit = unitIdx >= units.length - 1
  return { units, unit, unitIdx, isLastUnit }
}

const unitWorkDone = (entries, unit) => !unit.some(i => hasWork(entries, i))

export function toggleActiveSet(S, entryIdx, setIdx) {
  const A = S?.active
  const entry = A?.entries?.[entryIdx]
  if (!entry || !entry.sets?.[setIdx]) return null

  const set = entry.sets[setIdx]
  const preFlipDone = doneWorkSets(entry).length
  const seededHw = typeof entry.hw === 'number' ? entry.hw : preFlipDone
  set.done = !set.done
  const checked = set.done

  const mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const cardioEntry = mode === 'cardio'
  const timedEntry = mode === 'time'

  const { unit, isLastUnit } = describeUnit(A.entries, entryIdx)
  const unitDone = unitWorkDone(A.entries, unit)

  let exJustDone = false
  let workoutDone = false

  if (checked) {
    if (unitDone && isLastUnit) {
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
    rest: { start: shouldRest, stop: shouldStopRest },
    notice: exJustDone && cardioEntry ? 'cardio' : exJustDone && timedEntry ? 'timed' : null
  }
}
