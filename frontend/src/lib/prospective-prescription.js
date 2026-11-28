/**
 * Prospective Prescription: one pure reading behind one entry point (ADR 0037).
 *
 * It takes the Active workout and the Profile — never the store, a clock, a cache or a registry —
 * and returns one immutable value: the canonical as-if-finished Workout, per-entry readings keyed
 * for Milestone cue lookup, and the same readings grouped for the Progression summary.
 */
import { judgeNextPrescription, readSession } from './progression.js'
import { defaultConfig } from './workout-model.js'
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
/** @typedef {import('./types.js').Routine} Routine */

/**
 * @typedef {Object} ProspectiveReading
 * @property {string} id - Exercise id, the cue lookup key.
 * @property {Entry} entry - The Entry in the canonical Workout.
 * @property {string} d - The canonical Workout's day key.
 * @property {string | null} routineId - The canonical Workout's Routine id, the cue's policy source.
 * @property {Prescription} prescription - The one Progression judgement.
 * @property {PrescriptionRecord | null} plan - The frozen record the boundary would write next.
 * @property {Unit} unit - The Active workout's unit.
 * @property {Target} cfg - The config the judgement used.
 * @property {ReturnType<typeof readSession>} judged - The one Hit rule's reading of this Entry.
 * @property {number} progress - Rep progress or hold-aim progress, when the Prescription holds at the same working value.
 * @property {number} step - Load or hold increase as delivered, when the Prescription advances.
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
 * Copy an Entry so freezing the reading never freezes the caller's Active workout. The boundary
 * calls the reading inside a store action, where entries may be proxy drafts that structuredClone
 * cannot copy; a top-level spread is enough because the reading freezes only the top level.
 * @param {Entry} entry
 * @returns {Entry}
 */
function freezeEntryPlan(entry) {
  const copy = { ...entry }
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
 * What every Entry is judged against: the Profile as if the session had just ended, with the
 * canonical Workout in the Training log and read in its unit (also after the Session boundary has
 * logged it), and the Routine behind the session (ADR 0037).
 * @param {Partial<Profile>} S
 * @param {Workout} workout
 * @param {boolean} logged
 * @returns {{ finished: Partial<Profile>, unit: Unit, routine: Routine | null }}
 */
function judgingContext(S, workout, logged) {
  const unit = sanitizeUnit(workout.unit || S.unit)
  const finished = logged ? { ...S, unit } : { ...S, unit, workouts: [...(S.workouts || []), workout] }
  const routineId = workout.routineId ?? S.active?.routineId ?? null
  const routine = routineId ? (S.routines || []).find(r => r.id === routineId) || null : null
  return { finished, unit, routine }
}

/**
 * @param {Entry} entry
 * @param {Partial<Profile>} finished - The Profile as if the session had just ended.
 * @param {Workout} workout
 * @param {Routine | null} routine
 * @param {Unit} unit - The Workout's unit, else the Profile's.
 * @returns {ProspectiveReading}
 */
function readingFor(entry, finished, workout, routine, unit) {
  const cfg = { ...defaultConfig(entry.id), ...(entry.target || {}), id: entry.id }
  const { prescription, step, progress } = judgeNextPrescription(finished, cfg, routine)
  return {
    id: entry.id,
    entry,
    d: workout.d,
    routineId: workout.routineId,
    prescription,
    step,
    progress,
    unit,
    cfg,
    judged: readSession(entry, cfg, workout, unit),
    plan: freezePrescriptionRecord(prescription)
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
  const { finished, unit, routine } = judgingContext(S, workout, !!logged)

  /** @type {Record<string, ProspectiveReading>} */
  const byEntry = {}
  /** @type {ProspectiveReading[]} */
  const items = []
  for (const entry of workout.entries) {
    const reading = readingFor(entry, finished, workout, routine, unit)
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
