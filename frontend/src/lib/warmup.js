
/** @typedef {import('./types.js').SetRow} SetRow */
/** @typedef {import('./types.js').SetPhase} SetPhase */

/**
 * Reads any set-like value as the plain object phase detection can inspect.
 * @param {unknown} value - Candidate of any type; arrays and non-objects yield an empty object.
 * @returns {Record<string, unknown>} The object itself, or an empty object when there is nothing to inspect.
 */
export const ensurePlainObject = value =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {}

/**
 * Reads a set row's phase. `admit` upgrades old rows on the way into the Profile, so the phase
 * field is the only shape readers see (ADR 0027).
 * @param {Partial<SetRow> | Record<string, unknown> | null | undefined} set - Set row carrying `phase`; a missing or unknown phase reads as work.
 * @returns {SetPhase} The normalized phase.
 */
export function phaseForSet(set) {
  const source = ensurePlainObject(set)
  const token = typeof source.phase === 'string' ? source.phase.trim().toLowerCase() : ''
  return token === 'warmup' || token === 'warm-up' || token === 'warm_up' ? 'warmup' : 'work'
}

/**
 * Tells callers whether a set row counts as warm-up rather than counted work.
 * @param {Partial<SetRow> | Record<string, unknown> | null | undefined} set - Set row with an explicit `phase`; missing input reads as work.
 * @returns {boolean} True for warm-up rows; false for work rows.
 */
export function isWarmupRow(set) {
  return phaseForSet(set) === 'warmup'
}
