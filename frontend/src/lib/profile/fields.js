// The Profile's optional strength fields. normalizeState cleans them on every way in (boot, sync,
// Restore), so there is one clean function per field and one clock.

import { cleanSex } from '../sex.js'
import { cleanBirthYear } from '../birth-year.js'

/** The clean function for each optional Profile field. Keys are the stored top-level keys. */
export const PROFILE_CLEAN = {
  sex: value => cleanSex(value),
  birthYear: (value, now) => cleanBirthYear(value, now),
}

/**
 * Cleans every optional Profile field from a raw payload. Absent fields clean to null.
 * @param {Object|null} raw - Stored or restored state.
 * @param {number} now - Injected millisecond timestamp.
 * @returns {{sex: 'male'|'female'|null, birthYear: number|null}}
 */
export function cleanProfileFields(raw, now) {
  return Object.fromEntries(Object.entries(PROFILE_CLEAN).map(([key, clean]) => [key, clean(raw?.[key], now)]))
}
