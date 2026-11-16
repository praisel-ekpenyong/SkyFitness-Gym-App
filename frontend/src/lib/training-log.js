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

const sessionIndexes = new WeakMap()

const isPerformedWork = set => !!set?.done && !isWarmupRow(set)

const startOf = workout => {
  const n = Number(workout?.start ?? workout?.t)
  return Number.isFinite(n) ? n : 0
}

const isLater = (a, b) => {
  if (!b) return true
  const da = String(a.d ?? '')
  const db = String(b.d ?? '')
  if (da !== db) return da > db
  return startOf(a) >= startOf(b)
}

function sessionIndexFor(workouts) {
  let index = sessionIndexes.get(workouts)
  if (!index) {
    index = new Map()
    sessionIndexes.set(workouts, index)
    const keep = (slot, session) => (isLater(session.workout, slot?.workout) ? session : slot)
    for (const workout of workouts) {
      const entries = workout?.entries || []
      for (const exId of new Set(entries.map(e => e?.id))) {
        const performed = entries.some(e => e?.id === exId && Array.isArray(e.sets) && e.sets.some(isPerformedWork))
        if (!performed) continue
        let slots = index.get(exId)
        if (!slots) index.set(exId, slots = { any: null, byRoutine: new Map(), latest: null })
        if (isLater(workout, slots.latest)) slots.latest = workout
        const entry = entries.find(e => e?.id === exId)
        const sets = Array.isArray(entry?.sets) ? entry.sets.filter(isPerformedWork) : []
        if (!sets.length) continue
        const session = { workout, sets, target: entry.target || null }
        slots.any = keep(slots.any, session)
        if (workout.routineId != null) slots.byRoutine.set(workout.routineId, keep(slots.byRoutine.get(workout.routineId), session))
      }
    }
  }
  return index
}

const publicSession = session => (session ? { d: session.workout.d, sets: session.sets, target: session.target } : null)

/**
 * Last session: the latest Workout holding a performed Work set of the exercise, any Routine.
 * Date order, then start time; later array position breaks an exact tie.
 *
 * @param {Object} S - Profile; its `workouts` array is the Training log.
 * @param {string} exId - Exercise id.
 * @returns {{d: string, sets: Object[], target: Object|null}|null} Date, performed Work sets and target, or null.
 */
export function lastSession(S, exId) {
  if (!S || !exId || !Array.isArray(S.workouts)) return null
  return publicSession(sessionIndexFor(S.workouts).get(exId)?.any)
}

/**
 * Last session within one Routine. Strict: null when that Routine never held the exercise.
 * Without a routineId it answers like lastSession.
 *
 * @param {Object} S - Profile.
 * @param {string} exId - Exercise id.
 * @param {string|null} routineId - Routine id.
 * @returns {{d: string, sets: Object[], target: Object|null}|null}
 */
export function lastSessionInRoutine(S, exId, routineId) {
  if (!routineId) return lastSession(S, exId)
  if (!S || !exId || !Array.isArray(S.workouts)) return null
  return publicSession(sessionIndexFor(S.workouts).get(exId)?.byRoutine.get(routineId))
}

/**
 * Latest Work set time: when the exercise's latest performed Work set happened.
 * Warm-up and unperformed Sets do not count.
 *
 * @param {Object} S - Profile.
 * @param {string} exId - Exercise id.
 * @returns {number|null} Workout start timestamp in ms (date midnight when unstamped), or null.
 */
export function latestWorkSetAt(S, exId) {
  if (!S || !exId || !Array.isArray(S.workouts)) return null
  const workout = sessionIndexFor(S.workouts).get(exId)?.latest
  if (!workout) return null
  const stamped = Number(workout.start ?? workout.t)
  const ts = workout.start != null || workout.t != null ? stamped : NaN
  if (Number.isFinite(ts)) return ts
  const dated = new Date(workout.d).getTime()
  return Number.isFinite(dated) ? dated : null
}

/**
 * Last Workout of a Routine: the latest finished Workout run from it, whatever it held.
 * Date order, then start time. Home's "Last time" line reads it.
 *
 * @param {Object} S - Profile.
 * @param {string} routineId - Routine id.
 * @returns {Object|null} The Workout, or null when the Routine was never run.
 */
export function lastWorkoutInRoutine(S, routineId) {
  if (!S || !routineId || !Array.isArray(S.workouts)) return null
  let latest = null
  for (const workout of S.workouts) {
    if (workout?.routineId === routineId && isLater(workout, latest)) latest = workout
  }
  return latest
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
