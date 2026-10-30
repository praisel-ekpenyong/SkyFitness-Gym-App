// Pure milestone and session progression engine.
//
// Evaluates completed work sets during active workouts to provide immediate, inline
// progress cues (ADR 0016), and computes progression summary items for completed
// workouts at the session boundary.
//
// Milestone evaluation is purely reactive and side-effect free:
// - Evaluates work sets only; warm-up rows are excluded and remain silent.
// - Returns null when a set is uncompleted, missing target criteria, or below target.
// - Sets falling short of target are recorded quietly without punitive warnings.
// - Unchecking or lowering reps/seconds immediately removes the milestone descriptor.
import {
  isWarmupRow,
  isPerformed,
  isWorkSet,
  modeOf,
  repStep,
  lastEntryFor,
  doneWorkSets,
  defaultConfig,
  isBw
} from './workout-model.js'
import {
  defaultIncrement,
  policyFor,
  POLICY_NAME,
  nextPrescription
} from './progression.js'
import { EXIDX } from './exercises.js'
import { fmtNum } from './format.js'
import { t } from './i18n.js'
import { heaviestSetWeight } from './active-workout.js'

const positive = v => (Number.isFinite(v) && v > 0 ? v : null)

/**
 * Resolve the progression policy in force for milestone evaluation.
 * Reuses policyFor from progression.js to maintain a single source of truth.
 *
 * @param {Object} entry - Active workout entry.
 * @param {string} mode - Logging mode ('reps' | 'time' | 'cardio').
 * @param {Object} [routine] - Optional parent routine object.
 * @returns {string} Progression policy name.
 */
