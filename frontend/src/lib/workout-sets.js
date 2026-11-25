import { ensurePlainObject, isWarmupRow } from './warmup.js'

/** @typedef {import('./types.js').LoggingMode} LoggingMode */
/** @typedef {import('./types.js').SetRow} SetRow */
/** @typedef {import('./types.js').Target} Target */
/** @typedef {import('./types.js').Entry} Entry */

/** @type {readonly LoggingMode[]} */
export const MODES = Object.freeze(['reps', 'time', 'cardio'])
export const PHASES = Object.freeze({ WORK: 'work', WARMUP: 'warmup' })

/**
 * Normalize a mode-like value to a canonical logging mode.
 *
 * @param {unknown} value - Candidate mode; non-strings and unknown tokens fall back.
 * @param {LoggingMode | string} [fallback] - Replacement when value is unknown; defaults to 'reps', and an unknown fallback itself yields 'reps'.
 * @returns {LoggingMode} 'reps', 'time', or 'cardio'.
 */
export function normalizeMode(value, fallback = 'reps') {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (token === 'reps' || token === 'time' || token === 'cardio') return token
  return fallback === 'reps' || fallback === 'time' || fallback === 'cardio' ? fallback : 'reps'
}

/** @param {unknown} value @returns {LoggingMode | null} */
function modeFromUnit(value) {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (['rep', 'reps', 'repetition', 'repetitions'].includes(token)) return 'reps'
  if (['sec', 'secs', 'second', 'seconds'].includes(token)) return 'time'
  if (['min', 'mins', 'minute', 'minutes'].includes(token)) return 'cardio'
  return null
}

/** @param {Record<string, unknown>} source @returns {LoggingMode | null} */
function explicitMode(source) {
  const obj = ensurePlainObject(source)
  const value = obj.mode
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (token === 'reps' || token === 'time' || token === 'cardio') return token
  return modeFromUnit(obj.unit)
}

/** @param {Record<string, unknown>} source @returns {LoggingMode | null} */
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

/**
 * Resolve the logging mode of a single Set row against its Target.
 * @param {Partial<SetRow> | Record<string, unknown> | null | undefined} set
 * @param {Partial<Target> | Record<string, unknown> | null | undefined} [target={}]
 * @returns {LoggingMode}
 */
export function modeForSet(set, target = {}) {
  return explicitMode(ensurePlainObject(set)) || inferredMode(ensurePlainObject(target)) || inferredMode(ensurePlainObject(set)) || 'reps'
}

/**
 * Resolve the single logging mode of an Entry, or null when performed sets mix modes.
 * @param {Entry | Partial<Entry> | Record<string, unknown> | null | undefined} entry
 * @param {LoggingMode | null} [fallback=null]
 * @returns {LoggingMode | null}
 */
export function modeForEntry(entry, fallback = null) {
  const source = ensurePlainObject(entry)
  const target = ensurePlainObject(source.target || source)
  /** @type {SetRow[]} */
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

/** @param {Partial<SetRow> | null | undefined} set @returns {boolean} */
export const isWorkSet = set => !isWarmupRow(set)

/** @param {Partial<SetRow> | null | undefined} set @returns {boolean} */
export const isPerformed = set => !!set?.done

/** @param {Entry | Partial<Entry> | null | undefined} entry @returns {SetRow[]} */
export const workSets = entry => (Array.isArray(entry?.sets) ? entry.sets : []).filter(isWorkSet)

/** @param {Entry | Partial<Entry> | null | undefined} entry @returns {SetRow[]} */
export const doneWorkSets = entry => workSets(entry).filter(isPerformed)

/**
 * @param {Entry | Partial<Entry> | Record<string, unknown>} [entry={}]
 * @param {LoggingMode} [mode='reps']
 * @returns {SetRow[]}
 */
const workRowsForMode = (entry = {}, mode = 'reps') => {
  const source = ensurePlainObject(entry)
  const target = ensurePlainObject(source.target || source)
  const expectedMode = normalizeMode(mode, 'reps')
  /** @type {SetRow[]} */
  const sets = Array.isArray(source.sets) ? source.sets : []
  return sets.filter(set => isWorkSet(set) && modeForSet(set, target) === expectedMode)
}

/**
 * @param {Entry | Partial<Entry> | null | undefined} entry
 * @param {LoggingMode} mode
 * @returns {SetRow[]}
 */
const completedRowsForMode = (entry, mode) => workRowsForMode(entry ?? {}, mode).filter(isPerformed)

/**
 * Select the completed rows that score an entry's headline metric.
 *
 * @param {Entry | Partial<Entry> | null | undefined} entry - Workout entry with sets and optional target.
 * @param {LoggingMode | string} [mode] - Requested mode; unknown or missing values fall back to the entry's own metric mode.
 * @returns {SetRow[]} Completed rows for the resolved mode, or [] when the entry has no metric mode.
 */
export function metricRowsForEntry(entry, mode) {
  const requested = typeof mode === 'string' ? mode.trim().toLowerCase() : ''
  const resolved = requested === 'reps' || requested === 'time' || requested === 'cardio'
    ? requested
    : metricModeForEntry(entry)
  return resolved ? completedRowsForMode(entry, resolved) : []
}

/**
 * Resolve the headline metric mode for an Entry based on completed work sets.
 * @param {Entry | Partial<Entry> | null | undefined} entry
 * @param {LoggingMode | null} [fallback=null]
 * @returns {LoggingMode | null}
 */
export function metricModeForEntry(entry, fallback = null) {
  for (const mode of MODES) {
    if (completedRowsForMode(entry, mode).length) return mode
  }
  return modeForEntry(entry, fallback)
}
