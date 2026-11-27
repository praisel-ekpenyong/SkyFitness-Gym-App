import { EXIDX } from './exercises.js'
import { isWarmupRow, modeOf, repStep, makeRow, isBw, defaultConfig } from './workout-model.js'
import { isWorkSet, isPerformed, workSets, doneWorkSets, modeForSet } from './workout-sets.js'
import { resolveSetWeight, normalizeWeight, targetIn, entryUnit, round1 } from './units.js'
import { fmtNum, fmtSigned } from './format.js'
import { t } from './i18n.js'
import { assertClock, isoOf } from './dates.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Workout} Workout */
/** @typedef {import('./types.js').ActiveWorkout} ActiveWorkout */
/** @typedef {import('./types.js').Entry} Entry */
/** @typedef {import('./types.js').SetRow} SetRow */
/** @typedef {import('./types.js').Target} Target */
/** @typedef {import('./types.js').Routine} Routine */
/** @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').LoggingMode} LoggingMode */
/** @typedef {import('./types.js').ProgressionPolicy} ProgressionPolicy */
/** @typedef {import('./types.js').PrescriptionKind} PrescriptionKind */
/** @typedef {import('./types.js').Prescription} Prescription */
/** @typedef {import('./types.js').PrescriptionRecord} PrescriptionRecord */

/**
 * @typedef {{
 *   mode: LoggingMode,
 *   goal: number,
 *   enough: boolean,
 *   weight: number | null,
 *   low: number,
 *   ok: boolean,
 *   held?: number[],
 *   best?: number,
 *   reps?: number[],
 *   firstPerformed?: boolean,
 *   count?: number,
 *   amrap?: number,
 *   d?: string,
 *   target?: Partial<Target> | null,
 *   plan?: PrescriptionRecord | Prescription | null,
 * }} SessionReading
 */

/**
 * @typedef {{
 *   id: string,
 *   d: string | null,
 *   exName: string,
 *   policy: ProgressionPolicy,
 *   policyName: string,
 *   kind: PrescriptionKind,
 *   weight: number | undefined,
 *   reps: number | undefined,
 *   sec: number | undefined,
 *   sets: number | undefined,
 *   why: Array<string | number> | undefined,
 *   label: string,
 *   text: string,
 *   iconName: string,
 *   ariaLabel: string,
 * }} ProgressionDescriptor
 */

/** @type {ProgressionPolicy[]} */
export const POLICIES = ['off', 'linear', 'greyskull', 'double', 'time']

/** @type {Record<LoggingMode, ProgressionPolicy[]>} */
export const POLICIES_FOR = {
  reps: ['off', 'linear', 'greyskull', 'double'],
  time: ['off', 'time'],
  cardio: ['off']
}
/** @type {Record<ProgressionPolicy, string>} */
export const POLICY_NAME = {
  off: 'No automatic progression',
  linear: 'Linear progression',
  greyskull: 'Greyskull LP',
  double: 'Double progression',
  time: 'Add time'
}
/** @type {Record<ProgressionPolicy, string>} */
export const POLICY_DESC = {
  off: 'Targets stay where you set them.',
  linear: 'Hit every rep in every set and the weight goes up. Repeated misses trigger a deload.',
  greyskull: 'Two straight sets plus a final set taken to failure. Beat the target on that set and the weight goes up — double if you double the reps. One failure resets 10 %.',
  double: 'Work up through a rep range at the same weight. Reach the top of the range in every set and the weight goes up, reps back to the bottom. Fall below the bottom on your first set and it drops.',
  time: 'Hold every set for the full duration and the target goes up.'
}

/** @type {Partial<Record<ProgressionPolicy, number>>} */
export const DELOAD_AFTER = { linear: 3, greyskull: 1, double: 4, time: 3 }
const DELOAD_FACTOR = 0.9

const HEAVY_BP = ['upper legs', 'lower legs', 'back', 'hips', 'glutes']

/**
 * @param {string} exId
 * @param {Unit | string} unit
 * @returns {number}
 */
export function defaultIncrement(exId, unit) {
  const ex = EXIDX[exId]
  const heavy = ex && HEAVY_BP.includes(ex.bp)
  if (unit === 'lb') return heavy ? 10 : 5
  return heavy ? 5 : 2.5
}
export const DEFAULT_SEC_INCREMENT = 5

export const MIN_TIME_SEC = 5
/** @param {number} v @returns {number} */
const clampTimeSec = v => (v > 0 ? v : MIN_TIME_SEC)

export const MAX_BW_SETS = 6
/**
 * @param {Partial<Target> | null | undefined} cfg
 * @param {Routine | null | undefined} [routine]
 * @param {LoggingMode | null} [mode]
 * @returns {ProgressionPolicy}
 */
export function policyFor(cfg, routine, mode) {
  const m = mode || modeOf(cfg || {})
  const allowed = POLICIES_FOR[m] || ['off']
  const pick = (cfg && cfg.prog) || (routine && routine.prog) || (m === 'reps' ? 'linear' : 'off')
  return allowed.includes(pick) ? pick : 'off'
}

/** @param {number} v @returns {number} */
const round2 = v => Math.round(v * 100) / 100
/** @param {number} v @param {number} step @returns {number} */
function snap(v, step) {
  if (!(step > 0)) return round1(v)
  return round1(Math.round(v / step) * step)
}
/** @param {number} cur @param {number} step @returns {number} */
function deloadTo(cur, step) {
  const next = snap(cur * DELOAD_FACTOR, step)
  return next < cur ? next : snap(cur - step, step)
}

/**
 * The Stall Deload and the Drop share this floor (ADR 0033): null when the load cannot go lower.
 * @param {number} cur
 * @param {number} next
 * @param {number} step
 * @returns {number | null}
 */
function lowerTo(cur, next, step) {
  const at = Math.max(step, next)
  return at < cur ? at : null
}

/**
 * @param {number} cur
 * @param {number} step
 * @returns {{ tag: 'hold' | 'deload', at: number }}
 */
