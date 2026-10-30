// Pure milestone evaluation engine.
//
// Evaluates completed work sets during active workouts to provide immediate, inline
// progress cues (ADR 0016). Milestone evaluation is purely reactive and side-effect free:
// - Evaluates work sets only; warm-up rows are excluded and remain silent.
// - Returns null when a set is uncompleted, missing target criteria, or below target.
// - Sets falling short of target are recorded quietly without punitive warnings.
// - Unchecking or lowering reps/seconds immediately removes the milestone descriptor.
import { isWarmupRow, isPerformed, modeOf } from './workout-model.js'
import { t } from './i18n.js'

/**
 * Resolve the progression policy in force for milestone evaluation.
 *
 * Precedence:
 * 1. Plan-level policy frozen at session start (`entry.plan.policy`).
 * 2. Explicit target progression override (`target.prog` or `entry.prog`).
 * 3. Mode defaults ('linear' for reps, 'time' for time holds, 'off' for cardio or when explicitly off).
 *
 * @param {Object} entry - Active workout entry.
 * @param {string} mode - Logging mode ('reps' | 'time' | 'cardio').
 * @returns {string} Progression policy name.
 */
export function resolvePolicy(entry, mode) {
  if (entry?.plan?.policy) return entry.plan.policy
  const target = entry?.target || entry || {}
  if (target.prog) return target.prog
  if (entry?.prog) return entry.prog
  if (target.policy) return target.policy
  if (entry?.policy) return entry.policy
  if (mode === 'reps') return 'linear'
  if (mode === 'time') return 'time'
  return 'off'
}

/**
 * Evaluate whether a completed work set achieved a progression milestone.
 *
 * @param {Object} entry - Active workout entry containing `{ target, sets, plan?, id? }`.
 * @param {number} setIdx - Zero-based index of the set in `entry.sets`.
 * @returns {Object|null} Milestone descriptor `{ kind, label, ... }` or null if no milestone.
 */
export function evaluateSetMilestone(entry, setIdx) {
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.sets)) return null
  if (setIdx == null || setIdx < 0 || setIdx >= entry.sets.length) return null

  const s = entry.sets[setIdx]
  if (!s || typeof s !== 'object') return null

  // Warm-up sets and uncompleted sets never receive milestone cues (ADR 0016).
  if (!isPerformed(s) || isWarmupRow(s)) return null

  const target = entry.target || entry || {}
  const mode = modeOf({ ...target, id: entry.id })
  const policy = resolvePolicy(entry, mode)

  if (policy === 'off') return null

  if (policy === 'linear') {
    const targetReps = Number(target.reps ?? target.r ?? (entry.plan && entry.plan.reps)) || 0
    if (targetReps <= 0) return null

    const reps = Number(s.r ?? s.reps) || 0
    if (reps < targetReps) return null

    return {
      kind: 'hit',
      label: t('{0}/{1} reps', reps, targetReps),
      reps,
      targetReps
    }
  }

  if (policy === 'time') {
    const targetSec = Number(target.sec ?? (entry.plan && entry.plan.sec)) || 0
    if (targetSec <= 0) return null

    const sec = Number(s.sec ?? s.seconds) || 0
    if (sec < targetSec) return null

    return {
      kind: 'hit',
      label: t('{0}s hold', sec),
      sec,
      targetSec
    }
  }

  return null
}
