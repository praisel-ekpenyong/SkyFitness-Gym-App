// Pure milestone evaluation engine.
//
// Evaluates completed work sets during active workouts to provide immediate, inline
// progress cues (ADR 0016). Milestone evaluation is purely reactive and side-effect free:
// - Evaluates work sets only; warm-up rows are excluded and remain silent.
// - Returns null when a set is uncompleted, missing target criteria, or below target.
// - Sets falling short of target are recorded quietly without punitive warnings.
// - Unchecking or lowering reps/seconds immediately removes the milestone descriptor.
import { isWarmupRow, isPerformed, isWorkSet, modeOf, repStep, lastEntryFor } from './workout-model.js'
import { defaultIncrement } from './progression.js'
import { t } from './i18n.js'

const positive = v => (Number.isFinite(v) && v > 0 ? v : null)

/**
 * Resolve the progression policy in force for milestone evaluation.
 *
 * Precedence:
 * 1. Plan-level policy frozen at session start (`entry.plan.policy`).
 * 2. Explicit target progression override (`target.prog` or `entry.prog`).
 * 3. Routine-level default if supplied (`routine?.prog`).
 * 4. Mode defaults ('linear' for reps, 'time' for time holds, 'off' for cardio or when explicitly off).
 *
 * @param {Object} entry - Active workout entry.
 * @param {string} mode - Logging mode ('reps' | 'time' | 'cardio').
 * @param {Object} [routine] - Optional parent routine object.
 * @returns {string} Progression policy name.
 */
export function resolvePolicy(entry, mode, routine) {
  if (entry?.plan?.policy) return entry.plan.policy
  const target = entry?.target || entry || {}
  if (target.prog) return target.prog
  if (entry?.prog) return entry.prog
  if (target.policy) return target.policy
  if (entry?.policy) return entry.policy
  if (routine?.prog) return routine.prog
  if (mode === 'reps') return 'linear'
  if (mode === 'time') return 'time'
  return 'off'
}

/**
 * Evaluate whether a completed work set achieved a progression milestone.
 *
 * @param {Object} entry - Active workout entry containing `{ target, sets, plan?, id? }`.
 * @param {number} setIdx - Zero-based index of the set in `entry.sets`.
 * @param {Object} [context] - Optional context `{ state?, unit?, inc?, lastEntry?, last?, prevWeakest? }`.
 * @returns {Object|null} Milestone descriptor `{ kind, label, ... }` or null if no milestone.
 */
