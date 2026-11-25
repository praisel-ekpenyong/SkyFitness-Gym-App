
/**
 * Normalises a muscle spelling for comparison.
 * @param {*} value - Any muscle spelling; nullish yields ''.
 * @returns {string} The spelling lowercased and trimmed.
 */
export const muscleKey = value => String(value || '').toLowerCase().trim()

/** The three deltoid heads, front to back (ADR 0024). */
export const DELT_HEADS = ['front-delts', 'side-delts', 'rear-delts']

const PLAIN_SHOULDERS = new Set(['shoulders', 'deltoids', 'delts'])

/**
 * Tells whether a muscle spelling is a plain Shoulders that names no head.
 * @param {*} value - Any muscle spelling.
 * @returns {boolean} True for "shoulders", "deltoids" or "delts" in any case.
 */
export const isPlainShoulders = value => PLAIN_SHOULDERS.has(muscleKey(value))
