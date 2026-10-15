// Pure automatic progression engine.
//
// Everything here is a pure function of the workout history. Nothing writes back into a
// finished workout: the log is what happened, and the next prescription is *derived* from
// it every time it is needed. That means changing a policy — or fixing a mistyped set —
// immediately produces the right next target, with no stored counters to drift out of sync.
//
// It replaces a single hard-coded rule ("all reps done → add 2.5") with a small set of named
// policies. The rule that applies is always visible in the app, together with the reason it
// picked this weight, because a suggestion you can't audit is one you stop trusting.
//
// Reading a session honestly is the whole game:
//   · a set checked off with at least its target reps/sec  → hit
//   · a set checked off with fewer reps/sec                → miss (you logged what you got)
//   · a set never checked off                              → miss (it was not performed)
//   · fewer sets than prescribed                           → miss
//   · legacy history lacking a stored target               → judged on performed rows against
//                                                           the fallback rep/sec goal so routine
//                                                           set-count edits do not trigger deloads
// So a session that fell apart can never advance the load as though it had succeeded.
import { EXIDX } from './exercises.js'
import { isWarmupRow, modeOf, repStep, makeRow, modeForSet } from './workout-model.js'

/**
 * Supported automatic progression policy identifiers.
 * - 'off': Automatic progression disabled; targets remain fixed.
 * - 'linear': Advance load after completing all target reps across planned sets; deload after repeated stalls.
 * - 'greyskull': Advance load on hitting targets, with double-jump on doubling AMRAP target; deload 10% on first miss.
 * - 'double': Progress reps within a [repsMin, reps] range before increasing weight.
 * - 'time': Increase target duration after holding all sets for prescribed time.
 */
export const POLICIES = ['off', 'linear', 'greyskull', 'double', 'time']

/**
 * Permissible progression policies for each exercise logging mode.
 * Policies outside a mode's allowed list fall back to 'off'.
 */
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

/**
 * Number of consecutive failed sessions required to trigger a deload under each policy.
 * Greyskull resets on the first failure by design; linear, double, and time progression
 * give three attempts before backing off load or duration.
 */
export const DELOAD_AFTER = { linear: 3, greyskull: 1, double: 3, time: 3 }
// Multiplier for standard 10% deload reductions.
const DELOAD_FACTOR = 0.9

// Body parts where a 5 kg jump is normal rather than brutal.
const HEAVY_BP = ['upper legs', 'lower legs', 'back', 'hips', 'glutes']

/**
 * Return the default load increment for an exercise based on targeted body part and active unit.
 *
 * Lower-body lifts (legs, back, hips, glutes) take larger jumps (5 kg / 10 lb) than upper-body
 * movements (2.5 kg / 5 lb) to match linear progression pacing. An exercise configuration can
 * override this default with `cfg.inc`.
 *
 * @param {string} exId - Exercise identifier from EXIDX.
 * @param {string} [unit='kg'] - Active weight unit ('kg' or 'lb').
 * @returns {number} Default weight increment (2.5 or 5 for kg; 5 or 10 for lb).
 */
export function defaultIncrement(exId, unit) {
  const ex = EXIDX[exId]
  const heavy = ex && HEAVY_BP.includes(ex.bp)
  if (unit === 'lb') return heavy ? 10 : 5
  return heavy ? 5 : 2.5
}
/** Default time increment in seconds added when progressing timed exercises. */
export const DEFAULT_SEC_INCREMENT = 5

/**
 * Smallest allowable hold duration in seconds.
 * Hand-edited zero or negative time goals clamp here so a bad edit never yields an empty prescription.
 */
export const MIN_TIME_SEC = 5
/**
 * Clamp a hold duration to the smallest prescribable value.
 *
 * @param {number} v - Candidate duration in seconds; zero, negative, and non-positive values yield the minimum.
 * @returns {number} v when positive, else MIN_TIME_SEC (5).
 */
const clampTimeSec = v => (v > 0 ? v : MIN_TIME_SEC)

/**
 * Maximum number of sets prescribable during bodyweight volume progression.
 * Past this ceiling, adding more sets ceases to be an efficient strength stimulus; the policy
 * holds and suggests adding external load or moving to a harder movement variation.
 */
export const MAX_BW_SETS = 6
/**
 * Resolve the progression policy in force for one exercise.
 *
 * Precedence:
 * 1. Exercise-level override (`cfg.prog`).
 * 2. Routine-level default (`routine.prog`).
 * 3. Mode-level default ('linear' for reps mode; 'off' otherwise).
 *
 * If the chosen policy is not supported for the resolved mode in `POLICIES_FOR`, returns 'off'.
 *
 * @param {Object} [cfg] - Exercise configuration from routine or active entry.
 * @param {Object} [routine] - Parent routine object containing routine default settings.
 * @param {string} [mode] - Optional mode override ('reps' | 'time' | 'cardio'). Inferred from cfg if omitted.
 * @returns {string} One of POLICIES ('off', 'linear', 'greyskull', 'double', 'time').
 */
