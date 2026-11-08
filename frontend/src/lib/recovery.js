import { exerciseFor } from './exercises.js'
import { MUSCLES, muscleWeightsOf, lastTrainedByMuscle } from './muscles.js'
import { isWorkSet, isPerformed } from './workout-model.js'
import { workoutTimestamp } from './format.js'
import { normalizeWeight } from './units.js'

// A "normal" hard session for one muscle, in primary-set equivalents. The saturation curve
// 1 - exp(-stimulus / REF) maps any session size onto [0,1) so volume raises the starting
// fatigue level without ever pinning it, and the value can then fade asymptotically.
export const FATIGUE_REF_VOLUME = 2000  // default reference: kg of intensity-weighted volume per session
export const FATIGUE_MIN_REF_FLOOR = FATIGUE_REF_VOLUME * 0.25  // 500 kg: floor to prevent denominator collapse during deloads
export const FATIGUE_MIN_SESSIONS = 3  // smoothing horizon for the causal per-muscle reference
// Computational bound for the stimulus scan, not a semantic cliff: after 30 days (20
// half-lives) a session contributes below 1e-6 to the accumulated value.
export const FATIGUE_SCAN_MS = 30 * 24 * 60 * 60 * 1000
export const BODYWEIGHT_REF_LOAD = 75  // kg assumed for bodyweight exercises when no load is logged
export const CARDIO_TONNAGE_PER_MIN = 50  // duration proxy for cardio/timed work

// Preserve the shipped set-count signal when a completed custom/imported exercise has no load.
// Two such sets therefore retain the old 1 - exp(-2 / 3) starting-fatigue reading.
const ZERO_LOAD_SET_STIMULUS = FATIGUE_REF_VOLUME / 3

/** Fatigue stimulus half-life: 36 hours, in ms. */
export const FATIGUE_HALF_LIFE_MS = 129600000

/** Retained strength holds at 1.0 for this long after a completed set: 14 days, in ms. */
export const STRENGTH_FULL_MS = 1209600000

/** Retained-strength half-life once the full-retention window ends: 28 days, in ms. */
export const STRENGTH_HALF_LIFE_MS = 2419200000

/** Minimum retained-strength value for an untrained or fully detrained muscle. */
export const STRENGTH_FLOOR = 0.5

/** Threshold separating 'ready' from 'recovering' fatigue states. */
export const FATIGUE_THRESHOLD_READY = 0.25

/** Threshold above which a muscle is considered 'fatigued'. */
export const FATIGUE_THRESHOLD_FATIGUED = 0.5

/**
 * Stable labels for consumer fatigue buckets: values below 0.25 are ready, values from 0.25
 * through 0.5 are recovering, and values above 0.5 are fatigued.
 */
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

// The v2 data contract has one timestamp per workout, not per set — canonical
// helper lives in format.js so fatigue, strength, charts and heatmaps agree.

/**
 * Build a fresh per-muscle map holding the same initial value.
 *
 * @param {*} value - Initial value assigned to every drawable muscle slug.
 * @returns {Object} New object keyed by every drawable muscle slug.
 */
function emptyMuscleMap(value) {
  return Object.fromEntries(MUSCLES.map(slug => [slug, value]))
}

// Epley one-rep-max estimate, matching onerm.js (REP_CAP included so high-rep sets do not
// inflate the estimate). Used only to express a set's intensity relative to the lifter's own
// capacity - the same formula the app already shows for estimated 1RM.
const REP_CAP = 12
/**
 * Estimate a one-rep maximum from one set via the Epley formula.
 *
 * @param {number} load - Set load in kg; caller converts units first.
 * @param {number} reps - Completed reps; missing or falsy counts as 1 and reps cap at 12.
 * @returns {number} Estimated 1RM in the same unit as load.
 */
const epley1RM = (load, reps) => (reps === 1 ? load : load * (1 + Math.min(reps || 1, REP_CAP) / 30))

/**
 * Coerce a value to a finite number for load math.
 *
 * @param {*} value - Candidate number; null, undefined, empty string, and booleans yield null.
 * @returns {number|null} Finite number, or null when not parseable.
 */
