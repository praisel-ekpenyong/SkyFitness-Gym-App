
import { isCardio, isBodyweightEq } from './exercises.js'
import { isWarmupRow, ensurePlainObject } from './warmup.js'
import { best, lastSession, lastSessionInRoutine } from './training-log.js'
import {
  MODES,
  PHASES,
  normalizeMode,
  modeForSet,
  modeForEntry,
  isWorkSet,
  isPerformed,
  workSets,
  doneWorkSets,
  metricRowsForEntry,
  metricModeForEntry,
} from './workout-sets.js'

export { phaseForSet, isWarmupRow, ensurePlainObject } from './warmup.js'

/**
 * Resolve the logging mode for an exercise config.
 *
 * @param {Object|null|undefined} cfg - Exercise config with optional mode and id; nullish reads as reps unless catalogued otherwise.
 * @returns {string} Explicit mode when valid, else 'cardio' for cardio exercises, else 'reps'.
 */
export function modeOf(cfg) {
  const m = cfg && cfg.mode
  if (m === 'reps' || m === 'time' || m === 'cardio') return m
  return isCardio(cfg && cfg.id) ? 'cardio' : 'reps'
}
/**
 * Report whether an exercise config logs timed holds.
 *
 * @param {Object|null|undefined} cfg - Exercise config passed to modeOf.
 * @returns {boolean} True when the resolved mode is 'time'.
 */
export const isTimed = cfg => modeOf(cfg) === 'time'

/**
 * Report whether an exercise is logged as bodyweight work.
 *
 * @param {Object|null|undefined} cfg - Exercise config with optional bodyweight flag and id.
 * @returns {boolean} Explicit bodyweight flag when present, else the catalogue bodyweight default.
 */
export const isBw = cfg => (cfg && cfg.bodyweight != null ? !!cfg.bodyweight : isBodyweightEq(cfg && cfg.id))
/**
 * Report whether an exercise is logged per side.
 *
 * @param {Object|null|undefined} cfg - Exercise config with optional side flag; nullish yields false.
 * @returns {boolean} True only when cfg.side is truthy.
 */
export const isPerSide = cfg => !!(cfg && cfg.side)
/**
 * Convert a logged total into per-side reps for unilateral work.
 *
 * @param {number} reps - Logged total reps across both sides; nullish counts as 0.
 * @returns {number} Half the total, preserving .5 for odd totals.
 */
export const sideReps = reps => (reps || 0) / 2
/**
 * Return the rep stepper increment that keeps unilateral totals splittable.
 *
 * @param {Object|null|undefined} cfg - Exercise config with optional side flag.
 * @returns {number} 2 for per-side exercises, else 1.
 */
export const repStep = cfg => (isPerSide(cfg) ? 2 : 1)

export const ROW_DEFAULTS = Object.freeze({
  cardio: Object.freeze({ min: 20, speed: 8 }),
  time: Object.freeze({ sec: 45, weight: 0 }),
  reps: Object.freeze({ reps: 10, weight: 0 }),
})
export const SETS_DEFAULTS = Object.freeze({ cardio: 1, time: 3, reps: 3 })
/** The Rest durations, in seconds, that Settings and an exercise's config offer. */
export const REST_CHOICES = Object.freeze([60, 90, 120, 150, 180])
/**
 * An exercise's own Rest duration in seconds, or null when it follows the Profile's (ADR 0029).
 * @param {Object} cfg - A Target (`ExCfg`).
 */
export const ownRest = cfg => (Number.isFinite(cfg?.rest) && cfg.rest > 0 ? cfg.rest : null)

export function makeRow(mode, target = {}, { prev = null, warmup = false } = {}) {
  const m = normalizeMode(mode, 'reps')
  const base = warmup ? { done: false, phase: 'warmup' } : { done: false }
  if (m === 'cardio') {
    const min = prev?.min ?? target.min ?? ROW_DEFAULTS.cardio.min
    const speed = prev?.speed ?? target.speed ?? ROW_DEFAULTS.cardio.speed
    return { min, speed, ...base }
  }
  if (m === 'time') {
    const sec = prev?.sec ?? target.sec ?? ROW_DEFAULTS.time.sec
    const w = prev?.w ?? target.weight ?? ROW_DEFAULTS.time.weight
    return { sec, w, ...base }
  }
  const w = prev?.w ?? target.weight ?? ROW_DEFAULTS.reps.weight
  const r = prev?.r ?? target.reps ?? ROW_DEFAULTS.reps.reps
  return { w, r, ...base }
}

export function defaultConfig(id, mode) {
  const m = mode || modeOf({ id })
  if (m === 'cardio') return { sets: SETS_DEFAULTS.cardio, min: ROW_DEFAULTS.cardio.min, speed: ROW_DEFAULTS.cardio.speed }
  const bw = isBodyweightEq(id) ? { bodyweight: true } : {}
  if (m === 'time') return { sets: SETS_DEFAULTS.time, sec: ROW_DEFAULTS.time.sec, weight: ROW_DEFAULTS.time.weight, mode: 'time', ...bw }
  return { sets: SETS_DEFAULTS.reps, reps: ROW_DEFAULTS.reps.reps, weight: ROW_DEFAULTS.reps.weight, mode: 'reps', ...bw }
}