export function evaluateSetMilestone(entry, setIdx, context = {}) {
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.sets)) return null
  if (setIdx == null || setIdx < 0 || setIdx >= entry.sets.length) return null

  const s = entry.sets[setIdx]
  if (!s || typeof s !== 'object') return null

  // Warm-up sets and uncompleted sets never receive milestone cues (ADR 0016).
  if (!isPerformed(s) || isWarmupRow(s)) return null

  const target = entry.target || entry || {}
  const mode = modeOf({ ...target, id: entry.id })
  const S = context?.state || (context?.workouts || context?.unit ? context : null)
  const routine = context?.routine || (S?.active?.routineId ? (S?.routines || []).find(r => r.id === S.active.routineId) : null)
  const policy = resolvePolicy(entry, mode, routine)

  if (policy === 'off') return null

  const unit = context?.unit || S?.unit || 'kg'
  const inc = context?.inc > 0
    ? context.inc
    : (target.inc > 0 ? target.inc : (typeof defaultIncrement === 'function' ? defaultIncrement(entry.id, unit) : 2.5))

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

  if (policy === 'double') {
    const targetReps = Number(target.reps ?? target.r ?? (entry.plan && entry.plan.reps)) || 0
    if (targetReps <= 0) return null

    const reps = Number(s.r ?? s.reps) || 0
    const workRows = entry.sets.filter(isWorkSet)
    const plannedCount = positive(entry?.plan?.sets) ?? positive(target.sets) ?? workRows.length
    const plannedWorkSets = workRows.slice(0, plannedCount)
    const workIdx = workRows.indexOf(s)

    // Intermediate work set meeting rep ceiling
    if (workIdx >= 0 && workIdx < plannedCount - 1 && reps >= targetReps) {
      return {
        kind: 'hit',
        label: t('{0}/{1} reps · On track', reps, targetReps),
        reps,
        targetReps
      }
    }

    // Final planned work set: check if all planned work sets met or exceeded rep ceiling at working weight
    if (workIdx === plannedCount - 1) {
      const targetWeight = Number(target.weight ?? (entry.plan && entry.plan.weight)) || 0
      const baseWeight = targetWeight > 0 ? targetWeight : (Number(plannedWorkSets[0]?.w) || 0)

      const allSetsHitCeiling = plannedWorkSets.length === plannedCount && plannedWorkSets.every(ws => {
        if (!isPerformed(ws)) return false
        const r = Number(ws.r ?? ws.reps) || 0
        if (r < targetReps) return false
        if (baseWeight > 0) {
          const w = ws.w != null ? Number(ws.w) : baseWeight
          if (w < baseWeight) return false
        }
        return true
      })

      if (allSetsHitCeiling) {
        return {
          kind: 'unlocked',
          label: t('All sets hit! +{0} {1} unlocked next session', inc, unit),
          inc,
          unit,
          reps,
          targetReps
        }
      }

      if (reps >= targetReps) {
        return {
          kind: 'hit',
          label: t('{0}/{1} reps', reps, targetReps),
          reps,
          targetReps
        }
      }
    }

    // If work set did not hit the rep ceiling, check for rep progress against previous weakest set
    if (reps < targetReps) {
      let prevWeakest = null
      if (context?.prevWeakest != null) {
        prevWeakest = Number(context.prevWeakest)
      } else {
        const prevSession = context?.lastEntry ?? context?.last ?? (S ? lastEntryFor(S, entry.id) : null) ?? entry.lastEntry ?? entry.prev
        if (prevSession) {
          if (prevSession.low != null) {
            prevWeakest = Number(prevSession.low)
          } else if (Array.isArray(prevSession.sets)) {
            const prevWork = prevSession.sets.filter(isWorkSet).filter(isPerformed)
            if (prevWork.length > 0) {
              prevWeakest = Math.min(...prevWork.map(ws => Number(ws.r ?? ws.reps) || 0))
            }
          }
        }
      }

      if (prevWeakest != null && prevWeakest > 0) {
        const step = repStep(target || entry)
        const aim = prevWeakest + step
        if (reps >= aim) {
          const progressStep = reps - prevWeakest
          return {
            kind: 'progress',
            label: t('Rep progress (+{0})', progressStep),
            step: progressStep,
            reps,
            targetReps
          }
        }
      }
    }

    // Bonus work set beyond planned count meeting rep ceiling
    if (workIdx >= plannedCount && reps >= targetReps) {
      return {
        kind: 'hit',
        label: t('{0}/{1} reps', reps, targetReps),
        reps,
        targetReps
      }
    }

    return null
  }

  if (policy === 'greyskull') {
    const targetReps = Number(target.reps ?? target.r ?? (entry.plan && entry.plan.reps)) || 0
    if (targetReps <= 0) return null

    const reps = Number(s.r ?? s.reps) || 0
    const workRows = entry.sets.filter(isWorkSet)
    const plannedCount = positive(entry?.plan?.sets) ?? positive(target.sets) ?? workRows.length
    const workIdx = workRows.indexOf(s)

    const isAMRAP = workIdx === plannedCount - 1

    if (isAMRAP) {
      if (reps >= targetReps * 2) {
        return {
          kind: 'bonus',
          label: t('Double increment unlocked! (+{0} {1})', inc * 2, unit),
          reps,
          targetReps,
          bonusReps: reps - targetReps,
          doubleIncrement: true,
          inc: inc * 2,
          unit
        }
      }

      if (reps > targetReps) {
        const bonusReps = reps - targetReps
        return {
          kind: 'bonus',
          label: t('AMRAP +{0}', bonusReps),
          reps,
          targetReps,
          bonusReps
        }
      }

      if (reps === targetReps) {
        return {
          kind: 'hit',
          label: t('{0}/{1} reps', reps, targetReps),
          reps,
          targetReps
        }
      }

      return null
    }

    // Intermediate work set under Greyskull LP
    if (reps >= targetReps) {
      return {
        kind: 'hit',
        label: t('{0}/{1} reps', reps, targetReps),
        reps,
        targetReps
      }
    }

    return null
  }

  return null
}