function numeric(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Find the first stamped weight unit across candidate records.
 *
 * @param {...Object} records - Records searched in order for unit, u, weightUnit, weight_unit, or loadUnit.
 * @returns {string} First non-empty unit found, else 'kg'.
 */
function unitOf(...records) {
  for (const record of records) {
    if (!record || typeof record !== 'object') continue
    for (const key of ['unit', 'u', 'weightUnit', 'weight_unit', 'loadUnit']) {
      if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') return record[key]
    }
  }
  return 'kg'
}

/**
 * Convert a logged load to kilograms, clamping negatives to zero.
 *
 * @param {*} value - Logged load; non-numeric yields 0.
 * @param {*} unit - Unit label; converted to kg via normalizeWeight (ADR 0019).
 * @returns {number} Load in kg, never negative.
 */
function kgOf(value, unit) {
  const n = numeric(value)
  if (n === null) return 0
  return normalizeWeight(Math.max(0, n), unit, 'kg')
}

// A bodyweight value stamped on a workout is the best historical value. When old records do not
// carry one, use the current profile's canonical bodyweight supplied by Stats, then the stable
// fallback used by the original fatigue model. `bodyweightKg` is already canonical; `bodyweight`
// is accepted for callers that provide a display-unit value explicitly.
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

/**
 * Read whether an entry targets bodyweight work.
 *
 * @param {Object} entry - Workout entry possibly carrying target.bodyweight or bodyweight.
 * @returns {boolean|null} True/false when explicitly configured, else null.
 */
function bodyweightTarget(entry) {
  const target = entry?.target
  if (target && Object.prototype.hasOwnProperty.call(target, 'bodyweight')) return !!target.bodyweight
  if (entry && Object.prototype.hasOwnProperty.call(entry, 'bodyweight')) return !!entry.bodyweight
  return null
}

/**
 * Report whether any candidate record carries an explicit unit stamp.
 *
 * @param {...Object} records - Records checked for a non-empty unit key.
 * @returns {boolean} True when at least one record stamps a unit.
 */
function hasUnitStamp(...records) {
  return records.some(record => record && typeof record === 'object'
    && ['unit', 'u', 'weightUnit', 'weight_unit', 'loadUnit'].some(key => Object.prototype.hasOwnProperty.call(record, key)
      && record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== ''))
}

/**
 * Decide whether a set counts body mass in addition to any added load.
 *
 * @param {Object} ex - Catalogue exercise for the entry, if known.
 * @param {Object} entry - Workout entry possibly configuring bodyweight.
 * @param {Object} set - Set row with the logged added load.
 * @param {Object} workout - Parent workout possibly stamping body mass.
 * @param {Object} opts - Profile bodyweight context in display or canonical form.
 * @returns {boolean} True when body mass applies to this set.
 */
function bodyweightConfigured(ex, entry, set, workout, opts = {}) {
  const configured = bodyweightTarget(entry)
  if (configured !== null) return configured
  // Before target.bodyweight was persisted, a positive `w` on a catalogue bodyweight exercise
  // already meant an explicitly entered load. Keep those rows compatible when no body-mass
  // context is available; a stamped workout or a profile bodyweight makes the intended total-load
  // semantics unambiguous even for old entries.
  const added = kgOf(set?.w, unitOf(set, entry?.target, entry, workout, opts))
  const hasBodyweightContext = numeric(workout?.bw) !== null
    || numeric(workout?.bodyweight) !== null
    || numeric(opts.bodyweightKg) !== null
    || numeric(opts.bodyweight) !== null
    || hasUnitStamp(set, entry?.target, entry, workout)
  return ex?.eq === 'body weight' && (added === 0 || hasBodyweightContext)
}

/**
 * Resolve the total load of one set in kilograms, including body mass when configured.
 *
 * @param {Object} ex - Catalogue exercise for the entry, if known.
 * @param {Object} entry - Workout entry holding target and unit context.
 * @param {Object} set - Set row with the logged added load.
 * @param {Object} workout - Parent workout possibly stamping body mass.
 * @param {Object} opts - Profile bodyweight context in display or canonical form.
 * @returns {number} Total load in kg: body mass plus added load, or added load alone.
 */
function loadKgFor(ex, entry, set, workout, opts = {}) {
  const setUnit = unitOf(set, entry?.target, entry, workout, opts)
  const addedKg = kgOf(set?.w, setUnit)
  const loadUnit = hasUnitStamp(set, entry?.target, entry) ? setUnit : undefined
  return bodyweightConfigured(ex, entry, set, workout, opts)
    ? bodyweightKgFor(workout, opts, loadUnit) + addedKg
    : addedKg
}

// Best Epley estimate inside one session. Keeping intensity context on the session makes a
// scored stimulus independent of later imports/deletes; unlike an all-history maximum, a
// 90-day-old CSV row cannot retroactively reweight today's sets.
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

// Intensity-weighted tonnage for one completed set: load x reps x (load / exercise 1RM)^1.5.
// The exponent saturates the "hard set" effect - a set at 90% of your 1RM counts ~0.81 of its
// raw tonnage, one at 50% only ~0.35. Cardio, timed holds, and sets whose exercise has no
// 1RM history stay unweighted (duration proxies, or intensity 1 for the first sessions).
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
  // A bodyweight target is already an external-load-normalised total (body mass + any added
  // load). It has no meaningful barbell-style 1RM intensity ratio in the legacy data model, so
  // retain the monotonic total-load stimulus instead of letting a newly created low 1RM shrink
  // a weighted bodyweight set below the unloaded version.
  if (bodyweightConfigured(ex, entry, set, workout, opts)) return raw
  if (!(oneRm > 0) || !(load > 0)) return raw
  return raw * Math.min(1, load / oneRm) ** 1.5
}

// One session's per-muscle stimulus, calculated only from that session. A completed zero-load
// set gets the set-equivalent fallback instead of disappearing from fatigue.
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

// Build normalised stimuli in workout order. The reference seen by a session is strictly the
// reference left by earlier in-window sessions; the session cannot dilute its own score. The
// downward-only EWMA is deliberate: removing any earlier workout can only raise a later
// denominator (and removes its own positive stimulus), so deletion can never increase fatigue.
// Rebuilding from the bounded scan also makes imports older than the scan exactly irrelevant.
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

