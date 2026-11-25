
import { e1rmByWorkout, latestWorkSetAt } from './training-log.js'
import { workoutTimestamp, DAY_MS } from './dates.js'
import { weighIns as weighInsInUnit, sessionBodyweight } from './bodyweight.js'
import { cleanSex } from './sex.js'
import { ageCoefficientOf } from './birth-year.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Workout} Workout */
/** @typedef {import('./types.js').WeighIn} WeighIn */
/** @typedef {import('./types.js').Unit} Unit */
/** @typedef {{ key: string, name: string, ids: string[], male: number[], female: number[] }} StrengthStandard */
/** @typedef {{ level: string | null, ratio: number }} LevelReading */
/** @typedef {{ key: string, name: string, everTrained: boolean, trainedLately: boolean, current: LevelReading | null, peak: LevelReading | null, next: { level: string, weight: number } | null }} LiftReading */

const CURRENT_WEEKS = 12
const WEIGH_IN_DAYS = 30

/** Level names, lowest first. Thresholds in a standard line up with these, Beginner first. */
export const LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite']

/** The reasons a reading shows no levels. Shared by the lib and the Stats views. */
export const STRENGTH_REASON = Object.freeze({ sex: 'sex', weighIn: 'weighIn' })

/**
 * How many of the five steps a level fills, Beginner 1 through Elite 5; 0 for no level.
 * @param {string | null | undefined} level
 * @returns {number}
 */
export const levelStepOf = level => (level ? LEVELS.indexOf(level) + 1 : 0)

/** Smallest loadable total step per unit: the smallest plate pair (1.25 kg, 2.5 lb per side). */
const LOAD_STEP = { kg: 2.5, lb: 5 }

/**
 * Strength Level's approximate body-weight multiples, [Beginner, Novice, Intermediate, Advanced, Elite].
 * Credited to Strength Level (strengthlevel.com) in the card footer. Data only.
 * @type {StrengthStandard[]}
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

/** @param {unknown} value @returns {number | null} */
const positiveOf = value => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** @param {number} value @returns {number} */
const round2 = value => Math.round(value * 100) / 100

/** @param {Profile | null | undefined} S @returns {Unit} */
const profileUnit = S => S?.unit || 'kg'

/**
 * Body-weight log entries with a usable weight, oldest first, in the Profile unit.
 * @param {Profile | null | undefined} S
 * @returns {WeighIn[]}
 */
function weighInsOf(S) {
  return weighInsInUnit(S)
    .filter(b => b && positiveOf(b.w) !== null && Number.isFinite(workoutTimestamp(b)))
    .slice()
    .sort((a, b) => workoutTimestamp(a) - workoutTimestamp(b))
}

/**
 * The most recent Weigh-in in the Profile unit, from the Body-weight log or a workout's own,
 * or null when there is none.
 * @param {Profile | null | undefined} S
 * @param {WeighIn[]} logged
 * @returns {number | null}
 */
function latestWeighInOf(S, logged) {
  /** @type {{ ts: number, w: number } | null} */
  let latest = null
  for (const b of logged) {
    const ts = workoutTimestamp(b)
    if (latest === null || ts > latest.ts) latest = { ts, w: Number(b.w) }
  }
  for (const workout of S?.workouts || []) {
    const own = sessionBodyweight(S, workout)
    const ts = workoutTimestamp(workout)
    if (own !== null && Number.isFinite(ts) && (latest === null || ts > latest.ts)) latest = { ts, w: own }
  }
  return latest ? latest.w : null
}

/**
 * The body weight a workout was lifted at, in the Profile unit, or null when none is within reach.
 * @param {Profile | null | undefined} S
 * @param {Workout} workout
 * @param {WeighIn[]} logged
 * @returns {number | null}
 */
function bodyweightThen(S, workout, logged) {
  const own = sessionBodyweight(S, workout)
  if (own !== null) return own
  const ts = workoutTimestamp(workout)
  if (!Number.isFinite(ts)) return null
  /** @type {WeighIn | null} */
  let best = null
  let bestGap = Infinity
  for (const b of logged) {
    const gap = Math.abs(workoutTimestamp(b) - ts)
    if (gap <= WEIGH_IN_DAYS * DAY_MS && gap < bestGap) { best = b; bestGap = gap }
  }
  return best ? Number(best.w) : null
}

/**
 * Index of the highest threshold the ratio reaches, or -1 when it is below Beginner.
 * @param {number} ratio
 * @param {number[]} thresholds
 * @returns {number}
 */
const levelIndexOf = (ratio, thresholds) => thresholds.reduce((n, t) => (ratio >= t ? n + 1 : n), 0) - 1

/**
 * Round a weight up to the next loadable step in the Profile unit.
 * @param {number} weight
 * @param {Unit} unit
 * @returns {number}
 */
function roundUpToStep(weight, unit) {
  const step = LOAD_STEP[unit] || LOAD_STEP.kg
  const steps = Math.ceil(Number((weight / step).toFixed(6)))
  return Math.round(steps * step * 10) / 10
}

/**
 * Every workout with an Estimated 1RM of this lift in the Training log and a body weight then:
 * its greatest estimate divided by that body weight, and whether it falls in the current window.
 * @param {Profile | null | undefined} S
 * @param {StrengthStandard} lift
 * @param {WeighIn[]} weighIns
 * @param {number} windowStart
 * @returns {Array<{ recent: boolean, ratio: number }>}
 */