export function reduceLoad(cur, step) {
  const at = lowerTo(cur, deloadTo(cur, step), step)
  return at == null ? { tag: 'hold', at: cur } : { tag: 'deload', at }
}

/**
 * @param {number} cur
 * @param {number} step
 * @param {number} noProgress
 * @param {number} deloadAt
 * @returns {{ tag: 'hold' | 'deload', at: number } | null}
 */
function deloadIfStalled(cur, step, noProgress, deloadAt) {
  if (noProgress < deloadAt) return null
  return reduceLoad(cur, step)
}

/** @param {unknown} v @returns {number | null} */
const positive = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

/**
 * @param {SessionReading} session
 * @param {Partial<Target>} cfg
 * @param {LoggingMode} mode
 * @returns {boolean}
 */
function inStream(session, cfg, mode) {
  if (session.mode !== mode) return false
  const target = session.target || {}
  const bodyweight = mode === 'reps' && isBw(cfg) && (cfg.weight === 0 || cfg.weight == null)
  if (!bodyweight) {
    const wantTop = positive(mode === 'time' ? cfg.sec : cfg.reps)
    const haveTop = positive(mode === 'time' ? target.sec : target.reps)
    if (wantTop != null && haveTop != null && haveTop !== wantTop) return false
  }
  const wantSets = positive(cfg.sets)
  const haveSets = positive(target.sets)
  if (wantSets != null && haveSets != null && haveSets !== wantSets) return false
  return true
}

/** @param {SessionReading} session @param {number | undefined} fallback @returns {number} */
const loadOf = (session, fallback) => {
  const w = session.weight ?? session.plan?.weight ?? session.target?.weight
  return typeof w === 'number' && Number.isFinite(w) ? w : (typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : 0)
}

/** @param {SessionReading[]} sessions @returns {number} */
function afterLastDeload(sessions) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].plan?.kind === 'deload') return i + 1
  }
  return 0
}

/**
 * @param {SessionReading[]} sessions
 * @param {(s: SessionReading) => number} valueOf
 * @returns {number}
 */
function runStart(sessions, valueOf) {
  if (!sessions.length) return 0
  const value = valueOf(sessions[sessions.length - 1])
  let start = sessions.length - 1
  while (start > 0 && valueOf(sessions[start - 1]) === value) start--
  return start
}

/**
 * @param {SessionReading[]} sessions
 * @param {SessionReading} last
 * @param {Partial<Target>} cfg
 * @returns {SessionReading[]}
 */
function linearRun(sessions, last, cfg) {
  if (!last.plan) return sessions.slice(afterLastDeload(sessions))
  const start = runStart(sessions, s => loadOf(s, cfg.weight))
  return sessions.slice(start > 0 ? start + 1 : start)
}

/**
 * @param {SessionReading[]} sessions
 * @param {number} start
 * @param {(s: SessionReading, prev: SessionReading) => boolean} progressed
 * @returns {number}
 */
function noProgressSince(sessions, start, progressed) {
  let n = 0
  for (let i = sessions.length - 1; i > start; i--) {
    const s = sessions[i]
    const prev = sessions[i - 1]
    if (progressed(s, prev)) break
    n++
  }
  return n
}

/** @param {{ top: number, bottom: number, step: number }} range @param {number} low @returns {number} */
const aimUp = (range, low) => Math.min(range.top, Math.max(range.bottom, (low || 0) + range.step))

/**
 * @param {SessionReading[]} sessions
 * @param {number} start
 * @param {{ top: number, bottom: number, step: number }} range
 * @returns {number}
 */
function doubleNoProgress(sessions, start, range) {
  return noProgressSince(sessions, start, (s, prev) => {
    const aim = aimUp(range, prev.low)
    return s.ok || (s.enough && s.low >= aim)
  })
}

/** @param {Partial<Entry> | SessionReading | null | undefined} entry @returns {number | null} */
function prescribedSeconds(entry) {
  const plan = entry?.plan
  if (plan && plan.kind !== 'first' && plan.kind !== 'off' && positive(plan.sec)) return positive(plan.sec)
  return positive(entry?.target?.sec) ?? null
}

/**
 * The Prescription's rep target for an Entry or a SessionReading: the plan's reps, then the goal
 * (a SessionReading's `goal`, else the Target's reps), then the config's reps.
 * The Milestone cue judges against it too, so the two never disagree (ADR 0018).
 * @param {Partial<Entry> | SessionReading | null | undefined} entry
 * @param {Partial<Target>} cfg
 * @returns {number}
 */
export function prescribedReps(entry, cfg) {
  const goal = entry && 'goal' in entry ? entry.goal : undefined
  return positive(entry?.plan?.reps) ?? positive(goal) ?? positive(entry?.target?.reps) ?? positive(cfg.reps) ?? 0
}

/** @param {SessionReading} session @param {Partial<Target>} cfg @returns {number} */
function sessionSeconds(session, cfg) {
  return prescribedSeconds(session) ?? positive(cfg.sec) ?? MIN_TIME_SEC
}

/** @param {SessionReading} session @returns {number} */
function weakestPerformed(session) {
  const held = (session.held || []).filter(v => v > 0)
  return held.length ? Math.min(...held) : 0
}

/** @param {SessionReading} session @param {Partial<Target>} cfg @param {number} inc @returns {number} */
function timeAim(session, cfg, inc) {
  const working = sessionSeconds(session, cfg)
  const weak = weakestPerformed(session)
  return clampTimeSec(weak > 0 ? Math.min(working, weak + inc) : working)
}

/** @param {SessionReading} session @param {Partial<Target>} cfg @returns {boolean} */
function timeHit(session, cfg) {
  const working = sessionSeconds(session, cfg)
  const held = session.held || []
  return session.goal > 0 && !!session.enough && held.length > 0 && held.every(h => h >= working)
}

/** @param {SessionReading[]} sessions @param {number} start @param {Partial<Target>} cfg @param {number} inc @returns {number} */
function timeNoProgress(sessions, start, cfg, inc) {
  return noProgressSince(sessions, start, (s, prev) => {
    const aim = timeAim(prev, cfg, inc)
    return s.enough && s.low > 0 && s.low >= aim
  })
}

