import { uid } from '../format.js'
import { DEF } from './def.js'
import { isRecord, cloneProfile } from './plain.js'
import { sortWorkouts } from './workouts.js'
import { NewerProfileError, SCHEMA_VERSION, schemaVersionOf, upgrade } from './upgrades.js'

/** @typedef {import('../types.js').Profile} Profile */

/**
 * Fills every field the stored Profile lacks from DEF, at any depth. A stored value, null and
 * falsy ones included, is never replaced, and arrays are values, not defaults to merge into.
 * @param {Record<string, unknown>} stored
 * @param {Record<string, unknown>} defaults
 * @returns {Record<string, unknown>}
 */
function fillDefaults(stored, defaults) {
  /** @type {Record<string, unknown>} */
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
 * @param {unknown} row
 * @param {string} key
 * @returns {boolean}
 */
function hasKey(row, key) {
  return !!(isRecord(row) && typeof row[key] === 'string' && row[key])
}

/**
 * Absent ids only. A row that already has one keeps it, and the array is returned as-is when none are missing.
 * @param {unknown} rows
 * @param {string} key
 * @returns {unknown}
 */
function stampRows(rows, key) {
  if (!Array.isArray(rows) || rows.every(row => hasKey(row, key))) return rows
  return rows.map(row => (hasKey(row, key) || !isRecord(row)) ? row : { ...row, [key]: uid() })
}

/**
 * Stamps a missing id on each Active set row and a missing rowId on each Routine row.
 * Finished Workouts in the log stay as stored (ADR 0027). Mutates `S`.
 * @param {Record<string, unknown>} S - A Profile the caller owns.
 * @returns {Record<string, unknown>} `S`.
 */
function stampProfileRows(S) {
  if (!isRecord(S)) return S
  const active = isRecord(S.active) ? S.active : null
  const entries = active?.entries
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      if (!isRecord(entry)) continue
      const sets = stampRows(entry.sets, 'id')
      if (sets !== entry.sets) entry.sets = sets
    }
  }
  if (Array.isArray(S.routines)) {
    for (const routine of S.routines) {
      if (!isRecord(routine)) continue
      const ex = stampRows(routine.ex, 'rowId')
      if (ex !== routine.ex) routine.ex = ex
    }
  }
  return S
}

/**
 * The one way a Profile comes in (boot, another tab, a Restore, a CSV import). Runs the upgrade
 * steps from the stored schema version (absent is version 0), fills absent fields from `DEF` at
 * any depth, stamps a missing id on each Active set row and a missing rowId on each Routine row,
 * stamps the current version and puts Workouts in Training-log order.
 * Values are never rewritten: units, `topW` and `asked` stay as stored (ADR 0031, ADR 0020).
 * Finished Workouts in the log stay as stored.
 * @overload
 * @param {Record<string, unknown>} raw - A Profile record from boot, another tab, a Restore or a CSV import.
 * @returns {Profile} A new Profile at `SCHEMA_VERSION`.
 * @throws {NewerProfileError} When `raw` was saved by a newer Sky; it is refused, never admitted.
 * @throws {Error} When `raw` is not a plain Profile record.
 */
/**
 * @param {unknown} raw
 * @returns {unknown}
 */
export function admit(raw) {
  if (!isRecord(raw)) throw new Error('admit expects a Profile record')
  const from = schemaVersionOf(raw)
  if (from > SCHEMA_VERSION) throw new NewerProfileError(raw.schemaVersion)
  /** @type {Record<string, unknown>} */
  const S = { ...fillDefaults(upgrade(raw, from), DEF), schemaVersion: SCHEMA_VERSION }
  if (Array.isArray(S.workouts)) S.workouts = sortWorkouts(S.workouts)
  if (isRecord(S.active)) S.active = structuredClone(S.active)
  if (Array.isArray(S.routines)) S.routines = structuredClone(S.routines)
  return stampProfileRows(S)
}
