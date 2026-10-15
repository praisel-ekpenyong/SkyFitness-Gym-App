// Single source of truth for warm-up vs work phase detection.
// Extracted to break the circular dependency history.js <-> workout-model.js
// and to eliminate duplicated isWarmupRow logic.

/**
 * Reads any set-like value as the plain object phase detection can inspect.
 * @param {*} value - Candidate of any type; arrays and non-objects yield an empty object.
 * @returns {Object} The object itself, or an empty object when there is nothing to inspect.
 */
export const ensurePlainObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
/** @deprecated use ensurePlainObject — kept for backward compat */
export const objectOf = ensurePlainObject

/**
 * Normalizes a raw phase token onto the two phases callers compare.
 * @param {*} value - Raw phase token; surrounding space and case are ignored and non-strings fall through to the fallback.
 * @param {string} fallback - Phase used for anything unrecognised; anything other than `warmup` reads as `work`.
 * @returns {string} `warmup` or `work`.
 */
function normalizedPhase(value, fallback = 'work') {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (token === 'warmup' || token === 'warm-up' || token === 'warm_up') return 'warmup'
  if (token === 'work') return 'work'
  return fallback === 'warmup' ? 'warmup' : 'work'
}

/** Resolve a row's phase. An explicit phase wins over the legacy warmup boolean. */
export function phaseForSet(set, fallback = 'work') {
  const source = ensurePlainObject(set)
  if (source.phase != null && source.phase !== '') return normalizedPhase(source.phase, fallback)
  return source.warmup === true ? 'warmup' : normalizedPhase(undefined, fallback)
}

/**
 * Tells callers whether a set row counts as warm-up rather than counted work.
 * @param {Object} set - Set row with an explicit `phase` or legacy `warmup` flag; missing input reads as work.
 * @returns {boolean} True for warm-up rows; false for work rows.
 */
export function isWarmupRow(set) {
  return phaseForSet(set) === 'warmup'
}