/** @param {Entry | null | undefined} entry @param {Partial<Target>} target @param {number} fallbackCount @returns {number} */
function plannedSetCount(entry, target, fallbackCount) {
  return positive(entry?.plan?.sets) ?? positive(target.sets) ?? fallbackCount
}

/**
 * Read a logged Entry into a normalized progression reading.
 * @param {Entry | null | undefined} entry
 * @param {Partial<Target> | null | undefined} fallback
 * @param {Workout | ActiveWorkout | Unit | null} workout
 * @param {Unit} targetUnit
 * @returns {SessionReading}
 */
export function readSession(entry, fallback, workout, targetUnit) {
  const target = (entry && entry.target) || fallback || {}
  const mode = modeOf({ ...target, id: entry?.id })
  /** @type {Workout | ActiveWorkout | null} */
  const workoutContext = typeof workout === 'string' ? { id: '', d: '', start: 0, end: 0, routineId: null, name: '', bw: null, entries: [], unit: workout } : workout
  const sets = workSets(entry)
  const planned = plannedSetCount(entry, target, sets.length)
  const judged = sets.slice(0, planned)
  const enough = sets.length >= planned

  const performed = judged.filter(isPerformed)
  const performedWeight = performed.length
    ? Math.max(0, ...performed.map(s => resolveSetWeight(s, entry, workoutContext, targetUnit)))
    : null

  if (mode === 'time') {
    const goal = target.sec || 0
    const held = judged.map(s => (isPerformed(s) ? (s.sec || 0) : 0))
    return {
      mode, goal, held, enough,
      weight: performedWeight || 0,
      best: Math.max(0, ...held),
      low: held.length ? Math.min(...held) : 0,
      ok: goal > 0 && enough && held.length > 0 && held.every(h => h >= goal)
    }
  }
  const goal = target.reps || 0
  const reps = judged.map(s => (isPerformed(s) ? (s.r || 0) : 0))
  return {
    mode, goal, reps, enough,
    firstPerformed: isPerformed(judged[0]),
    weight: performedWeight,
    count: judged.length,
    low: reps.length ? Math.min(...reps) : 0,
    amrap: reps.length ? reps[reps.length - 1] : 0,
    ok: goal > 0 && enough && reps.length > 0 && reps.every(r => r >= goal)
  }
}

/**
 * A frozen Prescription in the Profile unit (ADR 0031); the stored one is never rewritten.
 * @param {PrescriptionRecord | Prescription | null | undefined} plan
 * @param {Unit} from
 * @param {Unit} to
 * @returns {PrescriptionRecord | Prescription | null | undefined}
 */
function planIn(plan, from, to) {
  if (!plan || typeof plan.weight !== 'number' || !Number.isFinite(plan.weight) || plan.weight === 0) return plan
  const weight = normalizeWeight(plan.weight, from, to)
  return weight === plan.weight ? plan : { ...plan, weight }
}

/**
 * Read every logged session of `exId` from the Profile's Training log in the Profile's unit.
 * @param {Partial<Profile> | null | undefined} S
 * @param {string} exId
 * @param {Partial<Target> | null | undefined} fallback
 * @returns {SessionReading[]}
 */
export function sessionsFor(S, exId, fallback) {
  /** @type {SessionReading[]} */
  const out = []
  const targetUnit = S?.unit || 'kg'
  ;(S?.workouts || []).forEach(w => {
    const entry = (w.entries || []).find(e => e.id === exId)
    if (entry && workSets(entry).length) {
      const from = entryUnit(entry, w, targetUnit)
      out.push({
        d: w.d,
        ...readSession(entry, fallback, w, targetUnit),
        target: targetIn(entry.target || null, from, targetUnit),
        plan: planIn(entry.plan || null, from, targetUnit),
      })
    }
  })
  return out
}

/** @param {SessionReading[]} sessions @returns {number} */
export function stallCount(sessions) {
  let n = 0
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].ok) break
    n++
  }
  return n
}

/** @param {SessionReading} last @param {Partial<Target>} cfg @returns {number} */
function workingLoad(last, cfg) {
  return last.weight ?? last.plan?.weight ?? cfg.weight ?? 0
}

/**
 * @param {{ policy: ProgressionPolicy, cfg: Partial<Target>, inc: number, sessions: SessionReading[], last: SessionReading, deloadAt: number }} args
 * @returns {Prescription}
 */
function timePrescription({ policy, cfg, inc, sessions, last, deloadAt }) {
  if (timeHit(last, cfg)) {
    const sec = round1(Math.max(sessionSeconds(last, cfg), weakestPerformed(last)) + inc)
    return { policy, kind: 'up', sec, why: ['Held every set for the full time — target up by {0}s.', inc] }
  }
  const start = runStart(sessions, s => sessionSeconds(s, cfg))
  const noProgress = timeNoProgress(sessions, start, cfg, inc)
  const weak = weakestPerformed(last)
  const base = weak > 0 ? weak : sessionSeconds(last, cfg)
  const stalled = deloadIfStalled(base, 5, noProgress, deloadAt)
  if (stalled?.tag === 'hold') {
    return { policy, kind: 'hold', sec: Math.max(MIN_TIME_SEC, clampTimeSec(base)), why: ['Already at the shortest hold — same target again.'] }
  }
  if (stalled?.tag === 'deload') {
    return { policy, kind: 'deload', sec: stalled.at, why: ['No progress in {0} Workouts — back off to {1}s and build up again.', noProgress, stalled.at] }
  }
  const aim = timeAim(last, cfg, inc)
  return { policy, kind: 'hold', sec: aim, why: ['Last time came up short — aim for {0}s and build from there.', aim] }
}

/**
 * @param {{ policy: ProgressionPolicy, cfg: Partial<Target>, last: SessionReading }} args
 * @returns {Prescription}
 */
