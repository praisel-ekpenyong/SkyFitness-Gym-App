import { isWarmupRow } from './warmup.js'
import { resolveSetWeight, normalizeWeight, round1 } from './units.js'

const indexes = new WeakMap()

function bestOfEntry(entry, workout, unit) {
  const sets = Array.isArray(entry?.sets) ? entry.sets : []
  let top = 0
  for (const set of sets) {
    if (!set?.done || isWarmupRow(set)) continue
    const w = resolveSetWeight(set, entry, workout, unit)
    if (w > top) top = w
  }
  const legacy = Number(entry?.topW)
  const mode = entry?.target?.mode
  if (Number.isFinite(legacy) && legacy > top && (!mode || mode === 'reps') && !sets.some(isWarmupRow)) {
    top = Math.max(top, normalizeWeight(legacy, entry?.unit ?? workout?.unit ?? unit, unit))
  }
  return top
}

function indexFor(workouts, unit) {
  let byUnit = indexes.get(workouts)
  if (!byUnit) indexes.set(workouts, byUnit = new Map())
  let index = byUnit.get(unit)
  if (!index) {
    byUnit.set(unit, index = new Map())
    for (const workout of workouts) {
      for (const entry of workout?.entries || []) {
        const top = bestOfEntry(entry, workout, unit)
        if (top > (index.get(entry?.id) || 0)) index.set(entry.id, top)
      }
    }
  }
  return index
}

/**
 * Best: the heaviest performed Work set of an exercise across the Training log, in the Profile's unit.
 *
 * @param {Object} S - Profile; its `workouts` array is the Training log and `unit` the answer's unit.
 * @param {string} exId - Exercise id; deleted custom exercises still answer from their Workouts.
 * @returns {number} Weight rounded to 0.1, or 0 when nothing was performed.
 */
export function best(S, exId) {
  if (!S || !exId || !Array.isArray(S.workouts)) return 0
  return round1(indexFor(S.workouts, S.unit || 'kg').get(exId) || 0)
}

/**
 * Tonnage: load x reps of the performed Work sets of one Workout, in the Profile's unit.
 * A warm-up Set is excluded even when performed.
 *
 * @param {Object} S - Profile; `unit` is the answer's unit.
 * @param {Object} workout - A Workout, in whatever unit it was logged in.
 * @returns {number} Tonnage rounded to 0.1, or 0 when nothing was performed.
 */
export function tonnage(S, workout) {
  const unit = S?.unit || 'kg'
  let total = 0
  for (const entry of workout?.entries || []) {
    for (const set of Array.isArray(entry?.sets) ? entry.sets : []) {
      if (!set?.done || isWarmupRow(set)) continue
      total += resolveSetWeight(set, entry, workout, unit) * (set.r || 0)
    }
  }
  return round1(total)
}
