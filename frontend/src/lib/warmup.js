
/**
 * Reads any set-like value as the plain object phase detection can inspect.
 * @param {*} value - Candidate of any type; arrays and non-objects yield an empty object.
 * @returns {Object} The object itself, or an empty object when there is nothing to inspect.
 */
export const ensurePlainObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

/**
 * Reads a set row's phase. `admit` upgrades old rows on the way into the Profile, so the phase
 * field is the only shape readers see (ADR 0027).
 * @param {Object} set - Set row carrying `phase`; a missing or unknown phase reads as work.
 * @returns {'warmup'|'work'} The normalized phase.
 */
export function phaseForSet(set) {
  const source = ensurePlainObject(set)
  const token = typeof source.phase === 'string' ? source.phase.trim().toLowerCase() : ''
  return token === 'warmup' || token === 'warm-up' || token === 'warm_up' ? 'warmup' : 'work'
}

/**
 * Tells callers whether a set row counts as warm-up rather than counted work.
 * @param {Object} set - Set row with an explicit `phase`; missing input reads as work.
 * @returns {boolean} True for warm-up rows; false for work rows.
 */
export function isWarmupRow(set) {
  return phaseForSet(set) === 'warmup'
}