/**
 * Accumulate decayed stimulus events into a saturating fatigue level.
 *
 * Sorts the event list in place as a side effect.
 *
 * @param {Array<Object>} events - Per-muscle stimuli with timestamp and normalized stimulus; empty yields 0.
 * @param {number} now - Current time in ms; future-dated gaps clamp to zero age.
 * @returns {number} Fatigue in [0,1): 0 when no events, approaching 1 without pinning.
 */
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
  // Normalise the accumulated stimulus to a saturating fatigue level: more volume starts
  // higher but never pins, and the value fades asymptotically - no window-edge cliff.
  return 1 - Math.exp(-value)
}

/**
 * Calculate current per-muscle fatigue from completed sets in the recent window.
 *
 * Stimulus time is `workout.start`, falling back to the workout date `workout.d`. Each performed
 * set contributes the exercise's `muscleWeightsOf` weights; the scan is bounded to FATIGUE_SCAN_MS for
 * performance, not semantics. Stimuli are accumulated chronologically with a 36-hour half-life,
 * decayed to `now`, and normalised with the saturation curve 1 - exp(-v). Each session is scored
 * against a causal, downward-only EWMA left by strictly earlier in-window sessions. Session-local
 * intensity estimates and the causal reference make out-of-window imports irrelevant, while
 * deleting a workout can only remove stimulus and/or raise later references.
 * The result always contains every drawable muscle slug.
 *
 * @param {Array<object>} workouts Workout history with `start`/`d` and entry set arrays.
 * @param {number} now Current time in milliseconds; injected to keep this function deterministic.
 * @param {{unit?: string}} options Reserved profile-level options; unit is supplied at the UI boundary.
 * @returns {Record<string, number>} Fatigue values keyed by every drawable muscle slug.
 */
export function fatigueOf(workouts, now, opts = {}) {
  const current = Number(now)
  const result = emptyMuscleMap(0)
  if (!Number.isFinite(current)) return result
  const byMuscle = fatigueStimuli(workouts, current, opts)
  for (const slug of MUSCLES) result[slug] = fatigueValue(byMuscle[slug], current)
  return result
}

/**
 * Calculate retained per-muscle strength from the latest completed stimulus in all history.
 *
 * A muscle with no completed set starts at the 0.5 floor. After a completed set, strength is
 * 1.0 through 14 days old, then decays toward the floor with a 28-day half-life. Any later
 * completed set becomes the new latest stimulus and resets the 14-day full-retention period.
 * The result always contains every drawable muscle slug.
 *
 * @param {Array<object>} workouts Workout history with `start`/`d` and entry set arrays.
 * @param {number} now Current time in milliseconds; injected to keep this function deterministic.
 * @returns {Record<string, number>} Retained-strength values keyed by every drawable muscle slug.
 */
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

/**
 * List muscles currently above the fatigued threshold.
 *
 * @param {Array<object>} workouts Workout history passed to {@link fatigueOf}.
 * @param {number} now Current time in milliseconds passed to {@link fatigueOf}.
 * @returns {string[]} Muscle slugs whose fatigue value is greater than 0.5, in `MUSCLES`
 * head-to-toe order.
 * @example
 * const avoid = fatiguedMuscles(workouts, now)
 */
export function fatiguedMuscles(workouts, now, opts = {}) {
  return Object.entries(fatigueOf(workouts, now, opts))
    .filter(([, value]) => value > FATIGUE_THRESHOLD_FATIGUED)
    .map(([slug]) => slug)
}

/**
 * List muscles whose retained strength is below full retention.
 *
 * @param {Array<object>} workouts Workout history passed to {@link strengthOf}.
 * @param {number} now Current time in milliseconds passed to {@link strengthOf}.
 * @returns {string[]} Muscle slugs whose retained strength is less than 1.0, in `MUSCLES`
 * head-to-toe order; never-trained muscles are included at the 0.5 floor.
 * @example
 * const targets = detrainedMuscles(workouts, now)
 */
export function detrainedMuscles(workouts, now, opts = {}) {
  return Object.entries(strengthOf(workouts, now, opts))
    .filter(([, value]) => value < 1)
    .map(([slug]) => slug)
}

/**
 * Select the consumer-facing fatigue state for one numeric recovery value.
 * Values below .25 are ready, .25 through .5 are recovering, and values above .5 are fatigued.
 * Keeping this boundary selector in production code prevents views and tests from drifting apart.
 *
 * @param {number} value Numeric fatigue value from fatigueOf().
 * @returns {'ready'|'recovering'|'fatigued'} The stable state label for the UI.
 */
export function fatigueStateOf(value) {
  if (value == null || !Number.isFinite(value) || value < FATIGUE_THRESHOLD_READY) {
    return FATIGUE_STATES.READY
  }
  return value <= FATIGUE_THRESHOLD_FATIGUED
    ? FATIGUE_STATES.RECOVERING
    : FATIGUE_STATES.FATIGUED
}
