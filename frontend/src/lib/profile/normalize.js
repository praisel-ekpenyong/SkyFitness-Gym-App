import { assertClock } from '../dates.js'
import { cleanProfileFields } from './fields.js'
import { DEF } from './def.js'
import { admit } from './admit.js'
import { isRecord, cloneProfile } from './plain.js'

/** @typedef {import('../types.js').Profile} Profile */
/** @typedef {import('../types.js').ActiveWorkout} ActiveWorkout */

/** @returns {Profile} */
export function freshProfile() {
  return cloneProfile(DEF)
}

/**
 * Turns any stored or restored payload into a complete Profile: `admit` first (upgrades from the
 * stored schema version, defaults for absent fields, Training-log order), then known collections
 * and cleaned optional fields. `admit` sees the payload as stored, so no DEF overlay can hide a
 * missing `schemaVersion`.
 * @param {unknown} raw - Stored or restored Profile of any shape.
 * @param {number} now - Injected millisecond timestamp for age-dependent fields.
 * @returns {Profile} A new, complete Profile; `DEF` itself is never returned.
 * @throws {NewerProfileError} When `raw` was saved by a newer Sky.
 * @throws {TypeError} When `now` is not a finite number.
 */
export function normalizeState(raw, now) {
  assertClock(now)
  if (!isRecord(raw)) return freshProfile()
  const S = admit(raw)
  if (!Array.isArray(S.workouts)) S.workouts = []
  if (!Array.isArray(S.routines)) S.routines = []
  if (!Array.isArray(S.bodyweight)) S.bodyweight = []
  if (!Array.isArray(S.customEx)) S.customEx = []
  if (!Array.isArray(S.favorites)) S.favorites = []
  S.week = isRecord(S.week) ? { ...S.week } : {}
  S.dayPlan = isRecord(S.dayPlan) ? { ...S.dayPlan } : {}
  S.reminder = isRecord(S.reminder) ? { ...S.reminder } : cloneProfile(DEF.reminder)
  Object.assign(S, cleanProfileFields(S, now))
  const a = S.active
  S.active = isRecord(a) && Array.isArray(a.entries) ? a : null
  return S
}
