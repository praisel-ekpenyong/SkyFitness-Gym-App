import { ensurePlainObject, isWarmupRow } from './warmup.js'

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

export const isWorkSet = set => !isWarmupRow(set)

export const isPerformed = set => !!set?.done

export const workSets = entry => (Array.isArray(entry?.sets) ? entry.sets : []).filter(isWorkSet)

export const doneWorkSets = entry => workSets(entry).filter(isPerformed)

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
