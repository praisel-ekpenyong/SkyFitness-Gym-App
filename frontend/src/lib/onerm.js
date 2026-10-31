import { doneWorkSets } from './workout-model.js'
import { workoutTimestamp } from './format.js'
import { LB_TO_KG } from './bodyweight.js'
// Estimated one-rep maximum (1RM) calculation and progression tracking.
//
// Deliberately knows nothing about the exercise database: an estimate needs a weight AND a
// rep count, and only reps-mode sets carry both. Cardio sets ({min, speed}) and timed sets
// ({sec, w}) therefore drop out of every scan here on their own — there is no exercise-type
// check to keep in sync.
//
// Formulas are the usual submaximal-load estimators. Epley is the default because it is the
// one most lifters have seen; all of them agree closely at low reps and diverge as reps rise,
// which is exactly why REP_CAP exists.

// Above this many reps an estimate says more about work capacity than about maximal strength,
// and the formulas disagree by double digits. Refusing to guess beats printing a fantasy.
export const REP_CAP = 12

export const FORMULAS = {
  // Epley 1985 — w · (1 + r/30)
  epley: (w, r) => w * (1 + r / 30),
  // Brzycki 1993 — w · 36/(37 − r); undefined at r ≥ 37, but REP_CAP is far below that
  brzycki: (w, r) => w * 36 / (37 - r),
  // Lombardi 1989 — w · r^0.10
  lombardi: (w, r) => w * Math.pow(r, 0.1)
}
export const DEFAULT_FORMULA = 'epley'

/**
 * Resolve the load of a set normalized to the target unit (ADR 0017).
 *
 * Inspects `s.unit ?? entry?.unit ?? workout?.unit ?? targetUnit`.
 * - If set unit is 'lb' and targetUnit is 'kg', scales by `LB_TO_KG` (0.45359237).
 * - If set unit is 'kg' and targetUnit is 'lb', scales by `1 / LB_TO_KG` (2.20462).
 * - Otherwise returns numerical load unchanged.
 *
 * @param {Object} s - Set object with weight property `w`.
 * @param {Object|null} [entry=null] - Containing workout entry.
 * @param {Object|null} [workout=null] - Containing workout.
 * @param {string} [targetUnit='kg'] - Target profile unit ('kg' | 'lb').
 * @returns {number} Normalized load.
 */
export function resolveSetWeight(s, entry = null, workout = null, targetUnit = 'kg') {
  const w = Number(s?.w)
  if (!Number.isFinite(w)) return 0
  const unit = s?.unit ?? entry?.unit ?? workout?.unit ?? targetUnit
  if (unit === 'lb' && targetUnit === 'kg') return w * LB_TO_KG
  if (unit === 'kg' && targetUnit === 'lb') return w / LB_TO_KG
  return w
}

/**
 * Estimate 1RM from a completed set weight and rep count.
 *
 * For single repetitions (`reps === 1`), the weight is the measured maximum and is returned
 * directly without formula application. For sets exceeding `REP_CAP` (12 reps), returns null
 * as submaximal formulas lose validity.
 *
 * @param {number} w - Lifted load in active units.
 * @param {number} r - Repetitions performed.
 * @param {string} [formula='epley'] - Submaximal formula identifier ('epley' | 'brzycki' | 'lombardi').
 * @returns {number|null} Estimated 1RM rounded to 1 decimal place, or null if invalid/uncapped.
 */
export function estimate1RM(w, r, formula = DEFAULT_FORMULA) {
  const weight = Number(w)
  const reps = Number(r)
  if (!isFinite(weight) || !isFinite(reps)) return null
  if (weight <= 0 || reps < 1) return null
  if (reps > REP_CAP) return null
  const fn = FORMULAS[formula] || FORMULAS[DEFAULT_FORMULA]
  const est = reps === 1 ? weight : fn(weight, Math.round(reps))
  if (!isFinite(est) || est <= 0) return null
  return Math.round(est * 10) / 10
}

/**
 * Calculate the highest estimated 1RM among completed work sets in a single workout entry.
 *
 * Excludes warm-up rows, uncompleted sets, and post-exercise confirmed weight (`topW`).
 * Normalizes set loads to `targetUnit` before calling `estimate1RM` per ADR 0017.
 *
 * @param {Object} entry - Workout entry containing `sets` array.
 * @param {string} [formula='epley'] - Formula name.
 * @param {string} [targetUnit='kg'] - Active profile unit for read-time normalization ('kg' | 'lb').
 * @param {Object|null} [workout=null] - Containing workout for fallback unit context.
 * @returns {{ est: number, w: number, r: number }|null} Best estimate and source set details, or null if none.
 */