export function resolvePolicy(entry, mode, routine) {
  const target = entry?.target || entry || {}
  const cfg = {
    ...target,
    prog: entry?.plan?.policy || target.prog || entry?.prog || target.policy || entry?.policy
  }
  return policyFor(cfg, routine, mode)
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

    const workRows = entry.sets.filter(isWorkSet)
    const plannedCount = positive(entry?.plan?.sets) ?? positive(target.sets) ?? workRows.length
    const plannedWorkSets = workRows.slice(0, plannedCount)
    const workIdx = workRows.indexOf(s)

    // Final planned work set: check if all planned work sets met or exceeded target reps at working weight
    if (workIdx === plannedCount - 1) {
      const targetWeight = Number(target.weight ?? (entry.plan && entry.plan.weight)) || 0
      const baseWeight = targetWeight > 0 ? targetWeight : (Number(plannedWorkSets[0]?.w) || 0)
      const isLoadless = baseWeight <= 0 || (isBw({ ...target, id: entry.id }) && targetWeight <= 0)

      const allSetsHit = plannedWorkSets.length === plannedCount && plannedWorkSets.every(ws => {
        if (!isPerformed(ws)) return false
        const r = Number(ws.r ?? ws.reps) || 0
        if (r < targetReps) return false
        if (baseWeight > 0) {
          const w = ws.w != null ? Number(ws.w) : baseWeight
          if (w < baseWeight) return false
        }
        return true
      })

      if (allSetsHit) {
        return {
          kind: 'unlocked',
          label: isLoadless
            ? t('All sets hit! Next target unlocked')
            : t('All sets hit! +{0} {1} unlocked next session', inc, unit),
          ...(isLoadless ? {} : { inc, unit }),
          reps,
          targetReps
        }
      }
    }

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
      const isLoadless = baseWeight <= 0 || (isBw({ ...target, id: entry.id }) && targetWeight <= 0)

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
          label: isLoadless
            ? t('All sets hit! Next target unlocked')
            : t('All sets hit! +{0} {1} unlocked next session', inc, unit),
          ...(isLoadless ? {} : { inc, unit }),
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

/**
 * Evaluates a single completed entry against its next prescription, returning a progression descriptor.
 *
 * @param {Object} entry Completed workout entry.
 * @param {Object} state Store state S.
 * @param {Object} [context] Optional { workout, routine }.
 * @returns {Object|null} Progression descriptor or null if no performed work sets.
 */
export function evaluateSessionProgression(entry, state, context = {}) {
  if (!entry || doneWorkSets(entry).length <= 0) return null

  const workout = context?.workout
  const routine = context?.routine ||
    (workout?.routineId ? state?.routines?.find(r => r.id === workout.routineId) : null) ||
    null

  // Ensure effectiveS includes the workout containing this entry if not already present
  let effectiveS = state
  if (workout) {
    const inWorkouts = (state?.workouts || []).some(w => w.id === workout.id || w === workout)
    if (!inWorkouts) {
      effectiveS = { ...(state || {}), workouts: [...(state?.workouts || []), workout] }
    }
  } else {
    const inWorkouts = (state?.workouts || []).some(w => (w.entries || []).includes(entry))
    if (!inWorkouts) {
      const dummyWorkout = {
        id: 'session-entry-' + entry.id,
        d: entry.d || new Date().toISOString().slice(0, 10),
        entries: [entry],
        unit: state?.unit || 'kg'
      }
      effectiveS = { ...(state || {}), workouts: [...(state?.workouts || []), dummyWorkout] }
    }
  }

  const cfg = { ...defaultConfig(entry.id), ...(entry.target || {}), id: entry.id }
  const p = nextPrescription(effectiveS, cfg, routine)
  const ex = EXIDX[entry.id] || { n: entry.id }
  const exName = ex.n || entry.id
  const unit = state?.unit || workout?.unit || 'kg'
  const policy = p.policy || policyFor(cfg, routine)
  const policyName = POLICY_NAME[policy] || policy

  const oldWeight = heaviestSetWeight(entry) || entry.target?.weight || 0
  const isLoadless = (p.weight === 0) || (oldWeight <= 0 && isBw(cfg)) || (p.weight == null && isBw(cfg))

  let text = ''
  let iconName = 'check'
  let isAdvance = false

  if (p.kind === 'up') {
    isAdvance = true
    iconName = 'arrowUp'
    if (!isLoadless && p.weight != null && p.weight > 0) {
      const delta = Math.round((p.weight - oldWeight) * 10) / 10
      const deltaStr = delta > 0 ? ` (+${fmtNum(delta)} ${unit})` : ''
      text = `${fmtNum(oldWeight)} ${unit} → ${fmtNum(p.weight)} ${unit}${deltaStr}`
    } else if (p.sec != null) {
      const oldSec = entry.target?.sec || 0
      const deltaSec = p.sec - oldSec
      const deltaStr = deltaSec > 0 ? ` (+${deltaSec}s)` : ''
      text = `${oldSec}s → ${p.sec}s${deltaStr}`
    } else if (p.sets != null) {
      text = t('{0} sets (+1 set)', p.sets)
    } else if (p.reps != null) {
      text = t('Aim for {0} reps', p.reps)
    } else {
      text = t('Progress earned')
    }
  } else if (p.kind === 'deload') {
    iconName = 'info'
    text = t('Deload 10% to reset and rebuild')
  } else if (p.kind === 'hold') {
    if (policy === 'double' && p.reps != null) {
      iconName = 'target'
      const wVal = p.weight ?? oldWeight
      if (wVal > 0 && !isLoadless) {
        text = t('Aim for {0} reps at {1} {2}', p.reps, fmtNum(wVal), unit)
      } else {
        text = t('Aim for {0} reps', p.reps)
      }
    } else if (p.sec != null) {
      iconName = 'check'
      text = t('Hold at {0}s to solidify volume', p.sec)
    } else if (isLoadless && p.reps != null) {
      iconName = 'check'
      text = t('Hold at {0} reps to solidify volume', p.reps)
    } else if (oldWeight <= 0 && p.reps != null) {
      iconName = 'check'
      text = t('Hold at {0} reps to solidify volume', p.reps)
    } else {
      iconName = 'check'
      const wVal = p.weight ?? oldWeight
      text = t('Hold at {0} {1} to solidify volume', fmtNum(wVal), unit)
    }
  } else if (p.kind === 'first') {
    iconName = 'target'
    text = t('First session baseline')
  } else {
    iconName = 'check'
    text = t('Targets stay where you set them')
  }

  const label = text
  const ariaLabel = `${exName}: ${policyName}, ${text}`

  return {
    id: entry.id,
    exName,
    policy,
    policyName,
    kind: p.kind,
    weight: p.weight,
    reps: p.reps,
    sec: p.sec,
    sets: p.sets,
    why: p.why,
    label,
    text,
    iconName,
    isAdvance,
    ariaLabel,
  }
}

/**
 * Derives progression descriptors for all trained exercises in a completed workout.
 *
 * @param {Object} workout Completed workout.
 * @param {Object} state Store state S.
 * @returns {Array<Object>} List of progression descriptors for trained exercises.
 */
export function sessionProgressionItems(workout, state) {
  if (!workout?.entries) return []
  const routine = (workout.routineId && state?.routines?.find(r => r.id === workout.routineId)) || null
  const effectiveS = (state?.workouts || []).some(item => item.id === workout.id || item === workout)
    ? state
    : { ...(state || {}), workouts: [...(state?.workouts || []), workout] }

  const items = []
  for (const entry of workout.entries) {
    if (doneWorkSets(entry).length <= 0) continue
    const item = evaluateSessionProgression(entry, effectiveS, { workout, routine })
    if (item) items.push(item)
  }
  return items
}