function loadlessPrescription({ policy, cfg, last }) {
  const prescribed = prescribedReps(last, cfg)
  const planSets = positive(last.plan?.sets)
  const baseSets = cfg.sets == null ? null : Math.max(1, cfg.sets)
  const workingSets = Math.max(1, planSets ?? baseSets ?? last.count ?? 1)
  const carrySets = planSets != null ? { sets: workingSets } : {}
  const hit = prescribed > 0 && last.enough && last.low >= prescribed
  if (!hit) return { policy, kind: 'hold', weight: 0, reps: Math.max(1, prescribed), ...carrySets, why: ['Bodyweight — same target again until every set is clean.'] }
  const goal = Math.max(prescribed, last.low || 0)
  const top = positive(cfg.repsMax) ?? 0
  if (top > 0 && goal >= top) {
    const sets = workingSets + 1
    const planReps = cfg.reps === 0 ? 1 : (cfg.reps || top)
    const bottom = Math.max(1, Math.min(planReps, top))
    if (sets <= MAX_BW_SETS) return { policy, kind: 'up', weight: 0, reps: bottom, sets, why: ['{0} reps in every set — add a set and go back to {1}.', goal, bottom] }
    return { policy, kind: 'hold', weight: 0, reps: goal, ...carrySets, why: ['{0} sets of {1} — time to add weight or move to a harder variation.', workingSets, goal] }
  }
  const next = goal + repStep(cfg)
  return { policy, kind: 'up', weight: 0, reps: next, ...carrySets, why: ['Bodyweight — every rep last time, so go for {0} this time.', next] }
}

/** @param {SessionReading} session @param {number} bottom @returns {boolean} */
const belowRange = (session, bottom) => !!session.firstPerformed && (session.reps?.[0] || 0) < bottom

/**
 * A Drop from a heavier Run back to this weight, where the Run before it ended in a Hit (ADR 0033).
 * @param {SessionReading[]} sessions
 * @param {number} start
 * @param {(s: SessionReading) => number} load
 * @param {number} bottom
 * @returns {boolean}
 */
function bouncedBack(sessions, start, load, bottom) {
  if (start < 2) return false
  const w = load(sessions[start])
  if (!belowRange(sessions[start - 1], bottom)) return false
  const above = runStart(sessions.slice(0, start), load)
  if (above < 1 || !(load(sessions[above]) > w)) return false
  const before = sessions[above - 1]
  return load(before) === w && !!before.ok
}

/**
 * @param {{ policy: ProgressionPolicy, cfg: Partial<Target>, inc: number, unit: Unit, sessions: SessionReading[], last: SessionReading, deloadAt: number, w: number }} args
 * @returns {Prescription}
 */
function doublePrescription({ policy, cfg, inc, unit, sessions, last, deloadAt, w }) {
  const top = Math.max(1, positive(cfg.reps) ?? (last.goal || 10))
  const cfgMin = positive(cfg.repsMin)
  const bottom = cfgMin != null ? Math.min(cfgMin, top) : Math.max(1, top - 2)
  const step = repStep(cfg)
  const range = { top, bottom, step }
  /** @param {SessionReading} s */
  const load = s => loadOf(s, cfg.weight)
  const start = runStart(sessions, load)
  if (last.ok) {
    if (bouncedBack(sessions, start, load, bottom) && sessions.slice(start).filter(s => s.ok).length < 2) {
      return { policy, kind: 'hold', weight: w, reps: top, why: ['Top again: one more time at this weight before adding {0} {1}, since the last jump was too big.', inc, unit] }
    }
    const nextW = round1(w + inc)
    return { policy, kind: 'up', weight: nextW, reps: bottom, why: ['Top of the rep range in every set — {0} {1} more, back to {2} reps.', inc, unit, bottom] }
  }

  const drop = belowRange(last, bottom)
  const noProgress = doubleNoProgress(sessions, start, range)
  if (!drop && noProgress < deloadAt) {
    const aim = aimUp(range, last.low)
    return { policy, kind: 'hold', weight: w, reps: aim, why: ['Same weight — aim for {0} reps this time.', aim] }
  }

  const next = drop ? round1(w - inc) : deloadTo(w, inc)
  const at = lowerTo(w, next, inc)
  const first = last.reps?.[0] || 0
  if (at == null) {
    const why = drop
      ? [first === 1
          ? 'First set {0} rep, below the {1}–{2} range. Already at the lightest load — same weight again.'
          : 'First set {0} reps, below the {1}–{2} range. Already at the lightest load — same weight again.',
        first, bottom, top]
      : ['No progress in {0} Workouts. Already at the lightest load — build reps.', noProgress]
    return { policy, kind: 'hold', weight: w, reps: bottom, why }
  }
  if (!drop) {
    return { policy, kind: 'deload', weight: at, reps: bottom, why: ['No progress in {0} Workouts — deload to {1} {2}, back to {3} reps.', noProgress, at, unit, bottom] }
  }
  const by = at > next ? round2(w - at) : inc
  return { policy, kind: 'down', weight: at, reps: bottom, by, why: ['First set {0} reps, below the {1}–{2} range. {3} {4} less, back to {1} reps.', first, bottom, top, by, unit] }
}

/**
 * @param {{ policy: ProgressionPolicy, inc: number, unit: Unit, cfg: Partial<Target>, sessions: SessionReading[], last: SessionReading, deloadAt: number, w: number }} args
 * @returns {Prescription}
 */
function linearPrescription({ policy, inc, unit, cfg, sessions, last, deloadAt, w }) {
  const stalls = stallCount(linearRun(sessions, last, cfg))
  if (last.ok) {
    return { policy, kind: 'up', weight: round1(w + inc), why: ['Every rep last time — {0} {1} more.', inc, unit] }
  }
  if (stalls >= deloadAt) {
    const stalled = deloadIfStalled(w, inc, stalls, deloadAt)
    if (!stalled || stalled.tag === 'hold') {
      return { policy, kind: 'hold', weight: w, why: ['Already at the minimum load — same weight again.'] }
    }
    return { policy, kind: 'deload', weight: stalled.at, why: stalls > 1
      ? ['Missed reps {0} Workouts running — reset to {1} {2} and work back up.', stalls, stalled.at, unit]
      : ['Missed reps — reset to {0} {1} and work back up.', stalled.at, unit] }
  }
  return { policy, kind: 'hold', weight: w, why: ['Missed reps last time — same weight again ({0} of {1} to go).', deloadAt - stalls, deloadAt] }
}

