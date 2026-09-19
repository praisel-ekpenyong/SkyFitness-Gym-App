// Pure decisions for the active-workout superset flow. Keeping these independent of React and
// the stores makes the uneven-round and re-check rules explicit and directly testable.
import { isWarmupRow } from './workout-model.js'

const hasWork = (entries, idx) => !!entries[idx]?.sets?.some(set => !set.done && !isWarmupRow(set))

// A completion is new progress only when it takes this exercise beyond the largest number of
// simultaneously completed _work_ sets seen in this mounted session. Warm-ups are excluded
// from every metric, so they must not drive superset navigation either.
export function setProgressHighWater(entry, previous = 0) {
  const done = entry?.sets?.reduce((count, set) => count + (set.done && !isWarmupRow(set) ? 1 : 0), 0) || 0
  return { isNew: done > previous, highWater: Math.max(previous, done) }
}

// Decide where a newly completed superset set goes next. Spent members are skipped, including
// across the wrap. A round ends when no later member in display order has work left; this makes
// the last *active* member the boundary rather than blindly using the group's last array index.
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

// Drop superset ids that no longer have an adjacent partner (after unlink/reorder/remove).
export function cleanupSg(ex) {
  if (!Array.isArray(ex)) return
  ex.forEach((e, i) => {
    if (e.sg && !(ex[i - 1]?.sg === e.sg || ex[i + 1]?.sg === e.sg)) delete e.sg
  })
}

// Return the contiguous run around an entry that shares its superset id. A repeated id in a
// separated part of the list is deliberately not included: the display semantics are adjacent
// entries sharing one id, not every entry that happens to carry that id.
function contiguousSgGroup(items, idx) {
  const sg = items[idx]?.sg
  if (!sg) return [idx]
  let first = idx
  let last = idx
  while (first > 0 && items[first - 1]?.sg === sg) first--
  while (last + 1 < items.length && items[last + 1]?.sg === sg) last++
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

function freshSg(items, first, second) {
  const base = `sg-${Math.min(first, second)}-${Math.max(first, second)}`
  let sg = base
  let n = 2
  while (items.some(e => e.sg === sg)) sg = `${base}-${n++}`
  return sg
}

// Purely pair two adjacent entries. Existing contiguous groups on either side are merged, so
// pairing the end of one group with the start of another produces one display unit. A caller can
// provide a group id (useful when restoring a known id); otherwise an existing id is preferred,
// with a deterministic unused id for two previously ungrouped entries.
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

// Remove one entry from its superset and clean any ids that no longer have an adjacent partner.
// This is pure so the active workout can replace its entries atomically through the store.
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

// Group consecutive items sharing a superset id (sg) into "units" of indices.
// items may be routine exercises ({sg}) or active-workout entries ({sg}).
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

export function unitOf(units, idx) { return (units || []).find(u => u.includes(idx)) || [idx] }