export function bestSetOf(entry, formula = DEFAULT_FORMULA, targetUnit = 'kg', workout = null) {
  let f = formula
  let unit = targetUnit
  if (typeof formula === 'string' && (formula === 'kg' || formula === 'lb')) {
    unit = formula
    f = DEFAULT_FORMULA
  }
  let best = null
  for (const s of doneWorkSets(entry)) {
    const normW = resolveSetWeight(s, entry, workout, unit)
    const est = estimate1RM(normW, s.r, f)
    if (est !== null && (!best || est > best.est)) {
      best = {
        est,
        w: Math.round(normW * 10) / 10,
        r: Math.round(Number(s.r)),
      }
    }
  }
  return best
}

/**
 * Generate a chronological timeline of peak 1RM estimates for an exercise across past workouts.
 *
 * Produces one data point per workout where the exercise had valid completed work sets,
 * normalizing all historical estimates to the active profile unit `S.unit` per ADR 0017.
 *
 * @param {Object} S - Application state atom containing `workouts` and `unit`.
 * @param {string} exId - Target exercise identifier.
 * @param {string} [formula='epley'] - Formula name.
 * @returns {Array<{ t: number, d: string, y: number, w: number, r: number }>} Chronological points for trend charting.
 */
export function e1rmSeries(S, exId, formula = DEFAULT_FORMULA) {
  const pts = []
  const targetUnit = S?.unit || 'kg'
  for (const w of S?.workouts || []) {
    const entry = (w.entries || []).find(e => e.id === exId)
    if (!entry) continue
    const best = bestSetOf(entry, formula, targetUnit, w)
    if (best) pts.push({ t: workoutTimestamp(w), d: w.d, y: best.est, w: best.w, r: best.r })
  }
  return pts
}

/**
 * Retrieve the all-time peak estimated 1RM for an exercise across historical workouts.
 *
 * Retains source set load, reps, calendar date, and timestamp for provenance inspection,
 * normalized to the active profile unit `S.unit` per ADR 0017.
 *
 * @param {Object} S - Application state atom containing `workouts` and `unit`.
 * @param {string} exId - Target exercise identifier.
 * @param {string} [formula='epley'] - Formula name.
 * @returns {{ est: number, w: number, r: number, d: string, t: number }|null} Peak estimate record, or null if none.
 */
export function best1RM(S, exId, formula = DEFAULT_FORMULA) {
  let best = null
  e1rmSeries(S, exId, formula).forEach(p => { if (!best || p.y > best.est) best = { est: p.y, w: p.w, r: p.r, d: p.d, t: p.t } })
  return best
}

/**
 * Evaluate whether an active workout entry established a new all-time 1RM record.
 *
 * Compares the best set of the entry against historical workouts in `S.workouts` (which does not yet
 * include the active workout), evaluating both in the same unit (`S?.unit || 'kg'`) per ADR 0017.
 * Supports both signatures: `is1RMRecord(S, exId, entry, formula)` and `is1RMRecord(entry, S)`.
 *
 * @param {Object} S_or_entry - Application state atom OR workout entry.
 * @param {string|Object} exId_or_S - Target exercise identifier OR application state atom.
 * @param {Object|string} [entry] - Active workout entry OR formula name.
 * @param {string} [formula='epley'] - Formula name.
 * @param {Object|null} [workout=null] - Containing active workout context.
 * @returns {{ est: number, w: number, r: number, prev: number }|null} Record details if broken, or null otherwise.
 */
export function is1RMRecord(S_or_entry, exId_or_S, entry, formula = DEFAULT_FORMULA, workout = null) {
  let S, exId, targetEntry, targetFormula
  if (S_or_entry && (Array.isArray(S_or_entry.sets) || (!S_or_entry.workouts && S_or_entry.id && exId_or_S?.workouts))) {
    targetEntry = S_or_entry
    S = exId_or_S
    exId = targetEntry.id
    targetFormula = entry || DEFAULT_FORMULA
  } else {
    S = S_or_entry
    exId = exId_or_S
    targetEntry = entry
    targetFormula = formula
  }
  const targetUnit = S?.unit || 'kg'
  const targetWorkout = workout || S?.active || null
  const now = bestSetOf(targetEntry, targetFormula, targetUnit, targetWorkout)
  if (!now) return null
  const prev = best1RM(S, exId, targetFormula)
  return !prev || now.est > prev.est ? { ...now, prev: prev ? prev.est : 0 } : null
}
