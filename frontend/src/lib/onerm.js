import { isWarmupRow } from './workout-model.js'
import { workoutTimestamp } from './format.js'
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
 *
 * @param {Object} entry - Workout entry containing `sets` array.
 * @param {string} [formula='epley'] - Formula name.
 * @returns {{ est: number, w: number, r: number }|null} Best estimate and source set details, or null if none.
 */
export function bestSetOf(entry, formula = DEFAULT_FORMULA) {
  let best = null
  for (const s of entry?.sets || []) {
    if (!s.done || isWarmupRow(s)) continue
    const est = estimate1RM(s.w, s.r, formula)
    if (est !== null && (!best || est > best.est)) best = { est, w: Number(s.w), r: Math.round(Number(s.r)) }
  }
  return best
}

/**
 * Generate a chronological timeline of peak 1RM estimates for an exercise across past workouts.
 *
 * Produces one data point per workout where the exercise had valid completed work sets.
 *
 * @param {Object} S - Application state atom containing `workouts`.
 * @param {string} exId - Target exercise identifier.
 * @param {string} [formula='epley'] - Formula name.
 * @returns {Array<{ t: number, d: string, y: number, w: number, r: number }>} Chronological points for trend charting.
 */
export function e1rmSeries(S, exId, formula = DEFAULT_FORMULA) {
  const pts = []
  for (const w of S.workouts || []) {
    const entry = (w.entries || []).find(e => e.id === exId)
    if (!entry) continue
    const best = bestSetOf(entry, formula)
    if (best) pts.push({ t: workoutTimestamp(w), d: w.d, y: best.est, w: best.w, r: best.r })
  }
  return pts
}

/**
 * Retrieve the all-time peak estimated 1RM for an exercise across historical workouts.
 *
 * Retains source set load, reps, calendar date, and timestamp for provenance inspection.
 *
 * @param {Object} S - Application state atom containing `workouts`.
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
 * include the active workout).
 *
 * @param {Object} S - Application state atom.
 * @param {string} exId - Target exercise identifier.
 * @param {Object} entry - Active workout entry being completed.
 * @param {string} [formula='epley'] - Formula name.
 * @returns {{ est: number, w: number, r: number, prev: number }|null} Record details if broken, or null otherwise.
 */
export function is1RMRecord(S, exId, entry, formula = DEFAULT_FORMULA) {
  const now = bestSetOf(entry, formula)
  if (!now) return null
  const prev = best1RM(S, exId, formula)
  return !prev || now.est > prev.est ? { ...now, prev: prev ? prev.est : 0 } : null
}
