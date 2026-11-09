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
import { isWorkSet, isPerformed, isWarmupRow, workSets, doneWorkSets, modeOf, repStep, makeRow, modeForSet, isBw, defaultConfig } from './workout-model.js'
import { resolveSetWeight } from './units.js'
import { fmtNum } from './format.js'
import { t } from './i18n.js'

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
 * Number of stalled sessions required to trigger a deload under each policy.
 *
 * Linear counts consecutive Misses after the current Run's baseline. Double progression and
 * add-time count sessions in the current Run that made no progress; the Run's baseline is not
 * one of them, so a Deload is followed by a visible build-up rather than another Deload.
 * Greyskull resets on the first Miss by design, including at a Deload's new load.
 */
export const DELOAD_AFTER = { linear: 3, greyskull: 1, double: 4, time: 3 }
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

// Deload-if-stalled: the common shape behind time, double, linear and Greyskull.
// Counts no-progress sessions after the Run baseline; at the budget it backs off
// one step via `asHoldOrDeload`, otherwise returns null and the caller keeps building.
function deloadIfStalled(cur, step, noProgress, deloadAt, onHold, onDeload) {
  if (noProgress < deloadAt) return null
  return asHoldOrDeload(cur, step, onHold, onDeload)
}

// --- Progression streams and Runs -----------------------------------------
// A stream is the Target's shape: exercise + Mode + planned set count + top reps/seconds.
// Weight, the bottom of the rep range, per-side logging, and the policy are deliberately
// outside the shape: changing them must not throw away a climb. A different Target shape
// starts a new stream, whose first session is a baseline.
//
// A Run is the trailing stretch of stream sessions at one working value: the logged load for
// reps work, the prescribed hold for add-time. Its first session is a baseline, so following
// a deload cannot immediately trigger the next one.
const positive = v => (Number.isFinite(v) && v > 0 ? v : null)

/**
 * Whether a logged session belongs to the current exercise progression stream.
 *
 * Compares mode, planned set count, and target top reps or duration. Unweighted
 * bodyweight exercises share stream history across rep counts since progress
 * climbs towards `repsMax`.
 *
 * @param {Object} session - Evaluated session summary from `readSession`.
 * @param {Object} cfg - Current exercise target or routine configuration.
 * @param {string} mode - Active logging mode ('reps', 'time', or 'cardio').
 * @returns {boolean} True when the session shares this progression stream.
 */
function inStream(session, cfg, mode) {
  if (session.mode !== mode) return false
  const target = session.target || {}
  // Bodyweight progression's ceiling lives in `repsMax`, which older Entries never froze
  // onto the Target. Filtering on Target reps would throw away every climb, so bodyweight
  // streams share history by Mode and planned sets and let `repsMax` read the ceiling.
  // `weight: 0` is the plan's signal; a bodyweight-capable exercise trained with a belt is
  // on the normal load policies and keeps the top-reps shape.
  const bodyweight = mode === 'reps' && (cfg.weight === 0 || (cfg.weight == null && isBw(cfg)))
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

// The load a session actually worked at; the Prescription's load stands in when nothing was
// lifted, and the Target's load after that for Entries written before Prescription records.
const loadOf = (session, fallback) => {
  const w = session.weight ?? session.plan?.weight ?? session.target?.weight
  return Number.isFinite(w) ? w : (Number.isFinite(fallback) ? fallback : 0)
}

// Index of the first session after the last Deload. The Deload session itself is the new
// Run's baseline, so linear's Stall count starts here. Entries written before Prescription
// records cannot mark a Deload, so they keep the old all-history count.
function afterLastDeload(sessions) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].plan?.kind === 'deload') return i + 1
  }
  return 0
}

// First index of the trailing Run, i.e. the last session whose working value differs from
// the one after it. Same value on both sides keeps the Run going.
function runStart(sessions, valueOf) {
  if (!sessions.length) return 0
  const value = valueOf(sessions[sessions.length - 1])
  let start = sessions.length - 1
  while (start > 0 && valueOf(sessions[start - 1]) === value) start--
  return start
}

