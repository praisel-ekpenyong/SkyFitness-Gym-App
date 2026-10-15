// In-session set surgery — one slice of the active-workout lifecycle.
//
// Field edits with weight cascading, work/warm-up Row add/remove, and
// superset pairing. Session construction lives in active-session.js,
// the toggle decision in active-toggle.js, finishing in active-finish.js.
import {
  modeOf, makeRow,
  insertWarmupRow, removeRowAt, cascadeWeight
} from './workout-model.js'
import { pairAdjacent, unpairSuperset } from './supersetFlow.js'

/**
 * Update a single property on a set row, with automatic forward weight cascading.
 *
 * When updating load (`field === 'w'`), changes cascade forward to subsequent uncompleted
 * work sets in the entry via `cascadeWeight`. Mutates `S.active` in-place.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of target exercise entry.
 * @param {number} setIdx - Index of set row within entry.
 * @param {string} field - Property key to modify (e.g., 'w', 'r', 'sec', 'rpe').
 * @param {*} value - New value to assign; `null` or `undefined` deletes the property.
 * @returns {boolean} True if mutation succeeded, false if entry or set was not found.
 */
export function updateActiveSetField(S, entryIdx, setIdx, field, value) {
  const entry = S?.active?.entries?.[entryIdx]
  if (!entry || !entry.sets?.[setIdx]) return false
  if (value == null) delete entry.sets[setIdx][field]
  else entry.sets[setIdx][field] = value
  if (field === 'w') {
    entry.sets = cascadeWeight(entry.sets, setIdx, value)
  }
  return true
}

/**
 * Append a new work set row to an active exercise entry.
 *
 * Clones target properties and defaults from the preceding row. Mutates `S.active` in-place.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of target exercise entry.
 * @returns {boolean} True if set was appended, false if entry was not found.
 */
export function addActiveSet(S, entryIdx) {
  const entry = S?.active?.entries?.[entryIdx]
  if (!entry) return false
  const l = entry.sets[entry.sets.length - 1] || null
  const m = modeOf({ ...(entry.target || {}), id: entry.id })
  entry.sets.push(makeRow(m, entry.target || {}, { prev: l }))
  return true
}

/**
 * Remove a set row from an active exercise entry while preserving at least one row.
 *
 * If `setIdx` is omitted, pops the last set. Will not remove the last remaining set in an entry.
 * Mutates `S.active` in-place.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of target exercise entry.
 * @param {number|null} [setIdx=null] - Index of specific set to remove; null removes trailing set.
 * @returns {boolean} True if set was removed, false if entry is missing or only 1 set remains.
 */
export function removeActiveSet(S, entryIdx, setIdx = null) {
  const entry = S?.active?.entries?.[entryIdx]
  if (!entry || entry.sets.length <= 1) return false
  if (setIdx == null) {
    entry.sets.pop()
  } else {
    entry.sets = removeRowAt(entry.sets, setIdx)
  }
  return true
}

/**
 * Insert a warm-up row before the first work row in an active exercise entry.
 *
 * Warm-up rows are marked with `warmup: true` and excluded from volume calculations, PR checks,
 * and completion judgments. Mutates `S.active` in-place.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of target exercise entry.
 * @returns {boolean} True if warm-up row was inserted, false if entry was not found.
 */
export function addActiveWarmup(S, entryIdx) {
  const entry = S?.active?.entries?.[entryIdx]
  if (!entry) return false
  const m = modeOf({ ...(entry.target || {}), id: entry.id })
  entry.sets = insertWarmupRow(entry.sets, m, entry.target || {})
  return true
}

/**
 * Pair two adjacent active exercise entries into a superset group.
 *
 * Mutates `S.active.entries` in-place using `pairAdjacent`.
 *
 * @param {Object} S - Application state atom.
 * @param {number} firstIdx - Index of first entry.
 * @param {number} secondIdx - Index of adjacent second entry (`|firstIdx - secondIdx| === 1`).
 * @returns {boolean} True if pairing succeeded, false if active entries are missing.
 */
export function pairActiveSuperset(S, firstIdx, secondIdx) {
  if (!S?.active?.entries) return false
  S.active.entries = pairAdjacent(S.active.entries, firstIdx, secondIdx)
  return true
}

/**
 * Dissolve superset membership for an active exercise entry.
 *
 * Prunes orphaned singleton partner groups via `unpairSuperset`. Mutates `S.active.entries` in-place.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of entry to ungroup.
 * @returns {boolean} True if unpairing succeeded, false if active entries are missing.
 */
export function unpairActiveSuperset(S, entryIdx) {
  if (!S?.active?.entries) return false
  S.active.entries = unpairSuperset(S.active.entries, entryIdx)
  return true
}
