// Restore admission: what a backup file must look like, and the cleaning it gets before
// normalizeState turns it into a Profile (ADR 0027).

import { RESTORE_TOP_KEYS } from './restore-keys.js'
import { isNewerProfile } from './upgrades.js'
import { isRecord } from './plain.js'

/**
 * Throws unless the payload has the shape of a Sky backup (an object with workouts and routines arrays)
 * that this Sky can read. A backup from a newer Sky is refused before its shape is judged.
 * @param {*} data - Parsed backup file.
 * @returns {true} When the payload looks like a backup.
 */
export function validateBackup(data) {
  if (isNewerProfile(data)) throw new Error('this backup is from a newer version of Sky. Update Sky, then import it again')
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.workouts) || !Array.isArray(data.routines)) {
    throw new Error('not a Sky backup')
  }
  return true
}

const isGoodWorkoutEntry = e => isRecord(e) && typeof e.id === 'string' && e.id.length > 0 && Array.isArray(e.sets)
const isGoodWorkout = w => isRecord(w) && Array.isArray(w.entries)
const isGoodRoutineEx = e => isRecord(e) && typeof e.id === 'string' && e.id.length > 0
const isGoodRoutine = r => isRecord(r) && typeof r.id === 'string' && r.id.length > 0 && Array.isArray(r.ex)

/**
 * Strips malformed Workouts, Entries and Routines from a backup, keeps only the keys a Restore
 * copies, clears the Active workout and drops Day overrides that point at a removed Routine.
 * Field values are not cleaned here: the payload goes on to `normalizeState`, which cleans them once.
 * @param {*} data - Raw backup payload; non-objects pass through unchanged.
 * @returns {{clean: *, skipped: number}} The cleaned payload and how many records were dropped.
 */
export function sanitizeRestorePayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { clean: data, skipped: 0 }
  let skipped = 0
  let workouts
  if (Array.isArray(data.workouts)) {
    workouts = []
    for (const w of data.workouts) {
      if (!isGoodWorkout(w)) { skipped++; continue }
      const entries = []
      for (const e of w.entries) {
        if (!isGoodWorkoutEntry(e)) { skipped++; continue }
        entries.push(e)
      }
      workouts.push({ ...w, entries })
    }
  }
  let routines
  if (Array.isArray(data.routines)) {
    routines = []
    for (const r of data.routines) {
      if (!isGoodRoutine(r)) { skipped++; continue }
      const ex = []
      for (const e of r.ex) {
        if (!isGoodRoutineEx(e)) { skipped++; continue }
        ex.push(e)
      }
      routines.push({ ...r, ex })
    }
  }
  const clean = { active: null }
  for (const k of RESTORE_TOP_KEYS) {
    if (data[k] !== undefined) clean[k] = data[k]
  }
  if (workouts !== undefined) clean.workouts = workouts
  if (routines !== undefined) {
    clean.routines = routines
    const ids = new Set(routines.map(r => r.id))
    if (data.dayPlan && typeof data.dayPlan === 'object' && !Array.isArray(data.dayPlan)) {
      const dayPlan = { ...data.dayPlan }
      for (const k of Object.keys(dayPlan)) {
        const v = dayPlan[k]
        if (v !== 'rest' && !ids.has(v)) delete dayPlan[k]
      }
      clean.dayPlan = dayPlan
    }
  }
  return { clean, skipped }
}

/**
 * Returns a backup-safe copy of a profile with malformed workouts and routines stripped.
 * @param {Object} data - Raw profile payload of any shape; non-objects pass through unchanged.
 * @returns {Object} Cleaned profile limited to known top-level keys with `active` cleared; stale day-plan overrides pruned.
 */
export function sanitizeBackup(data) {
  if (!data || typeof data !== 'object') return data
  return sanitizeRestorePayload(data).clean
}