// Linear's Run: the sessions since the working value last changed — a Deload, an `up`, or
// the lifter's hand — excluding that change session as the baseline, the same boundary
// double progression already reads at a value change. A hand-set weight therefore earns a
// fresh Miss allowance instead of piling a Deload on top. A stretch that reaches the
// stream's first session had no change, so its count starts there; Entries written before
// Prescription records keep the older after-last-Deload boundary, which reads as the whole
// history.
function linearRun(sessions, last, cfg) {
  if (!last.plan) return sessions.slice(afterLastDeload(sessions))
  const start = runStart(sessions, s => loadOf(s, cfg.weight))
  return sessions.slice(start > 0 ? start + 1 : start)
}

// Shared Stall walk: count back from the newest session through the Run after its baseline,
// counting every session that did not clear the aim the previous one set. The first progress
// session breaks the chain; the baseline itself (`start`) is excluded.
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

// An unticked set reads 0, so the aim falls back to the bottom of the range rather than
// asking for the same missed number again.
const aimUp = (range, low) => Math.min(range.top, Math.max(range.bottom, (low || 0) + range.step))

// Double progression's Stall: neither a top hit nor Rep progress against the previous
// session's aim. The Run baseline is excluded; a progress session clears the chain.
function doubleNoProgress(sessions, start, range) {
  return noProgressSince(sessions, start, (s, prev) => {
    const aim = aimUp(range, prev.low)
    return s.ok || (s.enough && s.low >= aim)
  })
}

// The duration a time session was working against. The Prescription record is authoritative
// because add-time may prescribe above the frozen Target; pre-record history falls back to
// the Target it was logged under.
// The hold this session was given. A recorded Prescription wins over the frozen
// Target: a deload can ask for 25s while the Target still says 45s.
function prescribedSeconds(entry) {
  const plan = entry?.plan
  if (plan && plan.kind !== 'first' && plan.kind !== 'off' && positive(plan.sec)) return plan.sec
  return positive(entry?.target?.sec) ?? null
}

function sessionSeconds(session, cfg) {
  return prescribedSeconds(session) ?? positive(cfg.sec) ?? MIN_TIME_SEC
}

// The weakest hold that was actually performed. An unticked set is absent from this reading;
// `readSession.low` (which includes 0 for unticked sets) still decides progress.
function weakestPerformed(session) {
  const held = (session.held || []).filter(v => v > 0)
  return held.length ? Math.min(...held) : 0
}

/**
 * Target hold duration for the next add-time session step.
 *
 * Advances the weakest performed hold from the previous session by `inc`
 * seconds, capped at the prescribed working duration and clamped to valid
 * bounds (`MIN_TIME_SEC` to `MAX_TIME_SEC`). Falls back to working duration
 * when no holds were performed.
 *
 * @param {Object} session - Evaluated session summary from `readSession`.
 * @param {Object} cfg - Exercise target configuration.
 * @param {number} inc - Step increment in seconds.
 * @returns {number} Clamped target duration in seconds.
 */
function timeAim(session, cfg, inc) {
  const working = sessionSeconds(session, cfg)
  const weak = weakestPerformed(session)
  return clampTimeSec(weak > 0 ? Math.min(working, weak + inc) : working)
}

/**
 * Whether a session achieved a successful Hit under add-time progression.
 *
 * Requires a positive goal duration, sufficient completed work sets
 * (`enough`), and every performed hold meeting or exceeding the prescribed
 * working duration.
 *
 * @param {Object} session - Evaluated session summary from `readSession`.
 * @param {Object} cfg - Exercise target configuration.
 * @returns {boolean} True when all work sets met the prescribed hold duration.
 */
function timeHit(session, cfg) {
  const working = sessionSeconds(session, cfg)
  const held = session.held || []
  // A hand-edited zero Target is not a Hit even if the working floor was held; it is a
  // bad plan to clamp, not a progression to reward.
  return session.goal > 0 && !!session.enough && held.length > 0 && held.every(h => h >= working)
}

// Add-time's Stall: a session in the Run after its baseline whose weakest hold did not reach
// the aim the previous session asked for — `min(working, previous weakest + inc)`. A longer
// hold below that aim is still a Stall, not progress.
function timeNoProgress(sessions, start, cfg, inc) {
  return noProgressSince(sessions, start, (s, prev) => {
    const aim = timeAim(prev, cfg, inc)
    return s.enough && s.low > 0 && s.low >= aim
  })
}