export function policyFor(cfg, routine, mode) {
  const m = mode || modeOf(cfg || {})
  const allowed = POLICIES_FOR[m] || ['off']
  const pick = (cfg && cfg.prog) || (routine && routine.prog) || (m === 'reps' ? 'linear' : 'off')
  return allowed.includes(pick) ? pick : 'off'
}

/**
 * Round a load or duration to one decimal place.
 *
 * @param {number} v - Continuous value in kg, lb, or seconds.
 * @returns {number} Value rounded to the nearest tenth.
 */
const round1 = v => Math.round(v * 10) / 10
/**
 * Quantize a training load or duration to the nearest discrete increment.
 *
 * @param {number} v - Continuous weight (kg/lb) or duration (seconds) value.
 * @param {number} step - Minimum equipment plate increment or timer step. If non-positive, returns `v` rounded to 1 decimal place.
 * @returns {number} Quantized value rounded to 1 decimal place.
 */
function snap(v, step) {
  if (!(step > 0)) return round1(v)
  return round1(Math.round(v / step) * step)
}
/**
 * Back off by DELOAD_FACTOR (10% reduction), landing on something you can actually load.
 *
 * Rounding to the nearest step keeps the cut close to the intended 10 %, but on small weights
 * the nearest step can be the weight you started from — so a deload that did not actually
 * reduce anything takes one step down instead. Never goes below a single step (`step`).
 * When even that cannot reduce the weight, callers treat the result as a hold, never a
 * same-weight deload.
 *
 * @param {number} cur - Current weight or time value.
 * @param {number} step - Minimum increment/decrement step.
 * @returns {number} Deloaded value, guaranteed >= step.
 */
function deloadTo(cur, step) {
  let next = snap(cur * DELOAD_FACTOR, step)
  if (next >= cur) next = snap(cur - step, step)
  return Math.max(step, next)
}

// One Deload-or-hold decision: a Deload that cannot reduce the working weight reads
// as a hold, never a same-weight "deload".
function asHoldOrDeload(cur, step, onHold, onDeload) {
  const next = deloadTo(cur, step)
  return next >= cur ? onHold() : onDeload(next)
}

/**
 * Evaluate a completed workout entry against its prescription and summarize performance.
 *
 * Returned summary fields:
 * - `ok`: boolean indicating whether every planned work set met or exceeded its target.
 * - `mode`: 'time' | 'reps'.
 * - `goal`: target reps or hold duration in seconds.
 * - `weight`: highest completed work weight in this entry (0 for unloaded/bodyweight).
 * - `best`: (time mode) highest completed hold duration in seconds across judged sets.
 * - `held`: (time mode) array of completed durations per judged set (0 for incomplete sets).
 * - `reps`: (reps mode) array of completed reps per judged set (0 for incomplete sets).
 * - `count`: (reps mode) count of performed work sets (used for bodyweight volume expansion).
 * - `low`: (reps mode) lowest completed reps across judged sets (used for double progression).
 * - `amrap`: (reps mode) completed reps on the final judged set (used for Greyskull LP double jumps).
 *
 * Entries created prior to v1.2.2 lack a stored `target` and are evaluated against `fallback`
 * (the exercise's current routine plan) to prevent legacy history from scoring as false misses.
 *
 * @param {Object} entry - Finished workout entry containing `{ target?, sets?, id }`.
 * @param {Object} [fallback] - Current exercise routine target/plan used when entry has no stored target.
 * @returns {Object} Judged session summary.
 */
