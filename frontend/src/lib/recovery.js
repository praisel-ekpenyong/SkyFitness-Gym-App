import { exerciseFor } from './exercises.js'
import { MUSCLES, muscleWeightsOf, lastTrainedByMuscle } from './muscles.js'
import { isWorkSet, isPerformed } from './workout-sets.js'
import { workoutTimestamp } from './dates.js'
import { normalizeWeight } from './units.js'

export const FATIGUE_REF_VOLUME = 2000
export const FATIGUE_MIN_REF_FLOOR = FATIGUE_REF_VOLUME * 0.25
export const FATIGUE_MIN_SESSIONS = 3
export const FATIGUE_SCAN_MS = 30 * 24 * 60 * 60 * 1000
export const BODYWEIGHT_REF_LOAD = 75
export const CARDIO_TONNAGE_PER_MIN = 50

const ZERO_LOAD_SET_STIMULUS = FATIGUE_REF_VOLUME / 3

export const FATIGUE_HALF_LIFE_MS = 129600000

export const STRENGTH_FULL_MS = 1209600000

export const STRENGTH_HALF_LIFE_MS = 2419200000

export const STRENGTH_FLOOR = 0.5

export const FATIGUE_THRESHOLD_READY = 0.25

export const FATIGUE_THRESHOLD_FATIGUED = 0.5

export const FATIGUE_STATES = Object.freeze({
  READY: 'ready',
  RECOVERING: 'recovering',
  FATIGUED: 'fatigued',
})

/**
 * Return exponential decay expressed as a fraction of one half-life.
 *
 * @param {number} ageMs Elapsed age of the stimulus in milliseconds.
 * @param {number} halfLifeMs Duration of one half-life in milliseconds.
 * @returns {number} Remaining fraction, using the exact `0.5 ** (age / halfLife)` formula.
 */
export function halfLifeDecay(ageMs, halfLifeMs) {
  return 0.5 ** (ageMs / halfLifeMs)
}


function emptyMuscleMap(value) {
  return Object.fromEntries(MUSCLES.map(slug => [slug, value]))
}

const REP_CAP = 12
const epley1RM = (load, reps) => (reps === 1 ? load : load * (1 + Math.min(reps || 1, REP_CAP) / 30))

function numeric(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function unitOf(...records) {
  for (const record of records) {
    if (!record || typeof record !== 'object') continue
    for (const key of ['unit', 'u', 'weightUnit', 'weight_unit', 'loadUnit']) {
      if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') return record[key]
    }
  }
  return 'kg'
}

function kgOf(value, unit) {
  const n = numeric(value)
  if (n === null) return 0
  return normalizeWeight(Math.max(0, n), unit, 'kg')
}

function bodyweightKgFor(workout, opts = {}, stampedLoadUnit) {
  const stamped = numeric(workout?.bw) ?? numeric(workout?.bodyweight)
  if (stamped !== null) {
    return kgOf(stamped, unitOf(
      { unit: workout?.bwUnit },
      { unit: workout?.bodyweightUnit },
      workout,
      stampedLoadUnit && { unit: stampedLoadUnit },
      opts,
    ))
  }
  const canonical = numeric(opts.bodyweightKg)
  if (canonical !== null) return Math.max(0, canonical)
  const display = numeric(opts.bodyweight)
  if (display !== null) return kgOf(display, opts.bodyweightUnit || opts.unit || opts.profileUnit)
  return BODYWEIGHT_REF_LOAD
}

function bodyweightTarget(entry) {
  const target = entry?.target
  if (target && Object.prototype.hasOwnProperty.call(target, 'bodyweight')) return !!target.bodyweight
  if (entry && Object.prototype.hasOwnProperty.call(entry, 'bodyweight')) return !!entry.bodyweight
  return null
}

function hasUnitStamp(...records) {
  return records.some(record => record && typeof record === 'object'
    && ['unit', 'u', 'weightUnit', 'weight_unit', 'loadUnit'].some(key => Object.prototype.hasOwnProperty.call(record, key)
      && record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== ''))
}

function bodyweightConfigured(ex, entry, set, workout, opts = {}) {
  const configured = bodyweightTarget(entry)
  if (configured !== null) return configured
  const added = kgOf(set?.w, unitOf(set, entry?.target, entry, workout, opts))
  const hasBodyweightContext = numeric(workout?.bw) !== null
    || numeric(workout?.bodyweight) !== null
    || numeric(opts.bodyweightKg) !== null
    || numeric(opts.bodyweight) !== null
    || hasUnitStamp(set, entry?.target, entry, workout)
  return ex?.eq === 'body weight' && (added === 0 || hasBodyweightContext)
}

function loadKgFor(ex, entry, set, workout, opts = {}) {
  const setUnit = unitOf(set, entry?.target, entry, workout, opts)
  const addedKg = kgOf(set?.w, setUnit)
  const loadUnit = hasUnitStamp(set, entry?.target, entry) ? setUnit : undefined
  return bodyweightConfigured(ex, entry, set, workout, opts)
    ? bodyweightKgFor(workout, opts, loadUnit) + addedKg
    : addedKg
}

function session1RMs(workout, opts = {}) {
  const best = new Map()
  for (const entry of workout?.entries || []) {
    const ex = exerciseFor(entry)
    for (const set of entry.sets || []) {
      const load = loadKgFor(ex, entry, set, workout, opts)
      if (!isPerformed(set) || !isWorkSet(set) || !(load > 0) || !(set.r > 0)) continue
      const est = epley1RM(load, set.r)
      if (!best.has(entry.id) || est > best.get(entry.id)) best.set(entry.id, est)
    }
  }
  return best
}

function setTonnage(ex, entry, set, workout, oneRm, opts = {}) {
  if (ex?.bp === 'cardio') {
    return Math.max(set?.min || 0, (set?.sec || 0) / 60) * CARDIO_TONNAGE_PER_MIN
  }
  if (set?.sec != null && set?.r == null) {
    return (set.sec / 60) * CARDIO_TONNAGE_PER_MIN
  }
  const reps = set?.r || 1
  const load = loadKgFor(ex, entry, set, workout, opts)
  const raw = load * reps
  if (bodyweightConfigured(ex, entry, set, workout, opts)) return raw
  if (!(oneRm > 0) || !(load > 0)) return raw
  return raw * Math.min(1, load / oneRm) ** 1.5
}

function sessionTonnages(workout, opts = {}) {
  const sums = emptyMuscleMap(0)
  const oneRms = session1RMs(workout, opts)
  for (const entry of workout?.entries || []) {
    const ex = exerciseFor(entry)
    const weights = muscleWeightsOf(entry)
    for (const set of entry.sets || []) {
      if (!isPerformed(set) || !isWorkSet(set)) continue
      const measured = setTonnage(ex, entry, set, workout, oneRms.get(entry.id), opts)
      const tonnage = Number.isFinite(measured) && measured > 0 ? measured : ZERO_LOAD_SET_STIMULUS
      for (const [slug, weight] of Object.entries(weights)) {
        sums[slug] += tonnage * weight
      }
    }
  }
  return sums
}

function fatigueStimuli(workouts, current, opts = {}) {
  const cutoff = current - FATIGUE_SCAN_MS
  const ordered = (workouts || [])
    .map((workout, index) => ({ workout, index, timestamp: workoutTimestamp(workout) }))
    .filter(item => Number.isFinite(item.timestamp) && item.timestamp > cutoff)
    .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index)
  const references = emptyMuscleMap(FATIGUE_REF_VOLUME)
  const byMuscle = Object.fromEntries(MUSCLES.map(slug => [slug, []]))

  for (const { workout, timestamp } of ordered) {
    const sums = sessionTonnages(workout, opts)
    for (const slug of MUSCLES) {
      const stimulus = sums[slug]
      if (!(stimulus > 0)) continue
      byMuscle[slug].push({ slug, timestamp, stimulus: stimulus / references[slug] })
      const ewma = references[slug] + (stimulus - references[slug]) / FATIGUE_MIN_SESSIONS
      references[slug] = Math.max(FATIGUE_MIN_REF_FLOOR, Math.min(references[slug], ewma))
    }
  }
  return byMuscle
}

