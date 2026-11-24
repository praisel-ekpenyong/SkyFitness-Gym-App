import { modeOf, makeRow, insertWarmupRow, removeRowAt, cascadeWeight } from './workout-model.js'
import { workSets } from './workout-sets.js'
import { pairAdjacent, unpairSuperset, canPair, canUnpair } from './supersetFlow.js'
import { isWarmupRow } from './warmup.js'
import { uid } from './format.js'

/**
 * A set row: one performance of an exercise. `id` is the stable key on screen.
 * @typedef {Object} SetRow
 * @property {string} [id]
 * @property {boolean} [done]
 * @property {string} [phase]
 * @property {number} [w]
 * @property {number} [r]
 */

/**
 * Gives a set row an id when it has none, and keeps every other field.
 * @param {SetRow} set - A set row.
 * @returns {SetRow} The same row when it already has an id, otherwise a copy with one.
 */
export function withSetId(set) {
  if (set && typeof set.id === 'string' && set.id) return set
  return { ...set, id: uid() }
}

/**
 * Pins the set a timed hold was started on, by meaning rather than position.
 * Rows shift while a hold runs (a warm-up is added in front, a set is removed), and
 * a whole new workout can replace this one, so a bare (entry, set) index is not enough.
 * @returns {Object|null} Reference for findHoldRow, or null when the row does not exist.
 */
export function holdRef(active, entryIdx, setIdx) {
  const entry = active?.entries?.[entryIdx]
  const row = entry?.sets?.[setIdx]
  if (!row) return null
  const warm = isWarmupRow(row)
  const nth = entry.sets.slice(0, setIdx).filter(s => isWarmupRow(s) === warm).length
  return { workout: active.id, layout: active.layout || 0, entryIdx, entryId: entry.id, warm, nth }
}

/**
 * Finds where a held set sits now.
 * @returns {number[]|null} [entryIdx, setIdx], or null when its workout, exercise or row is gone.
 */
export function findHoldRow(active, ref) {
  if (!ref || !active || active.id !== ref.workout || (active.layout || 0) !== ref.layout) return null
  const entry = active.entries?.[ref.entryIdx]
  if (!entry || entry.id !== ref.entryId) return null
  let n = -1
  for (let i = 0; i < entry.sets.length; i++) {
    if (isWarmupRow(entry.sets[i]) === ref.warm && ++n === ref.nth) return [ref.entryIdx, i]
  }
  return null
}

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

export function addActiveSet(S, entryIdx) {
  const entry = S?.active?.entries?.[entryIdx]
  if (!entry) return false
  const l = entry.sets[entry.sets.length - 1] || null
  const m = modeOf({ ...(entry.target || {}), id: entry.id })
  entry.sets.push(withSetId(makeRow(m, entry.target || {}, { prev: l })))
  return true
}

export function removeActiveSet(S, entryIdx, setIdx = null) {
  const entry = S?.active?.entries?.[entryIdx]
  if (!entry || entry.sets.length <= 1) return false
  if (setIdx == null) {
    entry.sets.pop()
  } else {
    entry.sets = removeRowAt(entry.sets, setIdx)
  }
  // The high-water mark can't exceed the Work sets left, or a set added in place of a removed one never rests.
  if (typeof entry.hw === 'number') entry.hw = Math.min(entry.hw, workSets(entry).length)
  return true
}

export function addActiveWarmup(S, entryIdx) {
  const entry = S?.active?.entries?.[entryIdx]
  if (!entry) return false
  const m = modeOf({ ...(entry.target || {}), id: entry.id })
  entry.sets = insertWarmupRow(entry.sets, m, entry.target || {}).map(withSetId)
  return true
}

export function pairActiveSuperset(S, firstIdx, secondIdx) {
  if (!canPair(S?.active?.entries, firstIdx, secondIdx)) return false
  S.active.entries = pairAdjacent(S.active.entries, firstIdx, secondIdx)
  return true
}

export function unpairActiveSuperset(S, entryIdx) {
  if (!canUnpair(S?.active?.entries, entryIdx)) return false
  S.active.entries = unpairSuperset(S.active.entries, entryIdx)
  return true
}