/**
 * Evaluate a completed workout entry against its prescription and summarize performance.
 *
 * Returned summary fields:
 * - `ok`: boolean indicating whether every planned work set met or exceeded its target.
 * - `mode`: 'time' | 'reps'.
 * - `goal`: target reps or hold duration in seconds.
 * - `weight`: heaviest performed work-set weight, or null when no work set was performed. A logged zero stays zero.
 * - `best`: (time mode) highest completed hold duration in seconds across judged sets.
 * - `held`: (time mode) array of completed durations per judged set (0 for incomplete sets).
 * - `reps`: (reps mode) array of completed reps per judged set (0 for incomplete sets).
 * - `count`: (reps mode) count of performed work sets (used for bodyweight volume expansion).
 * - `low`: (reps mode) lowest completed reps across judged sets (used for double progression);
 *   (time mode) lowest hold, with an unticked set reading 0.
 * - `amrap`: (reps mode) completed reps on the final judged set (used for Greyskull LP double jumps).
 * - `enough`: whether the Entry carried every planned Work set (bonus sets do not hurt).
 *
 * Entries created prior to v1.2.2 lack a stored `target` and are evaluated against `fallback`
 * (the exercise's current routine plan) to prevent legacy history from scoring as false misses.
 *
 * @param {Object} entry - Finished workout entry containing `{ target?, sets?, id }`.
 * @param {Object} [fallback] - Current exercise routine target/plan used when entry has no stored target.
 * @param {Object|string|null} [workout=null] - Parent workout object or unit label string providing workout-level unit context.
 * @param {string} [targetUnit='kg'] - Desired unit preference for normalized output ('kg' | 'lb').
 * @returns {Object} Judged session summary.
 */