function fatigueValue(events, now) {
  if (!events.length) return 0
  events.sort((a, b) => a.timestamp - b.timestamp)

  let value = 0
  let lastTimestamp = events[0].timestamp
  for (const event of events) {
    const elapsed = Math.max(0, Math.min(event.timestamp, now) - Math.min(lastTimestamp, now))
    value *= halfLifeDecay(elapsed, FATIGUE_HALF_LIFE_MS)
    value += event.stimulus
    lastTimestamp = event.timestamp
  }
  value *= halfLifeDecay(Math.max(0, now - lastTimestamp), FATIGUE_HALF_LIFE_MS)
  return 1 - Math.exp(-value)
}

export function fatigueOf(workouts, now, opts = {}) {
  const current = Number(now)
  const result = emptyMuscleMap(0)
  if (!Number.isFinite(current)) return result
  const byMuscle = fatigueStimuli(workouts, current, opts)
  for (const slug of MUSCLES) result[slug] = fatigueValue(byMuscle[slug], current)
  return result
}

export function strengthOf(workouts, now, opts = {}) {
  const current = Number(now)
  const latest = lastTrainedByMuscle(workouts)

  const result = emptyMuscleMap(STRENGTH_FLOOR)
  if (!Number.isFinite(current)) return result
  for (const slug of MUSCLES) {
    const lastTimestamp = latest[slug]
    if (!Number.isFinite(lastTimestamp)) continue
    const age = current - lastTimestamp
    if (age <= STRENGTH_FULL_MS) {
      result[slug] = 1
    } else {
      result[slug] = Math.max(
        STRENGTH_FLOOR,
        halfLifeDecay(age - STRENGTH_FULL_MS, STRENGTH_HALF_LIFE_MS),
      )
    }
  }
  return result
}

export function fatiguedMuscles(workouts, now, opts = {}) {
  return Object.entries(fatigueOf(workouts, now, opts))
    .filter(([, value]) => value > FATIGUE_THRESHOLD_FATIGUED)
    .map(([slug]) => slug)
}

export function detrainedMuscles(workouts, now, opts = {}) {
  return Object.entries(strengthOf(workouts, now, opts))
    .filter(([, value]) => value < 1)
    .map(([slug]) => slug)
}

export function fatigueStateOf(value) {
  if (value == null || !Number.isFinite(value) || value < FATIGUE_THRESHOLD_READY) {
    return FATIGUE_STATES.READY
  }
  return value <= FATIGUE_THRESHOLD_FATIGUED
    ? FATIGUE_STATES.RECOVERING
    : FATIGUE_STATES.FATIGUED
}