export function readSession(entry, fallback) {
  const target = (entry && entry.target) || fallback || {}
  const mode = modeOf({ ...target, id: entry && entry.id })
  // Warm-up rows are prep, not the session: one filtered read beats guarding every consumer
  // below (an undone warm-up otherwise poisons `ok` forever and its reps drag `low`/`count`).
  const sets = ((entry && entry.sets) || []).filter(s => !isWarmupRow(s))
  // Only the first N planned Work sets judge Hit/Miss: bonus sets beyond the plan
  // count toward volume and fatigue (read from the raw rows elsewhere) but never
  // flip a Hit to a Miss. Fewer rows than planned is still a Miss.
  const planned = target.sets || sets.length
  const judged = sets.slice(0, planned)
  const enough = sets.length >= planned

  if (mode === 'time') {
    const goal = target.sec || 0
    const held = judged.map(s => (s.done ? (s.sec || 0) : 0))
    return {
      mode, goal, held,
      weight: Math.max(0, ...judged.filter(s => s.done).map(s => s.w || 0)),
      best: Math.max(0, ...held),
      ok: goal > 0 && enough && held.length > 0 && held.every(h => h >= goal)
    }
  }
  const goal = target.reps || 0
  const reps = judged.map(s => (s.done ? (s.r || 0) : 0))
  return {
    mode, goal, reps,
    weight: Math.max(0, ...judged.filter(s => s.done).map(s => s.w || 0)),
    // Judged Work sets only: bonus sets beyond the plan count toward volume/fatigue
    // (read from the raw rows elsewhere) but must never leak into added-set growth (#33).
    count: judged.length,
    low: reps.length ? Math.min(...reps) : 0,
    amrap: reps.length ? reps[reps.length - 1] : 0,   // Greyskull's final set
    ok: goal > 0 && enough && reps.length > 0 && reps.every(r => r >= goal)
  }
}

/**
 * Retrieve every past session for one exercise in chronological order (oldest first).
 * Skips entries containing only warm-up rows (prep sets are not judged training sessions).
 *
 * @param {Object} S - Application state atom containing `workouts` array.
 * @param {string} exId - Exercise identifier from EXIDX.
 * @param {Object} [fallback] - Fallback routine configuration passed to `readSession`.
 * @returns {Array<Object>} Chronological array of judged sessions with workout date `d` attached.
 */
export function sessionsFor(S, exId, fallback) {
  const out = []
  ;(S.workouts || []).forEach(w => {
    const entry = (w.entries || []).find(e => e.id === exId)
    // A finished Entry with zero performed Work sets still judges — as a Miss that
    // feeds Stall counting toward Deload. An Entry with no Work sets at all
    // (Warm-up sets only) is prep, never a Miss.
    if (entry && ((entry.sets || []).some(s => !isWarmupRow(s)))) out.push({ d: w.d, ...readSession(entry, fallback) })
  })
  return out
}

/**
 * Count how many consecutive sessions ended in a Miss, scanning backwards from the most recent.
 *
 * Stops counting at the first session where `ok === true`. A single successful session
 * resets the stall count to 0.
 *
 * @param {Array<Object>} sessions - Chronologically ordered judged sessions.
 * @returns {number} Count of consecutive trailing misses.
 */
export function stallCount(sessions) {
  let n = 0
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].ok) break
    n++
  }
  return n
}