/**
 * @param {{ policy: ProgressionPolicy, inc: number, unit: Unit, cfg: Partial<Target>, sessions: SessionReading[], last: SessionReading, deloadAt: number, w: number }} args
 * @returns {Prescription}
 */
function greyskullPrescription({ policy, inc, unit, cfg, sessions, last, deloadAt, w }) {
  const stalls = stallCount(sessions)
  if (last.ok) {
    const dbl = last.goal > 0 && (last.amrap ?? 0) >= last.goal * 2
    const step = dbl ? inc * 2 : inc
    return {
      policy, kind: 'up', weight: round1(w + step),
      why: dbl
        ? ['Last set hit {0} reps — twice the target, so take a double jump of {1} {2}.', last.amrap ?? 0, step, unit]
        : ['Every rep last time — {0} {1} more.', step, unit]
    }
  }
  if (stalls >= deloadAt) {
    const stalled = deloadIfStalled(w, inc, stalls, deloadAt)
    if (!stalled || stalled.tag === 'hold') {
      return { policy, kind: 'hold', weight: w, why: ['Already at the minimum load — same weight again.'] }
    }
    return { policy, kind: 'deload', weight: stalled.at, why: stalls > 1
      ? ['Missed reps {0} Workouts running — reset to {1} {2} and work back up.', stalls, stalled.at, unit]
      : ['Missed reps — reset to {0} {1} and work back up.', stalled.at, unit] }
  }
  return { policy, kind: 'hold', weight: w, why: ['Missed reps last time — same weight again ({0} of {1} to go).', deloadAt - stalls, deloadAt] }
}

/**
 * Derive the next Prescription for `cfg` in `routine` from the Profile's log.
 * @param {Partial<Profile>} S
 * @param {Target} cfg
 * @param {Routine | null | undefined} [routine]
 * @returns {Prescription}
 */
export function nextPrescription(S, cfg, routine) {
  const mode = modeOf(cfg)
  const policy = policyFor(cfg, routine, mode)
  const unit = S.unit || 'kg'
  const inc = positive(cfg.inc) ?? (mode === 'time' ? DEFAULT_SEC_INCREMENT : defaultIncrement(cfg.id ?? '', unit))
  if (policy === 'off') return { policy, kind: 'off' }

  const logged = cfg.id ? sessionsFor(S, cfg.id, cfg) : []
  const sessions = logged.filter(s => inStream(s, cfg, mode))
  const last = sessions[sessions.length - 1]
  if (!last) {
    const why = logged.length ? 'New target. This session sets the baseline.' : 'Nothing logged yet — this session sets the baseline.'
    return { policy, kind: 'first', why: [why] }
  }

  const deloadAt = DELOAD_AFTER[policy] || 3
  if (mode === 'time') return timePrescription({ policy, inc, cfg, sessions, last, deloadAt })

  const w = workingLoad(last, cfg)
  if (w <= 0) return loadlessPrescription({ policy, cfg, last })
  if (policy === 'double') return doublePrescription({ policy, inc, unit, cfg, sessions, last, deloadAt, w })
  if (policy === 'greyskull') return greyskullPrescription({ policy, inc, unit, cfg, sessions, last, deloadAt, w })
  return linearPrescription({ policy, inc, unit, cfg, sessions, last, deloadAt, w })
}

/**
 * Apply a Prescription onto unperformed work rows of `sets`.
 * @param {SetRow[]} sets
 * @param {Prescription | PrescriptionRecord | null | undefined} p
 * @returns {SetRow[]}
 */
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
  if (p.sets != null && p.sets > workRows.length) {
    if (!workRows.length) return out
    const seed = workRows[workRows.length - 1]
    const seedMode = modeForSet(seed, {})
    while (out.filter(isWorkSet).length < p.sets) out.push(makeRow(seedMode, {}, { prev: seed }))
  }
  return out
}

/**
 * The one Progression judgement for an Entry, read against the canonical as-if-finished Workout.
 *
 * `workout` is the Workout returned by the Prospective Prescription reading — either the real one
 * already in the Training log or the Module's stand-in. There is no fallback: a caller cannot
 * re-derive a second, divergent judgement from a bare Entry (ADR 0037).
 *
 * @param {Entry} entry
 * @param {Partial<Profile> | null | undefined} state
 * @param {Workout} workout
 */
