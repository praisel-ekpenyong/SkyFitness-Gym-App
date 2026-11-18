// Strength levels: one main barbell lift graded from Beginner to Elite by its Estimated 1RM
// divided by body weight, against a Strength standard (body-weight multiples, approximate).
//
// Each workout's lift is divided by the body weight then: the workout's own Weigh-in, else the
// nearest Body-weight log entry within 30 days, else the workout is skipped. The current level
// reads the last 12 weeks; the peak reads every workout. Next level is the next threshold times
// the latest weigh-in, rounded up to a loadable step, in the Profile's unit.

import { estimate1RM, DEFAULT_FORMULA } from './onerm.js'
import { isPerformed, isWorkSet } from './workout-model.js'
import { workoutTimestamp } from './format.js'
import { normalizeWeight } from './units.js'
import { cleanSex } from './sex.js'
import { ageCoefficientOf } from './birth-year.js'

const DAY_MS = 24 * 60 * 60 * 1000
const CURRENT_WEEKS = 12
const WEIGH_IN_DAYS = 30

/** Level names, lowest first. Thresholds in a standard line up with these, Beginner first. */
export const LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite']

/** Smallest loadable total step per unit: the smallest plate pair (1.25 kg, 2.5 lb per side). */
const LOAD_STEP = { kg: 2.5, lb: 5 }

/**
 * Strength Level's approximate body-weight multiples, [Beginner, Novice, Intermediate, Advanced, Elite].
 * Credited to Strength Level (strengthlevel.com) in the card footer. Data only.
 */
export const STRENGTH_STANDARDS = [
  { key: 'squat', name: 'Squat', ids: ['0043', '1461', '1462', '1436'], male: [0.75, 1.25, 1.5, 2.25, 2.75], female: [0.5, 0.75, 1.25, 1.5, 2] },
  { key: 'bench', name: 'Bench press', ids: ['0025'], male: [0.5, 0.75, 1, 1.5, 2], female: [0.25, 0.5, 0.75, 1, 1.5] },
  { key: 'deadlift', name: 'Deadlift', ids: ['0032'], male: [1, 1.5, 2, 2.5, 3], female: [0.5, 1, 1.25, 1.75, 2.5] },
  { key: 'press', name: 'Standing press', ids: ['1456', '1457'], male: [0.35, 0.55, 0.8, 1.05, 1.35], female: [0.2, 0.35, 0.5, 0.75, 1] },
  { key: 'row', name: 'Barbell row', ids: ['0027'], male: [0.5, 0.75, 1, 1.5, 1.75], female: [0.25, 0.4, 0.65, 0.9, 1.2] },
  { key: 'frontSquat', name: 'Front squat', ids: ['0042'], male: [0.55, 0.8, 1.2, 1.6, 2], female: [0.35, 0.55, 0.85, 1.15, 1.5] },
  { key: 'inclineBench', name: 'Incline bench', ids: ['0047'], male: [0.4, 0.65, 0.85, 1.2, 1.5], female: [0.2, 0.4, 0.6, 0.85, 1.1] },
  { key: 'romanianDeadlift', name: 'Romanian deadlift', ids: ['0085'], male: [0.6, 1, 1.4, 1.9, 2.4], female: [0.4, 0.65, 1, 1.4, 1.8] },
  { key: 'curl', name: 'Barbell curl', ids: ['0031'], male: [0.2, 0.4, 0.6, 0.85, 1.15], female: [0.1, 0.2, 0.4, 0.6, 0.85] },
]

const LIFT_BY_ID = new Map(STRENGTH_STANDARDS.flatMap(lift => lift.ids.map(id => [id, lift])))

const positiveOf = value => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

const round2 = value => Math.round(value * 100) / 100

const profileUnit = S => S?.unit || 'kg'

/** Body-weight log entries with a usable weight, oldest first. Stored in the Profile unit. */
function weighInsOf(S) {
  return (Array.isArray(S?.bodyweight) ? S.bodyweight : [])
    .filter(b => b && positiveOf(b.w) !== null && Number.isFinite(workoutTimestamp(b)))
    .slice()
    .sort((a, b) => workoutTimestamp(a) - workoutTimestamp(b))
}

/** The body weight a workout was lifted at, in the Profile unit, or null when none is within reach. */
function bodyweightThen(S, workout, weighIns) {
  const own = positiveOf(workout?.bw)
  if (own !== null) return normalizeWeight(own, workout.bwUnit || profileUnit(S), profileUnit(S))
  const ts = workoutTimestamp(workout)
  if (!Number.isFinite(ts)) return null
  let best = null
  let bestGap = Infinity
  for (const b of weighIns) {
    const gap = Math.abs(workoutTimestamp(b) - ts)
    if (gap <= WEIGH_IN_DAYS * DAY_MS && gap < bestGap) { best = b; bestGap = gap }
  }
  return best ? Number(best.w) : null
}