/**
 * Compute the next prescription for one exercise based on its history and progression policy.
 *
 * Evaluates past sessions under the resolved policy, counts stalls, and derives the next
 * load, rep, duration, or set recommendation.
 *
 * Returned prescription fields:
 * - `policy`: active progression policy name ('off', 'linear', 'greyskull', 'double', 'time').
 * - `kind`: outcome classification:
 *   - 'first': No previous history; this workout establishes the baseline.
 *   - 'up': Target advanced (increased weight, reps, duration, or sets).
 *   - 'hold': Maintain current target (missed goal, or clamped at boundaries).
 *   - 'deload': Load or duration backed off after reaching stall threshold (`DELOAD_AFTER`).
 *   - 'off': Automatic progression disabled.
 * - `weight`: recommended load in active units (`S.unit` or 'kg') if specified/modified.
 * - `reps`: recommended rep goal if specified/modified.
 * - `sec`: recommended hold duration in seconds for timed exercises.
 * - `sets`: recommended set count (used when bodyweight progression adds a set).
 * - `why`: `[templateString, ...args]` translatable format tuple explaining the decision.
 *
 * Domain progression rules:
 * - Bodyweight (`weight <= 0`): load is never added or deloaded. Progresses reps until
 *   reaching `repsMax`, then resets reps to `reps` (or 1) and adds a set up to `MAX_BW_SETS`.
 *   Unilateral exercises (`cfg.side === true`) increment reps by 2 so both sides progress evenly.
 * - Non-reducing deloads: when already at the minimum step or `MIN_TIME_SEC`, a deload that
 *   cannot reduce resolves as a `'hold'` with an explanatory message rather than a same-weight deload.
 * - Input clamping: zero or negative rep/second goals clamp to safe minimums (1 rep, `MIN_TIME_SEC`).
 *
 * @param {Object} S - Application state atom containing `workouts` and `unit`.
 * @param {Object} cfg - Target exercise configuration (`{ id, weight?, reps?, sec?, prog?, inc?, repsMin?, repsMax?, sets? }`).
 * @param {Object} [routine] - Optional parent routine object providing routine default settings.
 * @returns {Object} Prescription object.
 */
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

  const w = last.weight || cfg.weight || 0
  // Bodyweight work carries no external load, so there is nothing to add or take away —
  // "deload your push-ups to 2.5 kg" is not advice. Progress in reps instead. This runs ahead
  // of the individual policies because it is true for all of them. Note the trigger is the
  // *logged* weight, not the `bw` flag: a dip done with a belt has a load to progress and
  // belongs on the normal policies, and a barbell lift logged at 0 has nothing to add to.
  // When nothing was performed at all, the plan weight stands in, so a fallen-apart
  // barbell session holds at its plan weight instead of reading as bodyweight.
  if (w <= 0) {
    const goal = last.goal || cfg.reps || 0
    if (!last.ok || goal <= 0) return { policy, kind: 'hold', weight: 0, reps: Math.max(1, goal), why: ['Bodyweight — same target again until every set is clean.'] }
    // A ceiling turns "+1 rep forever" into a structured plan: past the top of the range the
    // reps reset to the bottom and a set is added instead, which is how bodyweight work
    // actually progresses once high rep sets cease being an efficient strength stimulus.
    const top = cfg.repsMax > 0 ? cfg.repsMax : 0
    if (top > 0 && goal >= top) {
      // Added-set growth resumes from the current Routine target: cutting sets in the
      // plan lowers the resume point instead of rebuilding from the history high. An
      // explicit zero is a bad edit, not a plan, so it clamps to the safe minimum;
      // an absent value (freestyle) still falls back to what was actually done.
      const planSets = cfg.sets == null ? null : Math.max(1, cfg.sets)
      const sets = Math.max(1, planSets ?? last.count ?? 1) + 1
      const planReps = cfg.reps === 0 ? 1 : (cfg.reps || top)
      const bottom = Math.max(1, Math.min(planReps, top))
      if (sets <= MAX_BW_SETS) return { policy, kind: 'up', weight: 0, reps: bottom, sets, why: ['{0} reps in every set — add a set and go back to {1}.', goal, bottom] }
      // Out of sets worth adding: more volume is no longer the answer, load or a harder
      // variation is — and that is a decision for a person, not a policy.
      return { policy, kind: 'hold', weight: 0, reps: goal, why: ['{0} sets of {1} — time to add weight or move to a harder variation.', sets - 1, goal] }
    }
    // Unilateral work steps by two, so the total stays even and both sides get the rep.
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

  // linear + greyskull
  if (last.ok) {
    // Greyskull's final set is taken to failure: double the target reps there and you have
    // earned a double jump.
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

/**
 * Apply a prescription to freshly built sets for an active workout.
 *
 * Invariants:
 * - Pure function: returns a new array of set rows without mutating input objects.
 * - Preserves completed sets (`s.done === true`) and warm-up sets (`isWarmupRow(s)`).
 * - Only fields decided by the prescription (`weight -> w`, `reps -> r`, `sec -> sec`)
 *   are updated on uncompleted work sets.
 * - When `p.sets` exceeds current work sets, appends new work rows cloned from the last
 *   work set (`seedMode`, `prev: seed`) up to `p.sets`. If the entry has only warm-up rows,
 *   no rows are appended.
 *
 * @param {Array<Object>} sets - Current set rows for an active workout entry.
 * @param {Object} p - Prescription object returned by `nextPrescription`.
 * @returns {Array<Object>} Updated set rows.
 */
export function applyPrescription(sets, p) {
  if (!p || p.kind === 'off' || p.kind === 'first') return sets
  const out = sets.map(s => {
    // Never rewrite a logged set, and never rewrite a warm-up: the prescription speaks to
    // the work rows only (a ticked warm-up falling through here would be the data-loss the
    // cascade fix removed, two files over).
    if (s.done || isWarmupRow(s)) return s
    const o = { ...s }
    if (p.weight != null) o.w = p.weight
    if (p.reps != null) o.r = p.reps
    if (p.sec != null) o.sec = p.sec
    return o
  })
  // A policy that decided on a set count gets to grow the list — bodyweight progression adds
  // a set where a barbell would have added a plate. Only ever upwards, and only by copying a
  // row that is already there: a session in progress must not lose a set it has logged.
  const workRows = out.filter(s => !isWarmupRow(s))
  if (p.sets > workRows.length) {
    // An all-warm-up entry has no work row to seed growth from - growing warm-up copies
    // would both invent work and never terminate the loop. Leave the entry untouched.
    if (!workRows.length) return out
    const seed = workRows[workRows.length - 1]
    const seedMode = modeForSet(seed, {})
    while (out.filter(s => !isWarmupRow(s)).length < p.sets) out.push(makeRow(seedMode, {}, { prev: seed }))
  }
  return out
}