export function readEntryVerdict(entry, state, workout) {
  /** @type {Partial<Profile>} */
  const S = state && typeof state === 'object' ? state : {}
  const unit = workout.unit || S.unit || 'kg'
  const routineId = workout.routineId ?? S.active?.routineId ?? null
  const inLog = (S.workouts || []).some(w => w.id === workout.id)
  // ADR 0037: the reading keeps the Workout's unit, including after it is logged.
  const effectiveS = inLog ? { ...S, unit } : { ...S, unit, workouts: [...(S.workouts || []), workout] }
  const routine = routineId ? (S.routines || []).find(r => r.id === routineId) || null : null
  const target = entry?.target || {}
  const cfg = { ...defaultConfig(entry.id), ...target, id: entry.id }
  const prescription = nextPrescription(effectiveS, cfg, routine)
  const mode = modeOf(cfg)
  const sessions = sessionsFor(effectiveS, entry.id, cfg).filter(s => inStream(s, cfg, mode))
  const last = sessions[sessions.length - 1]
  const prev = sessions.length >= 2 ? sessions[sessions.length - 2] : null
  let aimDelta = 0
  let step = 0
  if (prescription.kind === 'up' && mode === 'time' && last && prescription.sec != null) {
    const base = Math.max(sessionSeconds(last, cfg), weakestPerformed(last))
    step = Math.round((prescription.sec - base) * 10) / 10
  }
  if (prescription.kind === 'up' && mode !== 'time' && positive(prescription.weight)) {
    const working = readSession(entry, cfg, workout, unit).weight || 0
    step = Math.round(((prescription.weight ?? 0) - working) * 10) / 10
  }
  const sameLoad = prev && last && loadOf(prev, cfg.weight) === loadOf(last, cfg.weight)
  if (prescription.kind === 'hold' && sameLoad && mode === 'reps' && prescription.reps != null) {
    const top = Math.max(1, positive(cfg.reps) ?? 10)
    const cfgMin = positive(cfg.repsMin)
    const bottom = cfgMin != null ? Math.min(cfgMin, top) : Math.max(1, top - 2)
    const stepRep = repStep(cfg)
    const prevAim = Math.min(top, Math.max(bottom, (prev.low || 0) + stepRep))
    if (prescription.reps > prevAim) aimDelta = prescription.reps - prevAim
  }
  if (prescription.kind === 'hold' && prev && mode === 'time' && prescription.sec != null) {
    const inc = positive(cfg.inc) ?? DEFAULT_SEC_INCREMENT
    const prevAim = timeAim(prev, cfg, inc)
    if (prescription.sec > prevAim) aimDelta = prescription.sec - prevAim
  }
  return { prescription, unit, cfg, aimDelta, step, judged: readSession(entry, cfg, workout, unit) }
}

/**
 * @param {ReturnType<typeof readEntryVerdict>} verdict
 * @param {{ reps: number, targetReps: number }} extra
 */
function unlockedCue(verdict, extra) {
  const p = verdict.prescription
  if (p.kind !== 'up') return null
  if ((p.weight ?? 0) > 0) {
    return {
      kind: 'unlocked',
      label: t('All sets hit! {0} {1} unlocked next session', fmtSigned(verdict.step), verdict.unit),
      inc: verdict.step,
      unit: verdict.unit,
      ...extra
    }
  }
  return {
    kind: 'unlocked',
    label: t('All sets hit! Next target unlocked'),
    ...extra
  }
}

/** @param {unknown} v @returns {ProgressionPolicy | undefined} */
const asPolicy = v => (v === 'off' || v === 'linear' || v === 'greyskull' || v === 'double' || v === 'time' ? v : undefined)

/**
 * @param {Entry} entry
 * @param {LoggingMode} mode
 * @param {Routine | null} routine
 * @returns {ProgressionPolicy}
 */
function resolvePolicy(entry, mode, routine) {
  const target = entry?.target || {}
  const planPolicy = entry?.plan && 'policy' in entry.plan ? asPolicy(entry.plan.policy) : undefined
  const targetPolicy = 'policy' in target ? asPolicy(target.policy) : undefined
  const entryProg = 'prog' in entry ? asPolicy(entry.prog) : undefined
  const entryPolicy = 'policy' in entry ? asPolicy(entry.policy) : undefined
  const cfg = {
    ...target,
    prog: planPolicy || target.prog || entryProg || targetPolicy || entryPolicy
  }
  return policyFor(cfg, routine, mode)
}

/** @param {SetRow} setRow @param {string} key @returns {unknown} */
function legacySetField(setRow, key) {
  return key in setRow ? /** @type {Record<string, unknown>} */ (setRow)[key] : undefined
}

/**
 * Evaluate whether a completed work set achieved a progression milestone.
 *
 * @param {Entry} entry - Active workout entry containing `{ target, sets, plan?, id? }`.
 * @param {number} setIdx - Zero-based index of the set in `entry.sets`.
 * @param {{ state?: Profile | null, reading?: { verdict?: ReturnType<typeof readEntryVerdict>, routineId?: string | null } | null }} [context] - Profile `{ state }` plus this Entry's reading from the Prospective Prescription seam. The policy and the judgement come from that reading, never from a second Active stub.
 * @returns {{ kind: string, label: string, reps?: number, targetReps?: number, sec?: number, targetSec?: number, step?: number, bonusReps?: number, inc?: number, unit?: Unit } | null} Milestone descriptor `{ kind, label, ... }` or null if no milestone.
 */
