
import { isCardio, isBodyweightEq } from './exercises.js'
import { isWarmupRow, ensurePlainObject } from './warmup.js'
import { best, lastSession, lastSessionInRoutine } from './training-log.js'

export { phaseForSet, isWarmupRow, ensurePlainObject } from './warmup.js'

export const MODES = Object.freeze(['reps', 'time', 'cardio'])
export const PHASES = Object.freeze({ WORK: 'work', WARMUP: 'warmup' })

/**
 * Normalize a mode-like value to a canonical logging mode.
 *
 * @param {*} value - Candidate mode; non-strings and unknown tokens fall back.
 * @param {string} [fallback] - Replacement when value is unknown; defaults to 'reps', and an unknown fallback itself yields 'reps'.
 * @returns {string} 'reps', 'time', or 'cardio'.
 */
export function normalizeMode(value, fallback = 'reps') {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (MODES.includes(token)) return token
  return MODES.includes(fallback) ? fallback : 'reps'
}

function modeFromUnit(value) {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (['rep', 'reps', 'repetition', 'repetitions'].includes(token)) return 'reps'
  if (['sec', 'secs', 'second', 'seconds'].includes(token)) return 'time'
  if (['min', 'mins', 'minute', 'minutes'].includes(token)) return 'cardio'
  return null
}

function explicitMode(source) {
  const obj = ensurePlainObject(source)
  const value = obj.mode
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return MODES.includes(token) ? token : modeFromUnit(obj.unit)
}

function inferredMode(source) {
  const value = ensurePlainObject(source)
  const explicit = explicitMode(value)
  if (explicit) return explicit
  if (String(value.mode || '').trim().toLowerCase() === 'amrap') return 'reps'
  if (value.min != null || value.speed != null) return 'cardio'
  if (value.sec != null || value.seconds != null || value.durationSec != null) return 'time'
  if (value.r != null || value.reps != null || value.actualReps != null) return 'reps'
  return null
}

export function modeForSet(set, target = {}) {
  return explicitMode(set) || inferredMode(target) || inferredMode(set) || 'reps'
}

export function modeForEntry(entry, fallback = null) {
  const source = ensurePlainObject(entry)
  const target = ensurePlainObject(source.target || source)
  const sets = Array.isArray(source.sets) ? source.sets : []
  const work = sets.filter(isWorkSet)
  const observed = work.length ? work : sets
  const modes = [...new Set(observed.map(set => modeForSet(set, target)))]
  if (modes.length > 1) return null
  if (modes.length === 1) return modes[0]
  const targetMode = inferredMode(target)
  if (targetMode) return targetMode
  return fallback == null ? modeForSet(source, target) : normalizeMode(fallback)
}

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

export const isWorkSet = set => !isWarmupRow(set)

export const isPerformed = set => !!set?.done

export const workSets = entry => (Array.isArray(entry?.sets) ? entry.sets : []).filter(isWorkSet)

export const doneWorkSets = entry => workSets(entry).filter(isPerformed)

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

const workRowsForMode = (entry = {}, mode = 'reps') => {
  const source = ensurePlainObject(entry)
  const target = ensurePlainObject(source.target || source)
  const expectedMode = normalizeMode(mode, 'reps')
  return (Array.isArray(source.sets) ? source.sets : [])
    .filter(set => isWorkSet(set) && modeForSet(set, target) === expectedMode)
}

const completedRowsForMode = (entry, mode) => workRowsForMode(entry, mode).filter(isPerformed)

/**
 * Select the completed rows that score an entry's headline metric.
 *
 * @param {Object} entry - Workout entry with sets and optional target.
 * @param {string} mode - Requested mode; unknown or missing values fall back to the entry's own metric mode.
 * @returns {Array<Object>} Completed rows for the resolved mode, or [] when the entry has no metric mode.
 */
export function metricRowsForEntry(entry, mode) {
  const requested = typeof mode === 'string' ? mode.trim().toLowerCase() : ''
  const resolved = MODES.includes(requested) ? requested : metricModeForEntry(entry)
  return resolved ? completedRowsForMode(entry, resolved) : []
}

export function metricModeForEntry(entry, fallback = null) {
  for (const mode of MODES) {
    if (completedRowsForMode(entry, mode).length) return mode
  }
  return modeForEntry(entry, fallback)
}

export function seedForReplacement(S, exId, routineId, setsCount) {
  const base = defaultConfig(exId)
  const last = lastSessionInRoutine(S, exId, routineId) || lastSession(S, exId)
  const bestWeight = best(S, exId)
  return {
    ...base,
    ...(last?.target || {}),
    ...(bestWeight > 0 && !base.bodyweight ? { weight: bestWeight } : {}),
    sets: setsCount ?? base.sets,
  }
}

export function cleanNote(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 500) : undefined
}

