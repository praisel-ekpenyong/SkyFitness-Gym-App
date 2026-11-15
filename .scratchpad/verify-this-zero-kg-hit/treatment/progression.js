import { EXIDX } from './exercises.js'
import { isWorkSet, isPerformed, workSets, modeOf, repStep, makeRow, modeForSet } from './workout-model.js'

export const POLICIES = ['off', 'linear', 'greyskull', 'double', 'time']

export const POLICIES_FOR = {
  reps: ['off', 'linear', 'greyskull', 'double'],
  time: ['off', 'time'],
  cardio: ['off']
}
export const POLICY_NAME = {
  off: 'No automatic progression',
  linear: 'Linear progression',
  greyskull: 'Greyskull LP',
  double: 'Double progression',
  time: 'Add time'
}
export const POLICY_DESC = {
  off: 'Targets stay where you set them.',
  linear: 'Hit every rep in every set and the weight goes up. Repeated misses trigger a deload.',
  greyskull: 'Two straight sets plus a final set taken to failure. Beat the target on that set and the weight goes up — double if you double the reps. One failure resets 10 %.',
  double: 'Work up through a rep range at the same weight. Reach the top of the range in every set and the weight goes up, reps back to the bottom.',
  time: 'Hold every set for the full duration and the target goes up.'
}

export const DELOAD_AFTER = { linear: 3, greyskull: 1, double: 3, time: 3 }
const DELOAD_FACTOR = 0.9

const HEAVY_BP = ['upper legs', 'lower legs', 'back', 'hips', 'glutes']

export function defaultIncrement(exId, unit) {
  const ex = EXIDX[exId]
  const heavy = ex && HEAVY_BP.includes(ex.bp)
  if (unit === 'lb') return heavy ? 10 : 5
  return heavy ? 5 : 2.5
}
export const DEFAULT_SEC_INCREMENT = 5

export const MIN_TIME_SEC = 5
const clampTimeSec = v => (v > 0 ? v : MIN_TIME_SEC)

export const MAX_BW_SETS = 6
export function policyFor(cfg, routine, mode) {
  const m = mode || modeOf(cfg || {})
  const allowed = POLICIES_FOR[m] || ['off']
  const pick = (cfg && cfg.prog) || (routine && routine.prog) || (m === 'reps' ? 'linear' : 'off')
  return allowed.includes(pick) ? pick : 'off'
}

const round1 = v => Math.round(v * 10) / 10
function snap(v, step) {
  if (!(step > 0)) return round1(v)
  return round1(Math.round(v / step) * step)
}
function deloadTo(cur, step) {
  let next = snap(cur * DELOAD_FACTOR, step)
  if (next >= cur) next = snap(cur - step, step)
  return Math.max(step, next)
}

function asHoldOrDeload(cur, step, onHold, onDeload) {
  const next = deloadTo(cur, step)
  return next >= cur ? onHold() : onDeload(next)
}

export function readSession(entry, fallback) {
  const target = (entry && entry.target) || fallback || {}
  const mode = modeOf({ ...target, id: entry && entry.id })
  const sets = workSets(entry)
  const planned = target.sets || sets.length
  const judged = sets.slice(0, planned)
  const enough = sets.length >= planned

  if (mode === 'time') {
    const goal = target.sec || 0
    const held = judged.map(s => (isPerformed(s) ? (s.sec || 0) : 0))
    return {
      mode, goal, held,
      weight: Math.max(0, ...judged.filter(isPerformed).map(s => s.w || 0)),
      best: Math.max(0, ...held),
      ok: goal > 0 && enough && held.length > 0 && held.every(h => h >= goal)
    }
  }
  const goal = target.reps || 0
  const reps = judged.map(s => (isPerformed(s) ? (s.r || 0) : 0))
  const performed = judged.filter(isPerformed)
  const weight = performed.length ? Math.max(0, ...performed.map(s => s.w || 0)) : null
  return {
    mode, goal, reps,
    weight,
    count: judged.length,
    low: reps.length ? Math.min(...reps) : 0,
    amrap: reps.length ? reps[reps.length - 1] : 0,
    ok: goal > 0 && enough && reps.length > 0 && reps.every(r => r >= goal)
  }
}

export function sessionsFor(S, exId, fallback) {
  const out = []
  ;(S.workouts || []).forEach(w => {
    const entry = (w.entries || []).find(e => e.id === exId)
    if (workSets(entry).length) out.push({ d: w.d, ...readSession(entry, fallback) })
  })
  return out
}

export function stallCount(sessions) {
  let n = 0
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].ok) break
    n++
  }
  return n
}

