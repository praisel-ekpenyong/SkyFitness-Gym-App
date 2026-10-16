// Pure decisions for the active-workout superset flow.
//
// Governs contiguous superset grouping, partner pairing/unpairing, high-water
// mark progress tracking, and round/unit navigation across active exercises.
// Keeping these pure and decoupled from React/Zustand guarantees deterministic
// testing for uneven rounds, wrap-around navigation, and warm-up set exclusion.
import { hasWork, isWarmupRow } from './workout-model.js'

/**
 * Update the high-water mark of completed work sets for superset progression.
 *
 * Progress is only recognized when completed work sets strictly exceed the
 * previous high-water mark in the current mounted session. Warm-up sets are ignored.
 *
 * @param {Object} entry - Active workout entry.
 * @param {number} [previous=0] - Previous maximum completed work set count.
 * @returns {{ isNew: boolean, highWater: number }}
 */
export function setProgressHighWater(entry, previous = 0) {
  const done = entry?.sets?.reduce((count, set) => count + (set.done && !isWarmupRow(set) ? 1 : 0), 0) || 0
  return { isNew: done > previous, highWater: Math.max(previous, done) }
}

/**
 * Determine the next exercise navigation target after completing a set in a superset unit.
 *
 * Navigation rules:
 * - Exhausted members (no remaining work) are skipped across the wrap.
 * - A round is complete when no subsequent member in display order has remaining work.
 * - A unit is complete when all members have completed all work sets.
 *
 * @param {Array<Object>} entries - Active workout entries array.
 * @param {number[]} unit - Array of entry indices in the active superset unit.
 * @param {number} fromIdx - Index of the entry just performed.
 * @returns {{ unitDone: boolean, roundDone: boolean, nextIdx: number|null } | null}
 *   Navigation descriptor, or null if the unit is invalid or a singleton.
 */
export function supersetFlowStep(entries, unit, fromIdx) {
  if (!Array.isArray(entries) || !Array.isArray(unit) || unit.length <= 1) return null
  const pos = unit.indexOf(fromIdx)
  if (pos < 0) return null

  const unitDone = !unit.some(idx => hasWork(entries, idx))
  if (unitDone) return { unitDone: true, roundDone: false, nextIdx: null }

  const wrapped = [...unit.slice(pos + 1), ...unit.slice(0, pos + 1)]
  const nextIdx = wrapped.find(idx => hasWork(entries, idx)) ?? null
  const roundDone = !unit.slice(pos + 1).some(idx => hasWork(entries, idx))
  return { unitDone: false, roundDone, nextIdx }
}

/**
 * Remove lone superset group tags (`sg`) that lack an adjacent partner.
 * Mutates `ex` in-place after exercise deletion, reordering, or unpairing.
 *
 * @param {Array<Object>} ex - Array of routine exercises or workout entries.
 */
export function cleanupSg(ex) {
  if (!Array.isArray(ex)) return
  ex.forEach((e, i) => {
    if (e.sg && !(ex[i - 1]?.sg === e.sg || ex[i + 1]?.sg === e.sg)) delete e.sg
  })
}

/**
 * Find the contiguous index range of entries sharing the superset group of `idx`.
 *
 * Non-adjacent entries with the same `sg` ID are intentionally excluded:
 * superset display semantics require adjacency.
 *
 * @param {Array<Object>} items - Array of exercise or entry objects.
 * @param {number} idx - Anchor entry index.
 * @returns {number[]} Contiguous array of matching indices (at least `[idx]`).
 */
