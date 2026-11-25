
/**
 * True for a plain record: an object that is not null and not an array.
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
export const isRecord = v => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * A deep copy of plain Profile data; falls back to JSON when structuredClone is missing or refuses.
 * @template T
 * @param {T} o
 * @returns {T}
 */
export function cloneProfile(o) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(o) } catch {}
  }
  return JSON.parse(JSON.stringify(o))
}