export function readSession(entry, fallback, workout = null, targetUnit = 'kg') {
  const target = (entry && entry.target) || fallback || {}
  const mode = modeOf({ ...target, id: entry && entry.id })
  const workoutContext = typeof workout === 'string' ? { unit: workout } : workout
  // Warm-up rows are prep, not the session: one filtered read beats guarding every consumer
  // below (an undone warm-up otherwise poisons `ok` forever and its reps drag `low`/`count`).
  const sets = workSets(entry)
  // Only the first N planned Work sets judge Hit/Miss: bonus sets beyond the plan
  // count toward volume and fatigue (read from the raw rows elsewhere) but never
  // flip a Hit to a Miss. Fewer rows than planned is still a Miss. A Prescription that
  // added a set is authoritative for that session; the Target's set count is the stream's
  // starting shape, not the volume the policy asked for.
  const planned = positive(entry?.plan?.sets) ?? positive(target.sets) ?? sets.length
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
    weight: performedWeight,
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
 * Set weights are normalized against the active profile's unit preference (ADR 0019).
 *
 * @param {Object} S - Application state atom containing `workouts` array and `unit`.
 * @param {string} exId - Exercise identifier from EXIDX.
 * @param {Object} [fallback] - Fallback routine configuration passed to `readSession`.
 * @returns {Array<Object>} Chronological array of judged sessions, each carrying the judged
 * summary plus the workout date `d`, frozen `target` and recorded `plan`.
 */
export function sessionsFor(S, exId, fallback) {
  const out = []
  const targetUnit = S?.unit || 'kg'
  ;(S?.workouts || []).forEach(w => {
    const entry = (w.entries || []).find(e => e.id === exId)
    // A finished Entry with zero performed Work sets still judges — as a Miss that
    // feeds Stall counting toward Deload. An Entry with no Work sets at all
    // (Warm-up sets only) is prep, never a Miss.
    if (workSets(entry).length) {
      out.push({
        d: w.d,
        ...readSession(entry, fallback, w, targetUnit),
        target: entry.target || null,
        plan: entry.plan || null,
      })
    }
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

// The load a reps session was actually working at. Deliberately not `loadOf`: that helper
// reads the frozen Target, which for a bodyweight exercise can legitimately be 0 even after
// the lifter has added weight. When nothing was performed, the Prescription's load and then
// the current plan are the only readings that say what was actually being attempted.
function workingLoad(last, cfg) {
  return last.weight ?? last.plan?.weight ?? cfg.weight ?? 0
}

// Add-time. Reads the hold it actually prescribed, not the frozen Target: a 50 s hold
// against a 45 s plan must lead to 55 s, and a 40 s Deload must not fall back to 45 s.
function timePrescription({ policy, cfg, inc, sessions, last, deloadAt }) {
  if (timeHit(last, cfg)) {
    const sec = round1(Math.max(sessionSeconds(last, cfg), weakestPerformed(last)) + inc)
    return { policy, kind: 'up', sec, why: ['Held every set for the full time — target up by {0}s.', inc] }
  }
  const start = runStart(sessions, s => sessionSeconds(s, cfg))
  const noProgress = timeNoProgress(sessions, start, cfg, inc)
  const weak = weakestPerformed(last)
  const base = weak > 0 ? weak : sessionSeconds(last, cfg)
  const stalled = deloadIfStalled(base, 5, noProgress, deloadAt,
    () => ({ policy, kind: 'hold', sec: Math.max(MIN_TIME_SEC, clampTimeSec(base)), why: ['Already at the shortest hold — same target again.'] }),
    sec => ({ policy, kind: 'deload', sec, why: ['No progress in {0} Workouts — back off to {1}s and build up again.', noProgress, sec] }))
  if (stalled) return stalled
  // Climb from the weakest hold actually performed, capped at the duration already being
  // attempted. This turns "45 s or nothing" into a ladder the lifter can actually climb.
  const aim = timeAim(last, cfg, inc)
  return { policy, kind: 'hold', sec: aim, why: ['Last time came up short — aim for {0}s and build from there.', aim] }
}

// Bodyweight work carries no external load, so there is nothing to add or take away —
// "deload your push-ups to 2.5 kg" is not advice. Progress in reps instead. This runs ahead
// of the individual policies because it is true for all of them. Note the trigger is the
// *logged* weight, not the `bw` flag: a dip done with a belt has a load to progress and
// belongs on the normal policies, and a barbell lift logged at 0 has nothing to add to.
// When nothing was performed at all, the plan weight stands in, so a fallen-apart
// barbell session holds at its plan weight instead of reading as bodyweight.
function loadlessPrescription({ policy, cfg, last }) {
  // The goal actually asked for, not the Target's starting reps: a frozen Target would pin
  // every session to one rep above the bottom. Legacy Entries without a Prescription record
  // fall back to the Target. A Hit is measured against that goal too, so a lifter asked for
  // 15 reps and doing the Target's 10 has not earned the next rep.
  const prescribed = positive(last.plan?.reps) ?? positive(last.goal) ?? positive(cfg.reps) ?? 0
  // The working set count: once volume growth has started, the last Prescription's count
  // is the current plan and must survive the rep climb; otherwise the Routine's sets (or
  // what was actually judged for freestyle) are the base.
  const planSets = positive(last.plan?.sets)
  const baseSets = cfg.sets == null ? null : Math.max(1, cfg.sets)
  const workingSets = Math.max(1, planSets ?? baseSets ?? last.count ?? 1)
  const carrySets = planSets != null ? { sets: workingSets } : {}
  const hit = prescribed > 0 && last.enough && last.low >= prescribed
  if (!hit) return { policy, kind: 'hold', weight: 0, reps: Math.max(1, prescribed), ...carrySets, why: ['Bodyweight — same target again until every set is clean.'] }
  // Reps earned beyond the prescription still count as work; climb from the weakest set
  // actually performed.
  const goal = Math.max(prescribed, last.low || 0)
  // A ceiling turns "+1 rep forever" into a structured plan: past the top of the range the
  // reps reset to the bottom and a set is added instead, which is how bodyweight work
  // actually progresses once high rep sets cease being an efficient strength stimulus.
  const top = cfg.repsMax > 0 ? cfg.repsMax : 0
  if (top > 0 && goal >= top) {
    // An explicit zero is a bad edit, not a plan, so it clamps to the safe minimum; an
    // absent value (freestyle) falls back to the top of the range.
    const sets = workingSets + 1
    const planReps = cfg.reps === 0 ? 1 : (cfg.reps || top)
    const bottom = Math.max(1, Math.min(planReps, top))
    if (sets <= MAX_BW_SETS) return { policy, kind: 'up', weight: 0, reps: bottom, sets, why: ['{0} reps in every set — add a set and go back to {1}.', goal, bottom] }
    // Out of sets worth adding: more volume is no longer the answer, load or a harder
    // variation is — and that is a decision for a person, not a policy.
    return { policy, kind: 'hold', weight: 0, reps: goal, ...carrySets, why: ['{0} sets of {1} — time to add weight or move to a harder variation.', workingSets, goal] }
  }
  // Unilateral work steps by two, so the total stays even and both sides get the rep.
  const next = goal + repStep(cfg)
  return { policy, kind: 'up', weight: 0, reps: next, ...carrySets, why: ['Bodyweight — every rep last time, so go for {0} this time.', next] }
}

// Double progression: climb reps through the range, then add load at the top.
function doublePrescription({ policy, cfg, inc, unit, sessions, last, deloadAt, w }) {
  const top = Math.max(1, cfg.reps > 0 ? cfg.reps : (last.goal || 10))
  const bottom = cfg.repsMin > 0
    ? Math.min(cfg.repsMin, top)
    : Math.max(1, top - 2)
  const step = repStep(cfg)
  const range = { top, bottom, step }
  if (last.ok) {
    // An `up` is exact: the announced Increment is the change from the load actually
    // lifted. Snapping from zero made 41 + 2.5 announce 2.5 but move 1.5.
    const nextW = round1(w + inc)
    return { policy, kind: 'up', weight: nextW, reps: bottom, why: ['Top of the rep range in every set — {0} {1} more, back to {2} reps.', inc, unit, bottom] }
  }

  // Double's Stall is no Rep progress, not "below the top". The current Run starts at the
  // last working-load change; its first session is the baseline and cannot stall.
  const start = runStart(sessions, s => loadOf(s, cfg.weight))
  const noProgress = doubleNoProgress(sessions, start, range)
  const stalled = deloadIfStalled(w, inc, noProgress, deloadAt,
    () => ({ policy, kind: 'hold', weight: w, reps: bottom, why: ['Lightest load — same weight again; build reps or add the smallest plate.'] }),
    dw => ({ policy, kind: 'deload', weight: dw, reps: bottom, why: ['No progress in {0} Workouts — deload to {1} {2}.', noProgress, dw, unit] }))
  if (stalled) return stalled
  // Rep progress is the weakest planned Work set meeting last time's low plus one step,
  // clamped to the range.
  const aim = aimUp(range, last.low)
  return { policy, kind: 'hold', weight: w, reps: aim, why: ['Same weight — aim for {0} reps this time.', aim] }
}

// linear. Reads its Run the way double progression and add-time do at a change of
// working value: the stretch that follows the change starts with a baseline session,
// never a Stall.
function linearPrescription({ policy, inc, unit, cfg, sessions, last, deloadAt, w }) {
  const stalls = stallCount(linearRun(sessions, last, cfg))
  if (last.ok) {
    // Every rep last time — one Increment more.
    return { policy, kind: 'up', weight: round1(w + inc), why: ['Every rep last time — {0} {1} more.', inc, unit] }
  }
  if (stalls >= deloadAt) {
    return deloadIfStalled(w, inc, stalls, deloadAt,
      () => ({ policy, kind: 'hold', weight: w, why: ['Already at the minimum load — same weight again.'] }),
      dw => ({ policy, kind: 'deload', weight: dw, why: stalls > 1
        ? ['Missed reps {0} Workouts running — reset to {1} {2} and work back up.', stalls, dw, unit]
        : ['Missed reps — reset to {0} {1} and work back up.', dw, unit] }))
  }
  return { policy, kind: 'hold', weight: w, why: ['Missed reps last time — same weight again ({0} of {1} to go).', deloadAt - stalls, deloadAt] }
}

// Greyskull keeps its deliberate reset-on-any-failure rule, including a second reset
// from the reduced weight, so it counts every Miss in the stream.
function greyskullPrescription({ policy, inc, unit, cfg, sessions, last, deloadAt, w }) {
  const stalls = stallCount(sessions)
  if (last.ok) {
    // Greyskull's final set is taken to failure: double the target reps there and you have
    // earned a double jump.
    const dbl = last.goal > 0 && last.amrap >= last.goal * 2
    const step = dbl ? inc * 2 : inc
    return {
      policy, kind: 'up', weight: round1(w + step),
      why: dbl
        ? ['Last set hit {0} reps — twice the target, so take a double jump of {1} {2}.', last.amrap, step, unit]
        : ['Every rep last time — {0} {1} more.', step, unit]
    }
  }
  if (stalls >= deloadAt) {
    return deloadIfStalled(w, inc, stalls, deloadAt,
      () => ({ policy, kind: 'hold', weight: w, why: ['Already at the minimum load — same weight again.'] }),
      dw => ({ policy, kind: 'deload', weight: dw, why: stalls > 1
        ? ['Missed reps {0} Workouts running — reset to {1} {2} and work back up.', stalls, dw, unit]
        : ['Missed reps — reset to {0} {1} and work back up.', dw, unit] }))
  }
  return { policy, kind: 'hold', weight: w, why: ['Missed reps last time — same weight again ({0} of {1} to go).', deloadAt - stalls, deloadAt] }
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
 * - Progression streams: history is filtered to the Target shape — exercise, Mode, planned
 *   sets, and top reps/seconds. A different shape starts a new stream with a `'first'`
 *   baseline; changing the policy, the range bottom, or the load keeps the stream.
 * - Runs: each policy reads the trailing sessions at one working value. A Run's first session
 *   is a baseline and never a Stall, so following a Deload builds up instead of cascading.
 * - Double progression: a `'hold'` aims at the previous weakest set plus one rep step, clamped
 *   to `[repsMin, reps]`. A Stall is a session after the Run baseline with neither a top hit
 *   nor Rep progress; `DELOAD_AFTER.double` of them deloads.
 * - Add-time: climbs from the weakest performed hold, and a Deload backs off the achieved hold
 *   rather than the frozen Target.
 * - Bodyweight (`weight <= 0`): load is never added or deloaded. Progresses reps from the
 *   Prescription's goal (not the Target's starting reps) until reaching `repsMax`, then resets
 *   reps to `reps` (or 1) and adds a set up to `MAX_BW_SETS`; the added set persists as the
 *   working volume. Unilateral exercises (`cfg.side === true`) increment reps by 2 so both
 *   sides progress evenly.
 * - Exact increments: every `'up'` adds `inc` to the working value as logged (`round1(w + inc)`),
 *   including off-grid loads; only a Deload snaps to the equipment or timer grid.
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

  // One Target shape is one Progression stream. A different Routine or a previous target
  // must not contribute a Hit to this climb; changing the policy or the bottom of the range
  // leaves the shape alone and keeps the history.
  const sessions = sessionsFor(S, cfg.id, cfg).filter(s => inStream(s, cfg, mode))
  const last = sessions[sessions.length - 1]
  if (!last) return { policy, kind: 'first', why: ['Nothing logged yet — this session sets the baseline.'] }

  const deloadAt = DELOAD_AFTER[policy] || 3
  if (mode === 'time') return timePrescription({ policy, inc, cfg, sessions, last, deloadAt })

  const w = workingLoad(last, cfg)
  if (w <= 0) return loadlessPrescription({ policy, cfg, last })
  if (policy === 'double') return doublePrescription({ policy, inc, unit, cfg, sessions, last, deloadAt, w })
  if (policy === 'greyskull') return greyskullPrescription({ policy, inc, unit, cfg, sessions, last, deloadAt, w })
  return linearPrescription({ policy, inc, unit, cfg, sessions, last, deloadAt, w })
}

/**
 * Apply a prescription to freshly built sets for an active workout.
 *
 * Invariants:
 * - Pure function: returns a new array of set rows without mutating input objects.
 * - Preserves performed sets and warm-up rows.
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
    if (isPerformed(s) || !isWorkSet(s)) return s
    const o = { ...s }
    if (p.weight != null) o.w = p.weight
    if (p.reps != null) o.r = p.reps
    if (p.sec != null) o.sec = p.sec
    return o
  })
  // A policy that decided on a set count gets to grow the list — bodyweight progression adds
  // a set where a barbell would have added a plate. Only ever upwards, and only by copying a
  // row that is already there: a session in progress must not lose a set it has logged.
  const workRows = out.filter(isWorkSet)
  if (p.sets > workRows.length) {
    // An all-warm-up entry has no work row to seed growth from - growing warm-up copies
    // would both invent work and never terminate the loop. Leave the entry untouched.
    if (!workRows.length) return out
    const seed = workRows[workRows.length - 1]
    const seedMode = modeForSet(seed, {})
    while (out.filter(isWorkSet).length < p.sets) out.push(makeRow(seedMode, {}, { prev: seed }))
  }
  return out
}

/**
 * Judge the Rows checked so far as the newest session in the Progression stream.
 * The profile copy is discarded. Nothing is written onto the Active workout.
 *
 * `aimDelta` is how far a rep aim moved against the previous in-stream session.
 * A different Target shape does not count. No previous session means the aim did not move.
 */
function projectedVerdict(entry, state) {
  const S = state && typeof state === 'object' ? state : {}
  const unit = S.unit || 'kg'
  const routineId = S.active?.routineId ?? null
  const workout = {
    id: 'milestone-projection',
    d: '9999-12-31',
    unit,
    routineId,
    entries: [entry]
  }
  const effectiveS = { ...S, unit, workouts: [...(S.workouts || []), workout] }
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
  if (prescription.kind === 'up' && mode !== 'time' && prescription.weight > 0) {
    const working = readSession(entry, cfg, workout, unit).weight || 0
    step = Math.round((prescription.weight - working) * 10) / 10
  }
  if (prescription.kind === 'hold' && prev && mode === 'reps' && prescription.reps != null) {
    const top = Math.max(1, cfg.reps > 0 ? cfg.reps : 10)
    const bottom = cfg.repsMin > 0 ? Math.min(cfg.repsMin, top) : Math.max(1, top - 2)
    const stepRep = repStep(cfg)
    const prevAim = Math.min(top, Math.max(bottom, (prev.low || 0) + stepRep))
    if (prescription.reps > prevAim) aimDelta = prescription.reps - prevAim
  }
  if (prescription.kind === 'hold' && prev && mode === 'time' && prescription.sec != null) {
    const inc = cfg.inc > 0 ? cfg.inc : DEFAULT_SEC_INCREMENT
    const prevAim = timeAim(prev, cfg, inc)
    if (prescription.sec > prevAim) aimDelta = prescription.sec - prevAim
  }
  return { prescription, unit, cfg, aimDelta, step }
}

// Paints the Milestone cue and the Progression summary from the Prescription (ADR 0018).
//
// The cue does not keep its own Hit rule. On the last planned Work set it projects the
// Rows checked so far as the newest session in the Progression stream, reads that
// Prescription, and drops the copy. Nothing is written onto the Active workout.
//
// Warm-up rows stay silent. A sub-target set stays neutral. A repeated aim or a
// Deload is explained on the Progression summary, not on the badge.

// A loaded or loadless advance, in the cue's words. Null when the Prescription
// did not unlock anything.
function unlockedCue(verdict, extra) {
  const p = verdict.prescription
  if (p.kind !== 'up') return null
  if (p.weight > 0) {
    return {
      kind: 'unlocked',
      label: t('All sets hit! +{0} {1} unlocked next session', verdict.step, verdict.unit),
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

/**
 * Resolve the progression policy in force for milestone evaluation.
 * Reuses policyFor to maintain a single source of truth.
 *
 * @param {Object} entry - Active workout entry.
 * @param {string} mode - Logging mode ('reps' | 'time' | 'cardio').
 * @param {Object} [routine] - Optional parent routine object.
 * @returns {string} Progression policy name.
 */
function resolvePolicy(entry, mode, routine) {
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
 * @param {Object} [context] - Profile `{ state }`. The routine comes from `state.active` and `state.routines`.
 * @returns {Object|null} Milestone descriptor `{ kind, label, ... }` or null if no milestone.
 */
export function evaluateSetMilestone(entry, setIdx, context = {}) {
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.sets)) return null
  if (setIdx == null || setIdx < 0 || setIdx >= entry.sets.length) return null

  const setRow = entry.sets[setIdx]
  if (!setRow || typeof setRow !== 'object') return null

  // Warm-up sets and uncompleted sets never receive milestone cues (ADR 0016).
  if (!isPerformed(setRow) || isWarmupRow(setRow)) return null

  const target = entry.target || entry || {}
  const mode = modeOf({ ...target, id: entry.id })
  const S = context?.state && typeof context.state === 'object' ? context.state : null
  const routine = S?.active?.routineId
    ? (S.routines || []).find(r => r.id === S.active.routineId) || null
    : null
  const policy = resolvePolicy(entry, mode, routine)

  if (policy === 'off') return null

  const workRows = entry.sets.filter(isWorkSet)
  const plannedCount = positive(entry?.plan?.sets) ?? positive(target.sets) ?? workRows.length
  const workIdx = workRows.indexOf(setRow)

  if (policy === 'linear') {
    const targetReps = Number(target.reps ?? target.r ?? (entry.plan && entry.plan.reps)) || 0
    if (targetReps <= 0) return null

    const reps = Number(setRow.r ?? setRow.reps) || 0
    if (reps < targetReps) return null

    if (workIdx === plannedCount - 1) {
      const unlocked = unlockedCue(projectedVerdict(entry, S), { reps, targetReps })
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

    const sec = Number(setRow.sec ?? setRow.seconds) || 0

    if (workIdx === plannedCount - 1) {
      const { prescription: p, aimDelta, step } = projectedVerdict(entry, S)
      if (p.kind === 'up' && p.sec != null) {
        return {
          kind: 'unlocked',
          label: t('All sets hit! +{0}s unlocked next session', step),
          sec,
          targetSec
        }
      }
      if (aimDelta > 0) {
        return {
          kind: 'progress',
          label: t('Hold progress (+{0}s)', aimDelta),
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
    const targetReps = Number(target.reps ?? target.r ?? (entry.plan && entry.plan.reps)) || 0
    if (targetReps <= 0) return null

    const reps = Number(setRow.r ?? setRow.reps) || 0

    // Intermediate work set meeting rep ceiling
    if (workIdx >= 0 && workIdx < plannedCount - 1 && reps >= targetReps) {
      return {
        kind: 'hit',
        label: t('{0}/{1} reps · On track', reps, targetReps),
        reps,
        targetReps
      }
    }

    if (workIdx === plannedCount - 1) {
      const verdict = projectedVerdict(entry, S)
      const unlocked = unlockedCue(verdict, { reps, targetReps })
      if (unlocked) return unlocked
      if (verdict.aimDelta > 0) {
        return {
          kind: 'progress',
          label: t('Rep progress (+{0})', verdict.aimDelta),
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

    const reps = Number(setRow.r ?? setRow.reps) || 0

    const isAMRAP = workIdx === plannedCount - 1

    if (isAMRAP) {
      const verdict = projectedVerdict(entry, S)
      const p = verdict.prescription
      if (p.kind === 'up' && p.weight > 0 && reps >= targetReps) {
        const bonus = reps - targetReps
        if (bonus > 0) {
          return {
            kind: 'bonus',
            label: t('AMRAP +{0} · +{1} {2} unlocked next session', bonus, verdict.step, verdict.unit),
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
      // An earlier Miss keeps the AMRAP row quiet. A ceiling hold still shows the set-level Hit.
      if (reps >= targetReps && readSession(entry, verdict.cfg).ok) {
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
  const judged = readSession(entry, cfg)
  const ex = EXIDX[entry.id] || { n: entry.id }
  const exName = ex.n || entry.id
  const unit = state?.unit || workout?.unit || 'kg'
  const policy = p.policy || policyFor(cfg, routine)
  const policyName = POLICY_NAME[policy] || policy

  const oldWeight = judged.weight ?? entry.target?.weight ?? 0
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