export function evaluateSetMilestone(entry, setIdx, context = {}) {
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.sets)) return null
  if (setIdx == null || setIdx < 0 || setIdx >= entry.sets.length) return null

  const setRow = entry.sets[setIdx]
  if (!setRow || typeof setRow !== 'object') return null

  if (!isPerformed(setRow) || isWarmupRow(setRow)) return null

  const target = entry.target || {}
  const mode = modeOf({ ...target, id: entry.id })
  const S = context?.state && typeof context.state === 'object' ? context.state : null
  const routineId = context?.reading?.routineId ?? S?.active?.routineId ?? null
  const routine = routineId ? (S?.routines || []).find(r => r.id === routineId) || null : null
  const policy = resolvePolicy(entry, mode, routine)

  if (policy === 'off') return null

  const verdictOf = () => {
    const verdict = context?.reading?.verdict
    if (!verdict) throw new TypeError('evaluateSetMilestone requires a Prospective Prescription reading')
    return verdict
  }

  const workRows = entry.sets.filter(isWorkSet)
  const plannedCount = plannedSetCount(entry, target, workRows.length)
  const workIdx = workRows.indexOf(setRow)
  const targetReps = prescribedReps(entry, target)
  const legacySetReps = legacySetField(setRow, 'reps')
  const legacySetSec = legacySetField(setRow, 'seconds')

  if (policy === 'linear') {
    if (targetReps <= 0) return null

    const reps = Number(setRow.r ?? legacySetReps) || 0
    if (reps < targetReps) return null

    if (workIdx === plannedCount - 1) {
      const unlocked = unlockedCue(verdictOf(), { reps, targetReps })
      if (unlocked) return unlocked
    }

    return {
      kind: 'hit',
      label: t('{0}/{1} reps', reps, targetReps),
      reps,
      targetReps
    }
  }

  if (policy === 'time') {
    const targetSec = prescribedSeconds(entry) || 0
    if (targetSec <= 0) return null

    const sec = Number(setRow.sec ?? legacySetSec) || 0

    if (workIdx === plannedCount - 1) {
      const { prescription: p, aimDelta, step } = verdictOf()
      if (p.kind === 'up' && p.sec != null) {
        return {
          kind: 'unlocked',
          label: t('All sets hit! {0}s unlocked next session', fmtSigned(step)),
          sec,
          targetSec
        }
      }
      if (aimDelta > 0) {
        return {
          kind: 'progress',
          label: t('Hold progress ({0}s)', fmtSigned(aimDelta)),
          step: aimDelta,
          sec,
          targetSec
        }
      }
    }

    if (sec < targetSec) return null

    return {
      kind: 'hit',
      label: t('{0}s hold', sec),
      sec,
      targetSec
    }
  }

  if (policy === 'double') {
    if (targetReps <= 0) return null

    const reps = Number(setRow.r ?? legacySetReps) || 0

    if (workIdx >= 0 && workIdx < plannedCount - 1 && reps >= targetReps) {
      return {
        kind: 'hit',
        label: t('{0}/{1} reps · On track', reps, targetReps),
        reps,
        targetReps
      }
    }

    if (workIdx === plannedCount - 1) {
      const verdict = verdictOf()
      const unlocked = unlockedCue(verdict, { reps, targetReps })
      if (unlocked) return unlocked
      if (verdict.aimDelta > 0) {
        return {
          kind: 'progress',
          label: t('Rep progress ({0})', fmtSigned(verdict.aimDelta)),
          step: verdict.aimDelta,
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
    if (targetReps <= 0) return null

    const reps = Number(setRow.r ?? legacySetReps) || 0

    const isAMRAP = workIdx === plannedCount - 1

    if (isAMRAP) {
      const verdict = verdictOf()
      const p = verdict.prescription
      if (p.kind === 'up' && Number(p.weight) > 0 && reps >= targetReps) {
        const bonus = reps - targetReps
        if (bonus > 0) {
          return {
            kind: 'bonus',
            label: t('AMRAP {0} · {1} {2} unlocked next session', fmtSigned(bonus), fmtSigned(verdict.step), verdict.unit),
            reps,
            targetReps,
            bonusReps: bonus,
            inc: verdict.step,
            unit: verdict.unit
          }
        }
        return unlockedCue(verdict, { reps, targetReps })
      }
      if (p.kind === 'up' && reps >= targetReps) return unlockedCue(verdict, { reps, targetReps })
      if (reps >= targetReps && readSession(entry, verdict.cfg, null, verdict.unit).ok) {
        return {
          kind: 'hit',
          label: t('{0}/{1} reps', reps, targetReps),
          reps,
          targetReps
        }
      }
      return null
    }

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
 * Maps a Prescription kind (up, down, deload, hold, first, off) to an icon name.
 *
 * @param {PrescriptionKind | Prescription | PrescriptionRecord | string} kindOrPlan Prescription kind string or prescription object.
 * @param {{ policy?: ProgressionPolicy, reps?: number, workoutView?: boolean }} [options] Optional { policy, reps, workoutView }.
 * @returns {string} Icon identifier.
 */
export function prescriptionIcon(kindOrPlan, options = {}) {
  const plan = typeof kindOrPlan === 'object' && kindOrPlan ? /** @type {Partial<Prescription>} */ (kindOrPlan) : null
  const kind = plan ? plan.kind : kindOrPlan
  if (kind === 'up') return 'arrowUp'
  if (kind === 'deload') return 'info'
  if (kind === 'down') return 'arrowDown'
  if (options.workoutView) return 'lightbulb'
  const policy = options.policy ?? plan?.policy
  const reps = options.reps ?? plan?.reps
  if (kind === 'first' || (kind === 'hold' && policy === 'double' && reps != null)) return 'target'
  return 'check'
}

/**
 * Maps a Prescription kind or object to its CSS presentation class ('up' or empty string).
 *
 * @param {PrescriptionKind | Prescription | PrescriptionRecord | string | null | undefined} kindOrPlan Prescription kind string or prescription object.
 * @returns {string} Presentation class ('up' or '').
 */
export function prescriptionStyle(kindOrPlan) {
  const kind = typeof kindOrPlan === 'object' && kindOrPlan !== null ? kindOrPlan.kind : kindOrPlan
  return kind === 'up' ? 'up' : ''
}

/** @param {Entry} entry @param {number} now @returns {string} */
const entryDayKey = (entry, now) => ('d' in entry && typeof entry.d === 'string' && entry.d) || isoOf(new Date(now))

/** @typedef {import('./types.js').ProspectiveReadingLike & { judged: ReturnType<typeof readSession> }} ProspectiveReadingLike */

/**
 * Evaluates a single completed entry against its next prescription, returning a progression descriptor.
 * When the caller supplies a Prospective Prescription `reading`, no second as-if-finished Workout,
 * clock or Prescription judgement is constructed (ADR 0037).
 *
 * @param {Entry} entry Completed workout entry.
 * @param {Partial<Profile> | null | undefined} state Store state S.
 * @param {{ workout?: Workout | null, routine?: Routine | null, now: number, reading?: ProspectiveReadingLike | null }} context - Workout, routine, reading and the caller's clock.
 * @returns {ProgressionDescriptor | null} Progression descriptor or null if no performed work sets.
 */
export function evaluateSessionProgression(entry, state, context) {
  if (!entry || doneWorkSets(entry).length <= 0) return null

  const reading = context?.reading
  if (!reading) assertClock(context?.now)
  const now = context.now
  const workout = context?.workout
  const routineId = reading?.routineId ?? workout?.routineId
  const routine = context?.routine ||
    (routineId ? state?.routines?.find(r => r.id === routineId) : null) ||
    null

  /** @type {Workout | null} */
  let dummyWorkout = null
  let effectiveS = state
  if (!reading) {
    if (workout) {
      effectiveS = stateWithoutDuplicate(workout, state)
    } else {
      const inWorkouts = (state?.workouts || []).some(w => (w.entries || []).includes(entry))
      if (!inWorkouts) {
        dummyWorkout = {
          id: 'session-entry-' + entry.id,
          d: entryDayKey(entry, now),
          start: 0,
          end: 0,
          routineId: null,
          name: '',
          bw: null,
          entries: [entry],
          unit: state?.unit || 'kg'
        }
        effectiveS = { ...(state || {}), workouts: [...(state?.workouts || []), dummyWorkout] }
      }
    }
  }

  const cfg = reading?.cfg || { ...defaultConfig(entry.id), ...(entry.target || {}), id: entry.id }
  const p = reading?.prescription || nextPrescription(effectiveS || {}, cfg, routine)
  const unit = reading?.unit || state?.unit || workout?.unit || 'kg'
  const judged = reading?.judged || readSession(entry, cfg, null, unit)
  const ex = EXIDX[entry.id] || { n: entry.id }
  const exName = ex.n || entry.id
  const policy = p.policy || policyFor(cfg, routine)
  const policyName = POLICY_NAME[policy] || policy

  const oldWeight = judged.weight ?? entry.target?.weight ?? 0
  const isLoadless = (p.weight === 0) || (oldWeight <= 0 && isBw(cfg)) || (p.weight == null && isBw(cfg))

  let text = ''

  if (p.kind === 'up') {
    if (!isLoadless && p.weight != null && p.weight > 0) {
      const delta = Math.round((p.weight - oldWeight) * 10) / 10
      const deltaStr = delta > 0 ? ` (${fmtSigned(delta)} ${unit})` : ''
      text = `${fmtNum(oldWeight)} ${unit} → ${fmtNum(p.weight)} ${unit}${deltaStr}`
    } else if (p.sec != null) {
      const oldSec = entry.target?.sec || 0
      const deltaSec = p.sec - oldSec
      const deltaStr = deltaSec > 0 ? ` (${fmtSigned(deltaSec)}s)` : ''
      text = `${oldSec}s → ${p.sec}s${deltaStr}`
    } else if (p.sets != null) {
      text = t('{0} sets ({1} set)', p.sets, fmtSigned(1))
    } else if (p.reps != null) {
      text = t('Aim for {0} reps', p.reps)
    } else {
      text = t('Progress earned')
    }
  } else if (p.kind === 'deload') {
    if (p.sec != null) {
      text = t('Deload to {0}s', p.sec)
    } else if (policy === 'double' && p.reps != null) {
      text = t('Deload to {0} {1}, back to {2} reps', fmtNum(Number(p.weight) || 0), unit, p.reps)
    } else if (p.weight != null) {
      text = t('Deload to {0} {1}', fmtNum(p.weight), unit)
    } else {
      text = t('Deload to reset and rebuild')
    }
  } else if (p.kind === 'down') {
    text = t('Drop {0} {1}, back to {2} reps', Number(p.by) || 0, unit, Number(p.reps) || 0)
  } else if (p.kind === 'hold') {
    if (policy === 'double' && p.reps != null) {
      const wVal = p.weight ?? oldWeight
      if (wVal > 0 && !isLoadless) {
        text = t('Aim for {0} reps at {1} {2}', p.reps, fmtNum(wVal), unit)
      } else {
        text = t('Aim for {0} reps', p.reps)
      }
    } else if (p.sec != null) {
      text = t('Hold at {0}s to solidify volume', p.sec)
    } else if (isLoadless && p.reps != null) {
      text = t('Hold at {0} reps to solidify volume', p.reps)
    } else if (oldWeight <= 0 && p.reps != null) {
      text = t('Hold at {0} reps to solidify volume', p.reps)
    } else {
      const wVal = p.weight ?? oldWeight
      text = t('Hold at {0} {1} to solidify volume', fmtNum(wVal), unit)
    }
  } else if (p.kind === 'first') {
    text = t('First session baseline')
  } else {
    text = t('Targets stay where you set them')
  }

  const iconName = prescriptionIcon(p.kind, { policy, reps: p.reps })
  const label = text
  const ariaLabel = `${exName}: ${policyName}, ${text}`

  return {
    id: entry.id,
    d: reading?.d ?? workout?.d ?? dummyWorkout?.d ?? null,
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
    ariaLabel,
  }
}

/**
 * The legacy path without a reading: avoid appending the completed Workout twice.
 * @param {Workout} workout
 * @param {Partial<Profile> | null | undefined} state
 */
function stateWithoutDuplicate(workout, state) {
  const workouts = state?.workouts || []
  return workouts.some(item => item.id === workout.id || item === workout)
    ? state
    : { ...(state || {}), workouts: [...workouts, workout] }
}

/**
 * Derives progression descriptors for all trained exercises in a completed workout.
 * Pass the Prospective Prescription reading to drive every item from the one reading; the
 * workout is then recognised by id in the Training log instead of gaining a second stand-in.
 *
 * @param {Workout | null | undefined} workout Completed workout.
 * @param {Partial<Profile> | null | undefined} state Store state S.
 * @param {number} now - Caller's clock in milliseconds.
 * @param {{ entries: Record<string, ProspectiveReadingLike> } | null | undefined} [prospective] - The shared reading's per-entry records, when the caller has it.
 * @returns {ProgressionDescriptor[]} List of progression descriptors for trained exercises.
 */
export function sessionProgressionItems(workout, state, now, prospective) {
  if (!workout?.entries) return []
  const routine = (workout.routineId && state?.routines?.find(r => r.id === workout.routineId)) || null
  const effectiveS = prospective ? state : stateWithoutDuplicate(workout, state)
  const readings = prospective?.entries || {}

  /** @type {ProgressionDescriptor[]} */
  const items = []
  for (const entry of workout.entries) {
    if (doneWorkSets(entry).length <= 0) continue
    const item = evaluateSessionProgression(entry, effectiveS, {
      workout, routine, now, reading: readings[entry.id] || null,
    })
    if (item) items.push(item)
  }
  return items
}
