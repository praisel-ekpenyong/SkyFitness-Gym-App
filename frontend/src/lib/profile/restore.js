
import { RESTORE_TOP_KEYS } from './restore-keys.js'
import { isNewerProfile } from './upgrades.js'
import { isRecord } from './plain.js'

/** @typedef {import('../types.js').Workout} Workout */
/** @typedef {import('../types.js').Entry} Entry */
/** @typedef {import('../types.js').Routine} Routine */
/** @typedef {import('../types.js').Target} Target */

/**
 * Throws unless the payload has the shape of a Sky backup (an object with workouts and routines arrays)
 * that this Sky can read. A backup from a newer Sky is refused before its shape is judged.
 * @param {unknown} data - Parsed backup file.
 * @returns {true} When the payload looks like a backup.
 */
export function validateBackup(data) {
  if (isNewerProfile(data)) throw new Error('this backup is from a newer version of Sky. Update Sky, then import it again')
  if (!isRecord(data) || !Array.isArray(data.workouts) || !Array.isArray(data.routines)) {
    throw new Error('not a Sky backup')
  }
  return true
}

/** @param {unknown} e @returns {e is Entry} */
const isGoodWorkoutEntry = e => isRecord(e) && typeof e.id === 'string' && e.id.length > 0 && Array.isArray(e.sets)
/** @param {unknown} w @returns {w is Workout} */
const isGoodWorkout = w => isRecord(w) && Array.isArray(w.entries)
/** @param {unknown} e @returns {e is Target} */
const isGoodRoutineEx = e => isRecord(e) && typeof e.id === 'string' && e.id.length > 0
/** @param {unknown} r @returns {r is Routine} */
const isGoodRoutine = r => isRecord(r) && typeof r.id === 'string' && r.id.length > 0 && Array.isArray(r.ex)

/**
 * Strips malformed Workouts, Entries and Routines from a backup, keeps only the keys a Restore
 * copies, clears the Active workout and drops Day overrides that point at a removed Routine.
 * Field values are not cleaned here: the payload goes on to `normalizeState`, which cleans them once.
 * @param {unknown} data - Raw backup payload; non-objects pass through unchanged.
 * @returns {{clean: Record<string, unknown> | unknown, skipped: number}} The cleaned payload and how many records were dropped.
 */
export function sanitizeRestorePayload(data) {
  if (!isRecord(data)) return { clean: data, skipped: 0 }
  let skipped = 0
  /** @type {Workout[] | undefined} */
  let workouts
  if (Array.isArray(data.workouts)) {
    workouts = []
    for (const w of data.workouts) {
      if (!isGoodWorkout(w)) { skipped++; continue }
      /** @type {Entry[]} */
      const entries = []
      for (const e of w.entries) {
        if (!isGoodWorkoutEntry(e)) { skipped++; continue }
        entries.push(e)
      }
      workouts.push({ ...w, entries })
    }
  }
  /** @type {Routine[] | undefined} */
  let routines
  if (Array.isArray(data.routines)) {
    routines = []
    for (const r of data.routines) {
      if (!isGoodRoutine(r)) { skipped++; continue }
      /** @type {Target[]} */
      const ex = []
      for (const e of r.ex) {
        if (!isGoodRoutineEx(e)) { skipped++; continue }
        ex.push(e)
      }
      routines.push({ ...r, ex })
    }
  }
  /** @type {Record<string, unknown>} */
  const clean = { active: null }
  for (const k of RESTORE_TOP_KEYS) {
    if (data[k] !== undefined) clean[k] = data[k]
  }
  if (workouts !== undefined) clean.workouts = workouts
  if (routines !== undefined) {
    clean.routines = routines
    const ids = new Set(routines.map(r => r.id))
    if (isRecord(data.dayPlan)) {
      /** @type {Record<string, unknown>} */
      const dayPlan = { ...data.dayPlan }
      for (const k of Object.keys(dayPlan)) {
        const v = dayPlan[k]
        if (v !== 'rest' && (typeof v !== 'string' || !ids.has(v))) delete dayPlan[k]
      }
      clean.dayPlan = dayPlan
    }
  }
  return { clean, skipped }
}

