// The Profile's value fields. normalizeState cleans them on every way in (boot, sync, Restore),
// so there is one clean function per field and one clock.

import { cleanSex } from '../sex.js'
import { cleanBirthYear } from '../birth-year.js'
import { sanitizeUnit } from '../units.js'
import { ACCENTS } from '../format.js'
import { trainingStyleOf, cleanVolumeRanges } from '../volume-ranges.js'
import { DEF } from './def.js'

/** @typedef {import('../types.js').Profile} Profile */

/**
 * The clean function for each cleaned Profile field. Keys are the stored top-level keys.
 * @type {{
 *   unit: (value: unknown) => Profile['unit'],
 *   restSec: (value: unknown) => Profile['restSec'],
 *   theme: (value: unknown) => Profile['theme'],
 *   accent: (value: unknown) => Profile['accent'],
 *   displayName: (value: unknown) => Profile['displayName'],
 *   sex: (value: unknown) => Profile['sex'],
 *   birthYear: (value: unknown, now: number) => Profile['birthYear'],
 *   trainingStyle: (value: unknown) => Profile['trainingStyle'],
 *   volumeRanges: (value: unknown) => Profile['volumeRanges']
 * }}
 */
export const PROFILE_CLEAN = {
  unit: value => sanitizeUnit(value),
  restSec: value => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : DEF.restSec),
  theme: value => (value === 'light' ? 'light' : DEF.theme),
  accent: value => (typeof value === 'string' && Object.hasOwn(ACCENTS, value) ? value : DEF.accent),
  displayName: value => (typeof value === 'string' ? value : null),
  sex: value => cleanSex(value),
  birthYear: (value, now) => cleanBirthYear(value, now),
  trainingStyle: value => trainingStyleOf({ trainingStyle: value }),
  volumeRanges: value => cleanVolumeRanges(value),
}

/**
 * Cleans every PROFILE_CLEAN field from a raw payload. An absent field cleans to its DEF value.
 * @param {Profile | Record<string, unknown> | null | undefined} raw - Stored or restored state.
 * @param {number} now - Injected millisecond timestamp.
 * @returns {Object} One clean value per PROFILE_CLEAN key.
 */
export function cleanProfileFields(raw, now) {
  const values = /** @type {Record<string, unknown>} */ (raw ?? {})
  return Object.fromEntries(Object.entries(PROFILE_CLEAN).map(([key, clean]) => [key, clean(values[key], now)]))
}
