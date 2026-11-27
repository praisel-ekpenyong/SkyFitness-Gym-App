/**
 * Prospective Prescription: one pure reading behind one entry point (ADR 0037).
 *
 * It takes the Active workout and the Profile — never the store, a clock, a cache or a registry —
 * and returns one immutable value: the canonical as-if-finished Workout, per-entry readings keyed
 * for Milestone cue lookup, and the same readings grouped for the Progression summary.
 */
import { readEntryVerdict } from './progression.js'
import { freezePrescriptionRecord } from './prescription-record.js'
import { sanitizeUnit } from './units.js'

/** @typedef {import('./types.js').Entry} Entry */
/** @typedef {import('./types.js').Workout} Workout */
/** @typedef {import('./types.js').ActiveWorkout} ActiveWorkout */
/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Target} Target */
/** @typedef {import('./types.js').Prescription} Prescription */
/** @typedef {import('./types.js').PrescriptionRecord} PrescriptionRecord */

/**
 * @typedef {Object} ProspectiveReading
 * @property {string} id - Exercise id, the cue lookup key.
 * @property {Entry} entry - The Entry in the canonical Workout.
 * @property {string} d - The canonical Workout's day key.
 * @property {string | null} routineId - The canonical Workout's Routine id, the cue's policy source.
 * @property {ReturnType<typeof readEntryVerdict>} verdict - The shared judgement the cue reads.
 * @property {Prescription} prescription - The one Progression judgement.
 * @property {PrescriptionRecord | null} plan - The frozen record the boundary would write next.
 * @property {Unit} unit - The Active workout's unit.
 * @property {Target} cfg - The config the judgement used.
 * @property {ReturnType<typeof readEntryVerdict>['judged']} judged - The one Hit rule's reading.
 * @property {number} aimDelta - Rep/hold aim movement, when the Prescription holds.
 * @property {number} step - Load or hold increase, when the Prescription advances.
 */

/**
 * @typedef {Object} ProspectivePrescription
 * @property {Workout} workout - Canonical as-if-finished Workout (duration still unknown).
 * @property {Readonly<Record<string, ProspectiveReading>>} entries - Readings keyed for cue lookup.
 * @property {readonly ProspectiveReading[]} items - The same readings grouped for the summary.
 */

/** Duration stays unknown mid-session: no placeholder clock and no fixed future date. */
const UNKNOWN_END = /** @type {number} */ (/** @type {unknown} */ (null))

/** @type {ActiveWorkout} */
const EMPTY_ACTIVE = {
  id: 'prospective-prescription', d: '', start: 0, routineId: null, name: '', bw: null,
  unit: 'kg', cur: 0, entries: []
}

/**
 * Copy an Entry with the structured-clone primitive so freezing the reading never freezes the
 * caller's Active workout. Entries are plain profile data, so cloning cannot drop behaviour.
 * @param {Entry} entry
 * @returns {Entry}
 */
function freezeEntryPlan(entry) {
  const copy = structuredClone(entry)
  const plan = freezePrescriptionRecord(entry.plan)
  if (plan) copy.plan = plan
  else delete copy.plan
  return copy
}

/**
 * The canonical as-if-finished Workout, carrying the Active workout's own day, routine and unit
 * and every Entry. Only the Session boundary supplies the real end clock (ADR 0037).
 *
 * @param {ActiveWorkout} active
 * @param {Partial<Profile>} S
 * @returns {Workout}
 */
function standInWorkout(active, S) {
  return {
    id: active.id,
    d: active.d,
    start: active.start,
    end: UNKNOWN_END,
    routineId: active.routineId,
    name: active.name,
    bw: active.bw,
    unit: sanitizeUnit(active.unit || S.unit),
    entries: active.entries.map(freezeEntryPlan)
  }
}

/**
 * @param {Entry} entry
 * @param {Partial<Profile>} S
 * @param {Workout} workout
 * @returns {ProspectiveReading}
 */
function readingFor(entry, S, workout) {
  const verdict = readEntryVerdict(entry, S, workout)
  return {
    id: entry.id,
    entry,
    d: workout.d,
    routineId: workout.routineId,
    // `verdict` is the cue seam; the flattened copy serves the summary/boundary readers.
    verdict,
    ...verdict,
    plan: freezePrescriptionRecord(verdict.prescription)
  }
}

/**
 * Read the one Prospective Prescription for an in-progress session.
 *
 * @param {ActiveWorkout | null | undefined} active
 * @param {Profile | null | undefined} profile
 * @returns {ProspectivePrescription}
 */
export function readProspectivePrescription(active, profile) {
  /** @type {Partial<Profile>} */
  const S = profile && typeof profile === 'object' ? profile : {}
  /** @type {ActiveWorkout} */
  const A = active && typeof active === 'object' ? active : EMPTY_ACTIVE
  // Once the Session boundary has written this workout, read it instead of appending a stand-in.
  const logged = active ? (S.workouts || []).find(w => w.id === A.id) : null
  const workout = logged || standInWorkout(A, S)

  /** @type {Record<string, ProspectiveReading>} */
  const byEntry = {}
  /** @type {ProspectiveReading[]} */
  const items = []
  for (const entry of workout.entries) {
    const reading = readingFor(entry, S, workout)
    byEntry[entry.id] = reading
    items.push(reading)
  }

  for (const item of items) Object.freeze(item)
  if (!logged) {
    Object.freeze(workout.entries)
    for (const entry of workout.entries) Object.freeze(entry)
    Object.freeze(workout)
  }
  return Object.freeze({ workout, entries: Object.freeze(byEntry), items: Object.freeze(items) })
}