export function nextPrescription(S, cfg, routine) {
  const mode = modeOf(cfg)
  const policy = policyFor(cfg, routine, mode)
  const unit = S.unit || 'kg'
  const inc = cfg.inc > 0 ? cfg.inc : (mode === 'time' ? DEFAULT_SEC_INCREMENT : defaultIncrement(cfg.id, unit))
  if (policy === 'off') return { policy, kind: 'off' }

  const sessions = sessionsFor(S, cfg.id, cfg).filter(s => s.mode === mode)
  const last = sessions[sessions.length - 1]
  if (!last) return { policy, kind: 'first', why: ['Nothing logged yet — this session sets the baseline.'] }

  const stalls = stallCount(sessions)
  const deloadAt = DELOAD_AFTER[policy] || 3

  if (mode === 'time') {
    if (last.ok) {
      const sec = (last.goal || cfg.sec || 0) + inc
      return { policy, kind: 'up', sec, why: ['Held every set for the full time — target up by {0}s.', inc] }
    }
    if (stalls >= deloadAt) {
      const cur = last.goal || cfg.sec || 0
      return asHoldOrDeload(cur, 5,
        () => ({ policy, kind: 'hold', sec: clampTimeSec(cur), why: ['Already at the minimum hold — same target again.'] }),
        sec => ({ policy, kind: 'deload', sec, why: ['Short {0} Workouts in a row — back off to {1}s and build up again.', stalls, sec] }))
    }
    return { policy, kind: 'hold', sec: clampTimeSec(last.goal || cfg.sec), why: ['Last time came up short — same target again.'] }
  }

  const w = last.weight ?? cfg.weight ?? 0
  if (w <= 0) {
    const goal = last.goal || cfg.reps || 0
    if (!last.ok || goal <= 0) return { policy, kind: 'hold', weight: 0, reps: Math.max(1, goal), why: ['Bodyweight — same target again until every set is clean.'] }
    const top = cfg.repsMax > 0 ? cfg.repsMax : 0
    if (top > 0 && goal >= top) {
      const planSets = cfg.sets == null ? null : Math.max(1, cfg.sets)
      const sets = Math.max(1, planSets ?? last.count ?? 1) + 1
      const planReps = cfg.reps === 0 ? 1 : (cfg.reps || top)
      const bottom = Math.max(1, Math.min(planReps, top))
      if (sets <= MAX_BW_SETS) return { policy, kind: 'up', weight: 0, reps: bottom, sets, why: ['{0} reps in every set — add a set and go back to {1}.', goal, bottom] }
      return { policy, kind: 'hold', weight: 0, reps: goal, why: ['{0} sets of {1} — time to add weight or move to a harder variation.', sets - 1, goal] }
    }
    const next = goal + repStep(cfg)
    return { policy, kind: 'up', weight: 0, reps: next, why: ['Bodyweight — every rep last time, so go for {0} this time.', next] }
  }
  if (policy === 'double') {
    const top = cfg.reps || last.goal || 10
    const bottom = Math.min(cfg.repsMin || Math.max(1, top - 2), top)
    if (last.ok) return { policy, kind: 'up', weight: snap(w + inc, inc), reps: bottom, why: ['Top of the rep range in every set — {0} {1} more, back to {2} reps.', inc, unit, bottom] }
    if (stalls >= deloadAt) {
      return asHoldOrDeload(w, inc,
        () => ({ policy, kind: 'hold', weight: w, reps: bottom, why: ['Already at the minimum load — same weight again.'] }),
        dw => ({ policy, kind: 'deload', weight: dw, reps: bottom, why: ['Stalled {0} Workouts — deload to {1} {2}.', stalls, dw, unit] }))
    }
    const aim = Math.min(top, Math.max(bottom, last.low + repStep(cfg)))
    return { policy, kind: 'hold', weight: w, reps: aim, why: ['Same weight — aim for {0} reps this time.', aim] }
  }

  if (last.ok) {
    const dbl = policy === 'greyskull' && last.goal > 0 && last.amrap >= last.goal * 2
    const step = dbl ? inc * 2 : inc
    return {
      policy, kind: 'up', weight: snap(w + step, inc),
      why: dbl
        ? ['Last set hit {0} reps — twice the target, so take a double jump of {1} {2}.', last.amrap, step, unit]
        : ['Every rep last time — {0} {1} more.', step, unit]
    }
  }
  if (stalls >= deloadAt) {
    return asHoldOrDeload(w, inc,
      () => ({ policy, kind: 'hold', weight: w, why: ['Already at the minimum load — same weight again.'] }),
      dw => ({
        policy, kind: 'deload', weight: dw,
        why: stalls > 1
          ? ['Missed reps {0} Workouts running — reset to {1} {2} and work back up.', stalls, dw, unit]
          : ['Missed reps — reset to {0} {1} and work back up.', dw, unit]
      }))
  }
  return { policy, kind: 'hold', weight: w, why: ['Missed reps last time — same weight again ({0} of {1} to go).', deloadAt - stalls, deloadAt] }
}

export function applyPrescription(sets, p) {
  if (!p || p.kind === 'off' || p.kind === 'first') return sets
  const out = sets.map(s => {
    if (isPerformed(s) || !isWorkSet(s)) return s
    const o = { ...s }
    if (p.weight != null) o.w = p.weight
    if (p.reps != null) o.r = p.reps
    if (p.sec != null) o.sec = p.sec
    return o
  })
  const workRows = out.filter(isWorkSet)
  if (p.sets > workRows.length) {
    if (!workRows.length) return out
    const seed = workRows[workRows.length - 1]
    const seedMode = modeForSet(seed, {})
    while (out.filter(isWorkSet).length < p.sets) out.push(makeRow(seedMode, {}, { prev: seed }))
  }
  return out
}
