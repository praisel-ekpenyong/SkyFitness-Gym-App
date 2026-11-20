// The Profile's schema version and the ordered steps that bring an older Profile up to it (ADR 0027).
// A step changes shapes only, never values. Adding one raises SCHEMA_VERSION by one.

import { EFFORT } from '../effort.js'
import { isRecord } from './plain.js'

function sealEffort(raw) {
  const e = raw.effort
  if (e === 'none' || EFFORT[e]) return e
  return raw.showRir ? 'rir' : 'none'
}

// Old rows carried `warmup: true`; the Profile now stores the phase shape only.
function upgradeSet(set) {
  if (!isRecord(set) || set.warmup !== true) return set
  const { warmup, ...rest } = set
  return rest.phase == null || rest.phase === '' ? { ...rest, phase: 'warmup' } : rest
}

function upgradeSets(sets) {
  if (!Array.isArray(sets)) return sets
  let changed = false
  const upgraded = sets.map(set => {
    const next = upgradeSet(set)
    if (next !== set) changed = true
    return next
  })
  return changed ? upgraded : sets
}

function upgradeEntries(entries) {
  if (!Array.isArray(entries)) return entries
  let changed = false
  const upgraded = entries.map(entry => {
    if (!isRecord(entry)) return entry
    const sets = upgradeSets(entry.sets)
    if (sets === entry.sets) return entry
    changed = true
    return { ...entry, sets }
  })
  return changed ? upgraded : entries
}

function upgradeWorkout(workout) {
  if (!isRecord(workout)) return workout
  const entries = upgradeEntries(workout.entries)
  return entries === workout.entries ? workout : { ...workout, entries }
}

/** 0 → 1: every Profile saved before the schema version. `showRir` becomes `effort`; `warmup: true` becomes `phase: 'warmup'`. */
function fromVersion0(raw) {
  const next = { ...raw, effort: sealEffort(raw) }
  delete next.showRir
  if (Array.isArray(raw.workouts)) next.workouts = raw.workouts.map(upgradeWorkout)
  if (isRecord(raw.active)) next.active = upgradeWorkout(raw.active)
  return next
}

/** The upgrade steps in order: step `n` takes a version-`n` Profile to version `n + 1`. */
export const UPGRADES = [fromVersion0]

/** The schema version this build writes. A Profile with no `schemaVersion` is version 0. */
export const SCHEMA_VERSION = UPGRADES.length

/**
 * The schema version a stored Profile was written at.
 * @param {Object} raw - A stored or restored Profile.
 * @returns {number} 0 when absent; Infinity when present but not a whole number of at least 0.
 */
export function schemaVersionOf(raw) {
  const v = raw?.schemaVersion
  if (v === undefined) return 0
  return Number.isInteger(v) && v >= 0 ? v : Infinity
}

/**
 * Tells whether a Profile was written by a newer Sky than this one, or carries a version it cannot read.
 * @param {*} raw - A stored or restored payload.
 * @returns {boolean} True when admitting it would read shapes this build does not know.
 */
export function isNewerProfile(raw) {
  return isRecord(raw) && schemaVersionOf(raw) > SCHEMA_VERSION
}

/** Thrown by `admit` for a Profile from a newer Sky: it is refused, never admitted. */
export class NewerProfileError extends Error {
  constructor(version) {
    super('this Profile was saved by a newer version of Sky')
    this.name = 'NewerProfileError'
    this.version = version
  }
}

/**
 * Runs the upgrade steps a Profile has not yet taken, in order.
 * @param {Object} raw - A Profile at version `from`.
 * @param {number} from - Its stored schema version.
 * @param {Function[]} steps - The ordered steps; `UPGRADES` unless a test passes its own.
 * @returns {Object} The Profile at version `steps.length`; `raw` itself when no step runs.
 */
export function upgrade(raw, from, steps = UPGRADES) {
  let S = raw
  for (let v = from; v < steps.length; v++) S = steps[v](S)
  return S
}
