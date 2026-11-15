
/**
 * Reads any set-like value as the plain object phase detection can inspect.
 * @param {*} value - Candidate of any type; arrays and non-objects yield an empty object.
 * @returns {Object} The object itself, or an empty object when there is nothing to inspect.
 */
export const ensurePlainObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

function normalizedPhase(value, fallback = 'work') {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (token === 'warmup' || token === 'warm-up' || token === 'warm_up') return 'warmup'
  if (token === 'work') return 'work'
  return fallback === 'warmup' ? 'warmup' : 'work'
}

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