/**
 * Build a freestyle entry config seeded from the exercise's last logged target.
 *
 * @param {Object} S - App state holding the workouts history.
 * @param {Object} cfg - Fresh exercise config providing defaults and id.
 * @returns {Object} Copy of cfg overlaid with the last target, keeping cfg.id and at least one set.
 */
export function freestyleConfig(S, cfg) {
  const last = lastSession(S, cfg.id)
  if (!last) return { ...cfg }
  return {
    ...cfg,
    ...(last.target || {}),
    id: cfg.id,
    sets: Math.max(1, last.sets.length)
  }
}

export function buildSets(S, cfg, options = {}) {
  const routineId = options.routineId || null
  const last = lastSessionInRoutine(S, cfg.id, routineId)
  const n = Math.max(1, cfg.sets || 1)
  const mode = modeOf(cfg)
  const preferLast = !!options.preferLast
  const seedWeightOnly = !!options.seedWeightOnly
  const useExWeights = !routineId
  const sets = []
  const prevAt = i => (last ? (last.sets[i] || last.sets[last.sets.length - 1]) : null)

  if (mode === 'cardio') {
    for (let i = 0; i < n; i++) {
      const prev = prevAt(i)
      sets.push(makeRow('cardio', cfg, { prev }))
    }
    return sets
  }
  if (mode === 'time') {
    for (let i = 0; i < n; i++) {
      const prev = prevAt(i)
      const usable = prev && prev.sec > 0 ? prev : null
      const carried = seedWeightOnly && usable ? { w: usable.w } : usable
      sets.push(makeRow('time', cfg, { prev: carried }))
    }
    return sets
  }
  const bestWeight = useExWeights ? best(S, cfg.id) : 0
  for (let i = 0; i < n; i++) {
    const prev = prevAt(i)
    const usable = prev && prev.r > 0 ? prev : null
    const w = preferLast && usable ? usable.w : (bestWeight > 0 ? bestWeight : (usable ? usable.w : cfg.weight))
    const r = seedWeightOnly ? cfg.reps : (usable ? usable.r : cfg.reps)
    const row = makeRow('reps', { ...cfg, reps: r, weight: w }, { prev: null })
    sets.push(row)
  }
  return sets
}


export const hasWorkSet = entry => doneWorkSets(entry).length > 0

/**
 * Count every completed set in a workout, warm-ups included.
 * Not a metric: lifter-facing set counts read Work sets through the Workout summary (`workout-summary.js`).
 * The Active workout uses this to ask whether anything at all was performed.
 *
 * @param {Object|null|undefined} w - Workout with an entries array of set rows; nullish yields 0.
 * @returns {number} Number of performed sets (truthy `done`), including warm-ups.
 */
export function setsDone(w) {
  let n = 0
  ;(w?.entries || []).forEach(e => (e.sets || []).forEach(s => { if (isPerformed(s)) n++ }))
  return n
}

export function cascadeWeight(rows, from, value) {
  const warm = isWarmupRow(rows[from])
  const next = rows.slice()
  for (let j = from + 1; j < next.length; j++) {
    if (isWarmupRow(next[j]) === warm && !isPerformed(next[j])) {
      next[j] = { ...next[j] }
      if (value == null) delete next[j].w
      else next[j].w = value
    }
  }
  return next
}

export function insertWarmupRow(rows, mode, target = {}) {
  const firstWork = rows.findIndex(isWorkSet)
  const at = firstWork === -1 ? rows.length : firstWork
  const l = rows[at - 1] || rows[rows.length - 1]
  const warm = makeRow(mode, target, { prev: l || null, warmup: true })
  const next = rows.slice()
  next.splice(at, 0, warm)
  return next
}

export function removeRowAt(rows, i) {
  if (rows.length <= 1) return rows.slice()
  const next = rows.slice()
  next.splice(i, 1)
  return next
}

export function workSetsDone(w) {
  return (w?.entries || []).reduce((n, e) => n + doneWorkSets(e).length, 0)
}

export const hasWork = (entryOrEntries, idx) => {
  const entry = idx == null ? entryOrEntries : entryOrEntries?.[idx]
  return workSets(entry).some(set => !isPerformed(set))
}

export function isExerciseDone(entry) {
  if (!entry || !Array.isArray(entry.sets)) return false
  return !hasWork(entry)
}

export function sessionProgress(A) {
  const entries = A?.entries || []
  const total = entries.reduce((n, e) => n + workSets(e).length, 0)
  const done = workSetsDone(A)
  const exDone = entries.filter(isExerciseDone).length
  const exTotal = entries.length
  return { done, total, remaining: total - done, exDone, exTotal, allDone: exTotal > 0 && exDone === exTotal }
}


export function seedForReplacement(S, exId, routineId, setsCount) {
  const base = defaultConfig(exId)
  const last = lastSessionInRoutine(S, exId, routineId) || lastSession(S, exId)
  const bestWeight = best(S, exId)
  const seed = {
    ...base,
    ...(last?.target || {}),
    ...(bestWeight > 0 && !base.bodyweight ? { weight: bestWeight } : {}),
    sets: setsCount ?? base.sets,
  }
  delete seed.notes
  return seed
}

export function cleanNote(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 500) : undefined
}