function liftRatiosOf(S, lift, weighIns, windowStart) {
  /** @type {Map<Workout, { workout: Workout, t: number, y: number }>} */
  const byWorkout = new Map()
  for (const id of lift.ids) {
    for (const point of e1rmByWorkout(S, id)) {
      const held = byWorkout.get(point.workout)
      if (!held || point.y > held.y) byWorkout.set(point.workout, point)
    }
  }
  const ratios = []
  for (const { workout, t, y } of byWorkout.values()) {
    if (!Number.isFinite(t)) continue
    const bw = bodyweightThen(S, workout, weighIns)
    if (bw != null) ratios.push({ recent: t > windowStart, ratio: y / bw })
  }
  return ratios
}

/**
 * When the lift was last trained: its latest performed Work set time in the Training log, or null.
 * @param {Profile | null | undefined} S
 * @param {StrengthStandard} lift
 * @returns {number | null}
 */
function lastTrainedAt(S, lift) {
  /** @type {number | null} */
  let last = null
  for (const id of lift.ids) {
    const at = latestWorkSetAt(S, id)
    if (at != null && (last === null || at > last)) last = at
  }
  return last
}

/**
 * The highest value in a list, or null when the list is empty.
 * @param {number[]} ratios
 * @returns {number | null}
 */
const maxRatio = ratios => ratios.reduce((/** @type {number | null} */ m, r) => (m === null || r > m ? r : m), null)

/**
 * One lift's reading. Levels are null when the Profile cannot grade (no sex, no body weight).
 * everTrained is true when any workout trained the lift, even one with no body weight to grade it.
 * @param {Profile | null | undefined} S
 * @param {StrengthStandard} lift
 * @param {number | null} latestWeight
 * @param {WeighIn[]} weighIns
 * @param {number} now
 * @param {boolean} graded
 * @returns {LiftReading}
 */
function readLift(S, lift, latestWeight, weighIns, now, graded) {
  const windowStart = now - CURRENT_WEEKS * 7 * DAY_MS
  const lastAt = lastTrainedAt(S, lift)
  const identity = {
    key: lift.key,
    name: lift.name,
    everTrained: lastAt !== null,
    trainedLately: lastAt !== null && lastAt > windowStart,
  }
  const sex = cleanSex(S?.sex)
  if (!graded || !sex) return { ...identity, current: null, peak: null, next: null }

  const coefficient = ageCoefficientOf(S?.birthYear ?? null, now)
  const thresholds = lift[sex].map(t => t / coefficient)
  /** @param {number} ratio @returns {LevelReading} */
  const levelReadingOf = ratio => ({ level: LEVELS[levelIndexOf(ratio, thresholds)] ?? null, ratio: round2(ratio) })

  const ratios = liftRatiosOf(S, lift, weighIns, windowStart)
  const peakRatio = maxRatio(ratios.map(r => r.ratio))
  const currentRatio = maxRatio(ratios.filter(r => r.recent).map(r => r.ratio))
  const peak = peakRatio == null ? null : levelReadingOf(peakRatio)
  const current = currentRatio == null ? null : levelReadingOf(currentRatio)

  /** @type {{ level: string, weight: number } | null} */
  let next = null
  if (current && currentRatio !== null && latestWeight !== null) {
    const nextIndex = levelIndexOf(currentRatio, thresholds) + 1
    if (nextIndex < LEVELS.length) {
      next = { level: LEVELS[nextIndex], weight: roundUpToStep(thresholds[nextIndex] * latestWeight, profileUnit(S)) }
    }
  }
  return { ...identity, current, peak, next }
}

/**
 * Strength levels for every graded lift, read from the Profile and its history.
 *
 * @param {Profile | null | undefined} S - Application state.
 * @param {number} now - Injected millisecond timestamp.
 * @returns {{reason: null|'sex'|'weighIn', lifts: LiftReading[]}} reason says why no levels can show.
 */
export function strengthLevelsOf(S, now) {
  const sex = cleanSex(S?.sex)
  const weighIns = weighInsOf(S)
  const latestWeight = latestWeighInOf(S, weighIns)
  const reason = !sex ? STRENGTH_REASON.sex : latestWeight === null ? STRENGTH_REASON.weighIn : null
  const graded = reason === null
  return {
    reason,
    lifts: STRENGTH_STANDARDS.map(lift => readLift(S, lift, latestWeight, weighIns, now, graded)),
  }
}

/**
 * The strength reading for one exercise, when it is one of the graded lifts.
 *
 * @param {Profile | null | undefined} S - Application state.
 * @param {string} exId - Catalogue exercise id.
 * @param {number} now - Injected millisecond timestamp.
 * @returns {(LiftReading & { reason: null | 'sex' | 'weighIn' }) | null} The reason plus that lift's reading, or null for an ungraded exercise.
 */
export function strengthLevelOf(S, exId, now) {
  const lift = LIFT_BY_ID.get(exId)
  if (!lift) return null
  const { reason, lifts } = strengthLevelsOf(S, now)
  const found = lifts.find(l => l.key === lift.key)
  return found ? { reason, ...found } : null
}
