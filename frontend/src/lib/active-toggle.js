import { modeOf, isWorkSet, doneWorkSets, hasWork, isExerciseDone } from './workout-model.js'
import {
  supersetUnits, unitOf,
  setProgressHighWater, supersetFlowStep
} from './supersetFlow.js'

function describeStep(entries, entryIdx) {
  const steps = supersetUnits(entries)
  const step = unitOf(steps, entryIdx)
  const stepIdx = steps.findIndex(s => s === step)
  const isLastStep = stepIdx >= steps.length - 1
  return { step, isLastStep }
}

const stepWorkDone = (entries, step) => !step.some(i => hasWork(entries, i))

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

  const { step: stepEntries, isLastStep } = describeStep(A.entries, entryIdx)
  const stepDone = stepWorkDone(A.entries, stepEntries)

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
    rest: { start: shouldRest, stop: shouldStopRest },
    notice: exJustDone && cardioEntry ? 'cardio' : exJustDone && timedEntry ? 'timed' : null
  }
}
