// Active session construction — one slice of the active-workout lifecycle.
//
// Builds the Active workout, moves the cursor, discards the session, and
// adds/removes Entry objects. Set-level surgery lives in active-sets.js,
// the toggle decision in active-toggle.js, finishing in active-finish.js.
import { buildSets, defaultConfig } from './workout-model.js'
import { nextPrescription, applyPrescription } from './progression.js'
import { uid, todayISO } from './format.js'
import { t } from './i18n.js'
import { cleanupSg } from './supersetFlow.js'

// Seed rows for a new Prescription. A new Progression stream keeps the Routine's own last
// working weight but starts at the plan's top reps/seconds; reading the global `exWeights`
// hint here would import another Routine's heavier history into this one.
function seedSets(S, cfg, routineId, plan) {
  return buildSets(S, cfg, {
    routineId,
    seedWeightOnly: plan.kind === 'first',
  })
}

/**
 * Construct a fresh active workout session object from a routine or as freestyle.
 *
 * Pure factory function: initializes targets, derives progression prescriptions, and generates
 * initial set rows without mutating state atom `S`.
 *
 * @param {Object} S - Application state atom containing routines and preferences.
 * @param {string|null} routineId - ID of routine to instantiate, or null for a freestyle workout.
 * @param {number|null} [bw=null] - Current body weight at workout start (in active units).
 * @param {Object} [opts] - Injectable clock and ID generators for deterministic testing.
 * @param {() => string} [opts.todayISO] - Calendar date supplier ('YYYY-MM-DD').
 * @param {() => string} [opts.uid] - Unique session identifier generator.
 * @param {() => number} [opts.now] - Epoch millisecond timestamp supplier.
 * @returns {Object} Active workout session object (`S.active`).
 */
export function createActiveSession(S, routineId, bw, opts = {}) {
  const _today = opts.todayISO || todayISO
  const _uid = opts.uid || uid
  const _now = opts.now || Date.now
  const routine = routineId ? (S.routines || []).find(r => r.id === routineId) : null
  const entries = (routine ? routine.ex : []).map(cfg => {
    const plan = nextPrescription(S, cfg, routine)
    const sets = applyPrescription(seedSets(S, cfg, routine?.id, plan), plan)
    return { id: cfg.id, sg: cfg.sg, target: { ...cfg }, plan, sets }
  })
  return {
    id: _uid(),
    d: _today(),
    start: _now(),
    routineId: routine ? routine.id : null,
    name: routine ? routine.name : t('Freestyle'),
    bw: bw || null,
    unit: S?.unit || 'kg',
    cur: 0,
    entries,
  }
}

/**
 * Set the index of the currently viewed exercise in the active session.
 *
 * Mutates `S.active.cur` in-place, clamping `idx` to valid entry bounds `[0, entries.length - 1]`.
 *
 * @param {Object} S - Application state atom.
 * @param {number} idx - Target exercise index.
 * @returns {boolean} True if index was successfully set; false if no active session exists.
 */
export function setActiveIndex(S, idx) {
  if (!S?.active || !Array.isArray(S.active.entries)) return false
  const bounded = Math.max(0, Math.min(idx, S.active.entries.length - 1))
  S.active.cur = bounded
  return true
}

/**
 * Abort and clear the current active workout session.
 *
 * Mutates `S.active` to null in-place, discarding all in-progress sets.
 *
 * @param {Object} S - Application state atom.
 * @returns {boolean} True if state was mutated, false if `S` was null.
 */
export function discardActiveSession(S) {
  if (!S) return false
  S.active = null
  return true
}

/**
 * Append an exercise entry to the active workout session.
 *
 * For routine-backed workouts, applies progression prescriptions; for freestyle workouts,
 * seeds targets from historical performance (`preferLast: true`). Clamps active index `cur`
 * to the new entry. Mutates `S.active` in-place.
 *
 * @param {Object} S - Application state atom.
 * @param {string} exId - Exercise identifier from EXIDX.
 * @param {Object} [targetCfg={}] - Target configuration overrides (sets, reps, weight, progression).
 * @returns {Object|null} The newly created entry, or null if no active workout exists.
 */
