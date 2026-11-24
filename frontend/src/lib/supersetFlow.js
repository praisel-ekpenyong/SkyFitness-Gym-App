import { hasWork, isEntryIndex } from './workout-model.js'
import { doneWorkSets } from './workout-sets.js'

/** @typedef {import('./types.js').Entry} Entry */
/** @typedef {import('./types.js').Target} Target */

/**
 * @param {Entry} entry
 * @param {number} [previous=0]
 * @returns {{ isNew: boolean, highWater: number }}
 */
export function setProgressHighWater(entry, previous = 0) {
  const done = doneWorkSets(entry).length
  return { isNew: done > previous, highWater: Math.max(previous, done) }
}

/**
 * @param {Entry[]} entries
 * @param {number[]} unit
 * @param {number} fromIdx
 * @returns {{ unitDone: boolean, roundDone: boolean, nextIdx: number | null } | null}
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
 * Strip orphaned superset group IDs from `ex`.
 * @param {Array<Entry | Target> | null | undefined} ex
 */
export function cleanupSg(ex) {
  if (!Array.isArray(ex)) return
  ex.forEach((e, i) => {
    if (e.sg && !(ex[i - 1]?.sg === e.sg || ex[i + 1]?.sg === e.sg)) delete e.sg
  })
}

/**
 * @param {Array<Entry | Target>} items
 * @param {number} idx
 * @returns {number[]}
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
 * @param {Array<Entry | Target>} items
 * @param {number} first
 * @param {number} second
 * @returns {string}
 */
function freshSg(items, first, second) {
  const base = `sg-${Math.min(first, second)}-${Math.max(first, second)}`
  let sg = base
  let n = 2
  while (items.some(e => e.sg === sg)) sg = `${base}-${n++}`
  return sg
}

/**
 * Says whether two Entries can be paired into a superset: both exist and sit next to each other.
 * @param {Array<Entry | Target> | null | undefined} items - The Entries.
 * @param {unknown} first - Index of one Entry.
 * @param {unknown} second - Index of the other.
 * @returns {boolean} True exactly when `pairAdjacent(items, first, second)` would not throw.
 */
export const canPair = (items, first, second) =>
  isEntryIndex(items, first) && isEntryIndex(items, second) && typeof first === 'number' && typeof second === 'number' && Math.abs(first - second) === 1

/**
 * Says whether an Entry can be taken out of its superset: it exists.
 * @param {Array<Entry | Target> | null | undefined} items - The Entries.
 * @param {unknown} idx - Index of the Entry.
 * @returns {boolean} True exactly when `unpairSuperset(items, idx)` would not throw.
 */
export const canUnpair = (items, idx) => isEntryIndex(items, idx)

/**
 * @template {Entry | Target} T
 * @param {T[]} items
 * @param {number} first
 * @param {number} second
 * @param {string} [groupId]
 * @returns {T[]}
 */
export function pairAdjacent(items, first, second, groupId) {
  if (!Array.isArray(items)) throw new TypeError('Superset entries must be an array')
  if (!canPair(items, first, second)) throw new RangeError('Superset entries must be two adjacent Entries')

  const next = items.map(e => ({ ...e }))
  const left = Math.min(first, second)
  const right = Math.max(first, second)
  const group = groupId || next[left].sg || next[right].sg || freshSg(next, left, right)
  const members = new Set([...contiguousSgGroup(next, left), ...contiguousSgGroup(next, right)])
  members.forEach(i => { next[i].sg = group })
  return next
}

/**
 * @template {Entry | Target} T
 * @param {T[]} items
 * @param {number} idx
 * @returns {T[]}
 */
export function unpairSuperset(items, idx) {
  if (!Array.isArray(items)) throw new TypeError('Superset entries must be an array')
  if (!canUnpair(items, idx)) throw new RangeError('Superset entry index is invalid')
  const next = items.map(e => ({ ...e }))
  delete next[idx].sg
  next.forEach((e, i) => {
    if (e.sg && !(next[i - 1]?.sg === e.sg || next[i + 1]?.sg === e.sg)) delete e.sg
  })
  return next
}

/**
 * @param {Array<Entry | Target> | null | undefined} items
 * @returns {number[][]}
 */
export function supersetUnits(items) {
  if (!Array.isArray(items)) return []
  /** @type {number[][]} */
  const units = []
  items.forEach((e, i) => {
    const prev = items[i - 1]
    if (i > 0 && e.sg && prev && prev.sg && e.sg === prev.sg) units[units.length - 1].push(i)
    else units.push([i])
  })
  return units
}

/**
 * @param {number[][]} units
 * @param {number} idx
 * @returns {number[]}
 */
export function unitOf(units, idx) { return (units || []).find(u => u.includes(idx)) || [idx] }
