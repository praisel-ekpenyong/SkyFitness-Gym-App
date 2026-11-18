import { supersetUnits } from './supersetFlow.js'
import { sessionProgress, isWarmupRow } from './workout-model.js'
import { workSets, doneWorkSets, isPerformed } from './workout-sets.js'

const setsOf = e => (Array.isArray(e?.sets) ? e.sets : [])

/**
 * The one read model of an Active workout: its Steps, the cursor and Session progress.
 * @param {Object|null} active - The Active workout.
 */
export function sessionView(active) {
  const entries = Array.isArray(active?.entries) ? active.entries : []
  const { steps, entryProgress } = readSteps(entries)
  const cur = Math.min(active?.cur ?? 0, Math.max(0, entries.length - 1))
  const stepIdx = steps.findIndex(s => s.entries.includes(cur))
  const step = steps[stepIdx] ?? null
  const nextStep = step?.isDone ? steps[stepIdx + 1] ?? null : null
  const progress = sessionProgress({ entries })
  const canPrev = stepIdx > 0
  const canNext = stepIdx >= 0 && stepIdx < steps.length - 1
  const hasPerformed = entries.map(e => setsOf(e).some(isPerformed))
  return { steps, cur, stepIdx, step, nextStep, canPrev, canNext, progress, entryProgress, hasPerformed, finishGate: finishGate(entries, progress) }
}

/** A Step is done when it has Work sets and every one is performed; warm-ups never decide it. */
function readSteps(entries) {
  const entryProgress = entries.map(e => ({ done: doneWorkSets(e).length, total: workSets(e).length }))
  const units = supersetUnits(entries)
  const steps = units.map((idxs, k) => {
    const done = idxs.reduce((n, i) => n + entryProgress[i].done, 0)
    const total = idxs.reduce((n, i) => n + entryProgress[i].total, 0)
    return { entries: idxs, done, total, isDone: total > 0 && done === total, isLast: k === units.length - 1 }
  })
  return { steps, entryProgress }
}

/**
 * The Step holding one Entry, read by the same rule as sessionView. Internal to the Active workout.
 * @returns {{entries: number[], done: number, total: number, isDone: boolean, isLast: boolean}|null}
 */
export function stepOf(entries, entryIdx) {
  return readSteps(Array.isArray(entries) ? entries : []).steps.find(s => s.entries.includes(entryIdx)) ?? null
}

function finishGate(entries, progress) {
  if (!progress.done) {
    const warmupLogged = entries.some(e => setsOf(e).some(s => isPerformed(s) && isWarmupRow(s)))
    return warmupLogged ? 'warmups-only' : 'empty'
  }
  return progress.remaining > 0 ? 'early' : 'complete'
}