function contiguousSgGroup(items, idx) {
  const sg = items[idx]?.sg
  if (!sg) return [idx]
  let first = idx
  let last = idx
  while (first > 0 && items[first - 1]?.sg === sg) first--
  while (last + 1 < items.length && items[last + 1]?.sg === sg) last++
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

/**
 * Generate a unique superset group identifier for a newly paired pair of entries.
 *
 * @param {Array<Object>} items - Array of existing entry objects.
 * @param {number} first - First entry index.
 * @param {number} second - Second entry index.
 * @returns {string} Unique group identifier string (e.g. 'sg-0-1' or 'sg-0-1-2').
 */
function freshSg(items, first, second) {
  const base = `sg-${Math.min(first, second)}-${Math.max(first, second)}`
  let sg = base
  let n = 2
  while (items.some(e => e.sg === sg)) sg = `${base}-${n++}`
  return sg
}

/**
 * Pair two adjacent entries into a unified superset group.
 *
 * Merges existing contiguous groups if either entry is already part of one.
 * Pure function: returns a cloned array of items with updated `sg` identifiers.
 *
 * @param {Array<Object>} items - Array of routine exercises or entry objects.
 * @param {number} first - Index of first entry.
 * @param {number} second - Index of second entry (must satisfy `|first - second| === 1`).
 * @param {string} [groupId] - Optional explicit group ID (e.g., when restoring known state).
 * @throws {TypeError} If items is not an array.
 * @throws {RangeError} If indices are out of range or not adjacent.
 * @returns {Array<Object>} New array of entries with paired superset IDs.
 */
export function pairAdjacent(items, first, second, groupId) {
  if (!Array.isArray(items)) throw new TypeError('Superset entries must be an array')
  if (!Number.isInteger(first) || !Number.isInteger(second) || !items[first] || !items[second]) {
    throw new RangeError('Superset entry indexes are invalid')
  }
  if (Math.abs(first - second) !== 1) throw new RangeError('Superset entries must be adjacent')

  const next = items.map(e => ({ ...e }))
  const left = Math.min(first, second)
  const right = Math.max(first, second)
  const group = groupId || next[left].sg || next[right].sg || freshSg(next, left, right)
  const members = new Set([...contiguousSgGroup(next, left), ...contiguousSgGroup(next, right)])
  members.forEach(i => { next[i].sg = group })
  return next
}

/**
 * Remove an entry from its superset group and prune orphaned singletons.
 *
 * Pure function: returns a cloned array of items with the entry ungrouped
 * and any resulting lone partner IDs cleaned.
 *
 * @param {Array<Object>} items - Array of routine exercises or entry objects.
 * @param {number} idx - Index of the entry to unpair.
 * @throws {TypeError} If items is not an array.
 * @throws {RangeError} If idx is out of range.
 * @returns {Array<Object>} New array of entries with updated superset assignments.
 */
export function unpairSuperset(items, idx) {
  if (!Array.isArray(items)) throw new TypeError('Superset entries must be an array')
  if (!Number.isInteger(idx) || !items[idx]) throw new RangeError('Superset entry index is invalid')
  const next = items.map(e => ({ ...e }))
  delete next[idx].sg
  next.forEach((e, i) => {
    if (e.sg && !(next[i - 1]?.sg === e.sg || next[i + 1]?.sg === e.sg)) delete e.sg
  })
  return next
}

/**
 * Partition an entry array into contiguous superset units.
 *
 * Consecutive entries sharing an `sg` ID are grouped into an index array;
 * standalone entries form single-element arrays `[i]`.
 *
 * @param {Array<Object>} items - Routine exercises or active workout entries.
 * @returns {Array<number[]>} Array of units (each an array of entry indices).
 */
export function supersetUnits(items) {
  if (!Array.isArray(items)) return []
  const units = []
  items.forEach((e, i) => {
    const prev = items[i - 1]
    if (i > 0 && e.sg && prev && prev.sg && e.sg === prev.sg) units[units.length - 1].push(i)
    else units.push([i])
  })
  return units
}

/**
 * Find the superset unit (array of entry indices) containing `idx`.
 * Falls back to `[idx]` (a single-exercise unit) if ungrouped.
 *
 * @param {Array<number[]>} units - Partitioned units array from `supersetUnits`.
 * @param {number} idx - Target entry index.
 * @returns {number[]} Array of entry indices representing the unit.
 */
export function unitOf(units, idx) { return (units || []).find(u => u.includes(idx)) || [idx] }
