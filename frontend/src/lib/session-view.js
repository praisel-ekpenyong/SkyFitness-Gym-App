import { supersetUnits } from './supersetFlow.js'
import { workSets, doneWorkSets, sessionProgress, isPerformed, isWarmupRow } from './workout-model.js'

/**
 * The one read model of an Active workout: its Steps, the cursor and Session progress.
 * @param {Object|null} active - The Active workout.
 */
export function sessionView(active) {
  const entries = Array.isArray(active?.entries) ? active.entries : []
  const entryProgress = entries.map(e => ({ done: doneWorkSets(e).length, total: workSets(e).length }))
  const steps = supersetUnits(entries).map(idxs => ({
    entries: idxs,
    done: idxs.reduce((n, i) => n + entryProgress[i].done, 0),
    total: idxs.reduce((n, i) => n + entryProgress[i].total, 0),
  }))
  const cur = Math.min(active?.cur ?? 0, Math.max(0, entries.length - 1))
  const stepIdx = steps.findIndex(s => s.entries.includes(cur))
  const step = steps[stepIdx] ?? null
  const stepDone = !!step && step.total > 0 && step.done === step.total
  const nextStep = stepDone ? steps[stepIdx + 1] ?? null : null
  const progress = sessionProgress({ entries })
  const canPrev = stepIdx > 0
  const canNext = stepIdx >= 0 && stepIdx < steps.length - 1
  const hasPerformed = entries.map(e => (Array.isArray(e?.sets) ? e.sets : []).some(isPerformed))
  return { steps, cur, stepIdx, step, nextStep, canPrev, canNext, progress, entryProgress, hasPerformed, finishGate: finishGate(entries, progress) }
}

function finishGate(entries, progress) {
  if (!progress.done) {
    const warmupLogged = entries.some(e => (Array.isArray(e?.sets) ? e.sets : []).some(s => isPerformed(s) && isWarmupRow(s)))
    return warmupLogged ? 'warmups-only' : 'empty'
  }
  return progress.remaining > 0 ? 'early' : 'complete'
}
