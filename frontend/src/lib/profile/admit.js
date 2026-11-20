import { DEF } from './def.js'
import { isRecord, cloneProfile } from './plain.js'
import { sortWorkouts } from './workouts.js'
import { NewerProfileError, SCHEMA_VERSION, schemaVersionOf, upgrade } from './upgrades.js'

// Fills every field the stored Profile lacks from DEF, at any depth. A stored value, null and
// falsy ones included, is never replaced, and arrays are values, not defaults to merge into.
function fillDefaults(stored, defaults) {
  let out = stored
  for (const [key, def] of Object.entries(defaults)) {
    const value = stored[key]
    let next = value
    if (value === undefined) next = cloneProfile(def)
    else if (isRecord(def) && isRecord(value)) next = fillDefaults(value, def)
    if (next === value) continue
    if (out === stored) out = { ...stored }
    out[key] = next
  }
  return out
}

/**
 * The one way a Profile comes in (boot, another tab, a Restore, a CSV import). Runs the upgrade
 * steps from the stored schema version (absent is version 0), fills absent fields from `DEF` at
 * any depth, stamps the current version and puts Workouts in Training-log order.
 * Values are never rewritten: units, `topW` and `asked` stay as stored (ADR 0031, ADR 0020).
 * @param {Object} raw - A Profile from boot, another tab, a Restore or a CSV import.
 * @returns {Object} A new Profile at `SCHEMA_VERSION`.
 * @throws {NewerProfileError} When `raw` was saved by a newer Sky; it is refused, never admitted.
 */
export function admit(raw) {
  if (!isRecord(raw)) return raw
  const from = schemaVersionOf(raw)
  if (from > SCHEMA_VERSION) throw new NewerProfileError(raw.schemaVersion)
  const S = { ...fillDefaults(upgrade(raw, from), DEF), schemaVersion: SCHEMA_VERSION }
  if (Array.isArray(S.workouts)) S.workouts = sortWorkouts(S.workouts)
  return S
}
