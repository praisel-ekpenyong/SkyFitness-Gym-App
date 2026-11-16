import { isWarmupRow } from './warmup.js'
import { resolveSetWeight, normalizeWeight, round1 } from './units.js'
import { estimate1RM } from './onerm.js'
import { doneWorkSets } from './workout-model.js'

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

const timelines = new WeakMap()

function summarize(workout, unit) {
  const byEx = new Map()
  for (const entry of workout?.entries || []) {
    if (!entry?.id) continue
    const cur = byEx.get(entry.id) || { load: 0, loadSet: null, est: 0, estSet: null }
    let setTop = 0
    let topSet = null
    for (const set of doneWorkSets(entry)) {
      const w = resolveSetWeight(set, entry, workout, unit)
      if (w > setTop) { setTop = w; topSet = set }
      const est = estimate1RM(w, set.r)
      if (est != null && round1(est) > cur.est) { cur.est = round1(est); cur.estSet = { set, w } }
    }
    const load = round1(bestOfEntry(entry, workout, unit))
    if (load > cur.load) { cur.load = load; cur.loadSet = load > round1(setTop) ? null : topSet }
    byEx.set(entry.id, cur)
  }
  return byEx
}

function timelineFor(workouts, unit) {
  let byUnit = timelines.get(workouts)
  if (!byUnit) timelines.set(workouts, byUnit = new Map())
  let line = byUnit.get(unit)
  if (!line) {
    byUnit.set(unit, line = new Map())
    workouts.forEach((workout, pos) => {
      for (const [id, top] of summarize(workout, unit)) {
        if (!line.has(id)) line.set(id, [])
        line.get(id).push({ pos, d: String(workout?.d || ''), start: Number.isFinite(Number(workout?.start)) ? Number(workout.start) : 0, load: top.load, est: top.est })
      }
    })
  }
  return line
}

/**
 * Records: the exercises a Workout set a Record in, read from the Training log. A Record is the Workout's
 * heaviest Set (load) or best Estimated 1RM Set beating every earlier performed Work set; an exercise's first
 * performed session is a baseline and an exercise is judged once per Workout. Both kinds read as the load Record.
 *
 * @param {Object} S - Profile; its `workouts` array is the Training log and `unit` the answer's unit.
 * @param {Object} workout - A Workout, in the log or not yet added to it.
 * @returns {Array<{id:string, kind:'load'|'e1rm', set:Object|null, w:number, r:number, est:number, prev:number}>}
 *   One per exercise in Entry order; `set` is the Workout's own Set object (null for a legacy top weight),
 *   `w`/`r` its weight in the Profile's unit and reps, `est` its Estimated 1RM, `prev` the earlier Best (load) or best estimate (e1rm).
 */
export function records(S, workout) {
  if (!S || !workout || !Array.isArray(S.workouts)) return []
  const unit = S.unit || 'kg'
  const line = timelineFor(S.workouts, unit)
  const pos = S.workouts.indexOf(workout)
  const at = pos < 0 ? Infinity : pos
  const d = String(workout.d || '')
  const start = Number.isFinite(Number(workout.start)) ? Number(workout.start) : 0
  const out = []
  for (const [id, now] of summarize(workout, unit)) {
    let load = 0
    let est = 0
    let seen = false
    for (const p of line.get(id) || []) {
      const before = p.d !== d ? p.d < d : p.start !== start ? p.start < start : p.pos < at
      if (!before) continue
      if (p.load > 0 || p.est > 0) seen = true
      if (p.load > load) load = p.load
      if (p.est > est) est = p.est
    }
    if (!seen) continue
    if (now.load > load) {
      const set = now.loadSet
      out.push({ id, kind: 'load', set, w: set ? round1(resolveSetWeight(set, workoutEntryOf(workout, id, set), workout, unit)) : now.load, r: set ? Math.round(Number(set.r) || 0) : 0, est: 0, prev: load })
    } else if (now.est > est) {
      const { set, w } = now.estSet
      out.push({ id, kind: 'e1rm', set, w: round1(w), r: Math.round(Number(set.r)), est: now.est, prev: est })
    }
  }
  return out
}

function workoutEntryOf(workout, id, set) {
  return (workout.entries || []).find(e => e?.id === id && e.sets?.includes(set))
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