export function addActiveExercise(S, exId, targetCfg = {}) {
  if (!S?.active) return null
  const routine = S.active.routineId ? (S.routines || []).find(r => r.id === S.active.routineId) : null
  const freestyle = !S.active.routineId
  const full = { ...defaultConfig(exId), ...targetCfg, id: exId }
  const plan = freestyle ? null : nextPrescription(S, full, routine)
  const baseSets = freestyle
    ? buildSets(S, full, { preferLast: true })
    : seedSets(S, full, S.active.routineId, plan)
  const sets = freestyle ? baseSets : applyPrescription(baseSets, plan)
  const entry = { id: exId, target: { ...targetCfg }, plan, sets }
  if (!Array.isArray(S.active.entries)) S.active.entries = []
  S.active.entries.push(entry)
  S.active.cur = S.active.entries.length - 1
  return entry
}

/**
 * Remove an exercise from an active workout session by index.
 *
 * Deletes the entry, prunes orphaned superset IDs via `cleanupSg`, and bounds `active.cur`
 * to the remaining entries. Mutates `S.active` in-place.
 *
 * @param {Object} S - Application state atom.
 * @param {number} idx - 0-based index of the entry to remove.
 * @returns {boolean} True if entry was removed, false if index is out of bounds or no active session.
 */
export function removeActiveExercise(S, idx) {
  if (!S?.active || !Array.isArray(S.active.entries)) return false
  if (idx < 0 || idx >= S.active.entries.length) return false
  S.active.entries.splice(idx, 1)
  cleanupSg(S.active.entries)
  if (idx < S.active.cur) S.active.cur--
  if (S.active.cur >= S.active.entries.length) {
    S.active.cur = Math.max(0, S.active.entries.length - 1)
  }
  return true
}

/**
 * Replace an exercise in the active workout session in-place.
 *
 * Replaces `S.active.entries[idx]` with the new exercise, inherits the outgoing entry's `sg`
 * (superset group) if present, clears previous progression and working-weight prompt flags
 * (`asked`, `hw`, `topW`), clamps `S.active.cur` to `idx`, and seeds fresh set rows matching
 * the new exercise's progression stream (or freestyle defaults). Leaves `S.routines` untouched.
 *
 * @param {Object} S - Application state atom.
 * @param {number} idx - Index of the active exercise entry to replace.
 * @param {string} newExId - Exercise identifier from EXIDX.
 * @param {Object} [targetCfg={}] - Target configuration overrides (sets, reps, weight, progression).
 * @returns {Object|null} The newly created entry, or null if invalid index or no active workout.
 */
export function replaceActiveExercise(S, idx, newExId, targetCfg = {}) {
  if (!S?.active || !Array.isArray(S.active.entries)) return null
  if (idx < 0 || idx >= S.active.entries.length) return null
  if (!newExId) return null

  const oldEntry = S.active.entries[idx]
  const routine = S.active.routineId ? (S.routines || []).find(r => r.id === S.active.routineId) : null
  const freestyle = !S.active.routineId
  const full = { ...defaultConfig(newExId), ...targetCfg, id: newExId }
  const plan = freestyle ? null : nextPrescription(S, full, routine)
  const baseSets = freestyle
    ? buildSets(S, full, { preferLast: true })
    : seedSets(S, full, S.active.routineId, plan)
  const sets = freestyle ? baseSets : applyPrescription(baseSets, plan)

  const entry = { id: newExId, target: { ...targetCfg }, plan, sets }
  if (oldEntry && oldEntry.sg != null) {
    entry.sg = oldEntry.sg
  }

  S.active.entries[idx] = entry
  S.active.cur = Math.max(0, Math.min(idx, S.active.entries.length - 1))
  return entry
}