/** The best Estimated 1RM a workout set for this lift, in the Profile unit (refused above 12 reps). */
function bestEstimateOf(S, workout, lift) {
  let best = null
  for (const entry of workout?.entries || []) {
    if (!entry || typeof entry !== 'object' || !lift.ids.includes(entry.id)) continue
    for (const set of entry.sets || []) {
      if (!set || typeof set !== 'object' || !isPerformed(set) || !isWorkSet(set)) continue
      const setUnit = set.unit ?? entry.unit ?? workout.unit ?? profileUnit(S)
      const est = estimate1RM(set.w, set.r, DEFAULT_FORMULA, setUnit, profileUnit(S))
      if (est != null && (best === null || est > best)) best = est
    }
  }
  return best
}

/** Index of the highest threshold the ratio reaches, or -1 when it is below Beginner. */
const levelIndexOf = (ratio, thresholds) => thresholds.reduce((n, t) => (ratio >= t ? n + 1 : n), 0) - 1

/** Round a weight up to the next loadable step in the Profile unit. */
function roundUpToStep(weight, unit) {
  const step = LOAD_STEP[unit] || LOAD_STEP.kg
  const steps = Math.ceil(Number((weight / step).toFixed(6)))
  return Math.round(steps * step * 10) / 10
}

/** Every workout that trained this lift, with its best estimate and body weight then. */
function liftSessionsOf(S, lift, weighIns, now) {
  const windowStart = now - CURRENT_WEEKS * 7 * DAY_MS
  const sessions = []
  for (const workout of S?.workouts || []) {
    const ts = workoutTimestamp(workout)
    if (!Number.isFinite(ts)) continue
    const trained = (workout?.entries || []).some(entry =>
      entry && typeof entry === 'object' && lift.ids.includes(entry.id)
      && (entry.sets || []).some(set => set && typeof set === 'object' && isPerformed(set) && isWorkSet(set)))
    if (!trained) continue
    const est = bestEstimateOf(S, workout, lift)
    const bw = est != null ? bodyweightThen(S, workout, weighIns) : null
    const ratio = est != null && bw != null ? est / bw : null
    sessions.push({ ts, recent: ts > windowStart, ratio })
  }
  return sessions
}

/** One lift's reading. Levels are null when the Profile cannot grade (no sex, no body weight). */
function readLift(S, lift, weighIns, now, graded) {
  const sessions = liftSessionsOf(S, lift, weighIns, now)
  const trainedLately = sessions.some(s => s.recent)
  const base = { key: lift.key, name: lift.name, trainedLately, current: null, peak: null, next: null }
  if (!graded) return base

  const coefficient = ageCoefficientOf(S.birthYear, now)
  const thresholds = lift[cleanSex(S.sex)].map(t => t / coefficient)
  const latestW = weighIns.length ? Number(weighIns[weighIns.length - 1].w) : null
  const ratioLevel = ratio => ({ level: LEVELS[levelIndexOf(ratio, thresholds)] ?? null, ratio: round2(ratio) })
  const best = list => list.reduce((m, r) => (m === null || r > m ? r : m), null)

  const peakRatio = best(sessions.map(s => s.ratio).filter(r => r != null))
  const currentRatio = best(sessions.filter(s => s.recent).map(s => s.ratio).filter(r => r != null))
  const peak = peakRatio == null ? null : ratioLevel(peakRatio)
  const current = currentRatio == null ? null : ratioLevel(currentRatio)

  let next = null
  if (current && latestW !== null) {
    const nextIndex = levelIndexOf(currentRatio, thresholds) + 1
    if (nextIndex < LEVELS.length) {
      next = { level: LEVELS[nextIndex], weight: roundUpToStep(thresholds[nextIndex] * latestW, profileUnit(S)) }
    }
  }
  return { ...base, current, peak, next }
}

/**
 * Strength levels for every graded lift, read from the Profile and its history.
 *
 * @param {Object} S - Application state.
 * @param {number} now - Injected millisecond timestamp.
 * @returns {{reason: null|'sex'|'weighIn', lifts: Array}} reason says why no levels can show.
 */
export function strengthLevelsOf(S, now) {
  const sex = cleanSex(S?.sex)
  const weighIns = weighInsOf(S)
  const anyBodyweight = weighIns.length > 0 || (S?.workouts || []).some(w => positiveOf(w?.bw) !== null)
  const reason = !sex ? 'sex' : !anyBodyweight ? 'weighIn' : null
  const graded = reason === null
  return {
    reason,
    lifts: STRENGTH_STANDARDS.map(lift => readLift(S, lift, weighIns, now, graded)),
  }
}

/**
 * The strength reading for one exercise, when it is one of the graded lifts.
 *
 * @param {Object} S - Application state.
 * @param {string} exId - Catalogue exercise id.
 * @param {number} now - Injected millisecond timestamp.
 * @returns {Object|null} The reason plus that lift's reading, or null for an ungraded exercise.
 */
export function strengthLevelOf(S, exId, now) {
  const lift = LIFT_BY_ID.get(exId)
  if (!lift) return null
  const { reason, lifts } = strengthLevelsOf(S, now)
  return { reason, ...lifts.find(l => l.key === lift.key) }
}
