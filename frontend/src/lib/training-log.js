import { isWarmupRow } from './warmup.js'
import { resolveSetWeight, normalizeWeight, round1, setIn, targetIn } from './units.js'
import { estimate1RM } from './onerm.js'
import { workoutTimestamp } from './dates.js'
import { doneWorkSets, metricModeForEntry, metricRowsForEntry, modeForSet, workSets } from './workout-sets.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Workout} Workout */
/** @typedef {import('./types.js').ActiveWorkout} ActiveWorkout */
/** @typedef {import('./types.js').Entry} Entry */
/** @typedef {import('./types.js').SetRow} SetRow */
/** @typedef {import('./types.js').Target} Target */
/** @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').LoggingMode} LoggingMode */

/**
 * @typedef {{ workout: Workout, sets: SetRow[], target: Target | Partial<Target> | null, unit: Unit | null }} RawSessionSlot
 * @typedef {{ any: RawSessionSlot | null, byRoutine: Map<string, RawSessionSlot>, latest: Workout | null }} ExSessionSlots
 * @typedef {{ d: string, sets: SetRow[], target: Partial<Target> | null }} PublicSession
 * @typedef {{ load: number, loadSet: SetRow | null, est: number, estSet: { set: SetRow, w: number } | null }} ExWorkoutSummary
 * @typedef {{ pos: number, d: string, start: number, load: number, est: number }} TimelinePoint
 * @typedef {{ load: number, est: number, seen: boolean }} RunningBest
 * @typedef {{ id: string, kind: 'load' | 'e1rm', set: SetRow | null, w: number, r: number, est: number, prev: number }} WorkoutRecord
 */

/** @type {WeakMap<Workout[], Map<Unit, Map<string, number>>>} */
const indexes = new WeakMap()

/**
 * @param {Entry} entry
 * @param {Workout | ActiveWorkout} workout
 * @param {Unit} unit
 * @returns {number}
 */
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

/**
 * @param {Workout[]} workouts
 * @param {Unit} unit
 * @returns {Map<string, number>}
 */
function indexFor(workouts, unit) {
  let byUnit = indexes.get(workouts)
  if (!byUnit) indexes.set(workouts, byUnit = new Map())
  let index = byUnit.get(unit)
  if (!index) {
    index = new Map()
    byUnit.set(unit, index)
    for (const workout of workouts) {
      for (const entry of workout?.entries || []) {
        const top = bestOfEntry(entry, workout, unit)
        if (top > (index.get(entry?.id) || 0)) index.set(entry.id, top)
      }
    }
  }
  return index
}

/** @param {Profile | null | undefined} S @returns {Workout[] | null} */
const logOf = S => (Array.isArray(S?.workouts) ? S.workouts : null)

/**
 * Best: heaviest performed Work set of an exercise, in the Profile's unit rounded to 0.1; 0 when none.
 * @param {Profile | null | undefined} S
 * @param {string | null | undefined} exId
 * @returns {number}
 */
export function best(S, exId) {
  const workouts = logOf(S)
  if (!workouts || !exId) return 0
  return round1(indexFor(workouts, S?.unit || 'kg').get(exId) || 0)
}

/** @param {number} value @returns {number} */
const roundedOrZero = value => (Number.isFinite(value) && value > 0 ? round1(value) : 0)

/**
 * @param {Entry} entry
 * @param {LoggingMode} mode
 * @param {'sec' | 'speed'} field
 * @returns {number}
 */
const peakOf = (entry, mode, field) => {
  let top = 0
  for (const set of metricRowsForEntry(entry, mode)) {
    const n = Number(set?.[field]) || 0
    if (n > top) top = n
  }
  return roundedOrZero(top)
}

/**
 * Chart rule, separate from Best: a remembered top weight counts only on a plain reps Entry.
 * @param {Entry} entry
 * @returns {boolean}
 */
const isPlainRepsEntry = entry => {
  const target = entry?.target || entry
  if (modeForSet({}, target) !== 'reps') return false
  if (Array.isArray(entry?.sets) && entry.sets.some(isWarmupRow)) return false
  return !workSets(entry).some(set => modeForSet(set, target) !== 'reps')
}

/**
 * @param {Entry} entry
 * @param {Workout | ActiveWorkout} workout
 * @param {Unit} unit
 * @returns {number | null}
 */
const legacyTop = (entry, workout, unit) => {
  const raw = Number(entry?.topW)
  if (!Number.isFinite(raw)) return null
  return normalizeWeight(raw, entry?.unit ?? workout?.unit ?? unit, unit)
}

/**
 * Chart metric: one Entry's result in its own Mode. A reps Entry is its heaviest performed reps
 * Work set, in the Profile's unit rounded to 0.1. A legacy top weight raises that score only when
 * the Entry is plain reps — no warm-up, no non-reps Work set — and the top weight is heavier.
 * A hold is the longest performed Work-set duration, in seconds. Cardio is the greatest performed
 * Work-set speed, in km/h. Nothing performed in that Mode is 0, so Best may still be heavier.
 * @param {Profile | null | undefined} S
 * @param {Workout | ActiveWorkout} workout
 * @param {Entry} entry
 * @returns {number}
 */
export function metric(S, workout, entry) {
  const mode = metricModeForEntry(entry)
  if (mode === 'time') return peakOf(entry, 'time', 'sec')
  if (mode === 'cardio') return peakOf(entry, 'cardio', 'speed')
  if (mode !== 'reps') return 0
  const unit = S?.unit || 'kg'
  const rows = metricRowsForEntry(entry, 'reps')
  let top = 0
  for (const set of rows) {
    const w = resolveSetWeight(set, entry, workout, unit)
    if (w > top) top = w
  }
  const remembered = legacyTop(entry, workout, unit)
  if (rows.length && remembered != null && remembered > top && isPlainRepsEntry(entry)) top = remembered
  return roundedOrZero(top)
}

/** @type {WeakMap<Workout[], Map<string, ExSessionSlots>>} */
const sessionIndexes = new WeakMap()

/** @param {SetRow | null | undefined} set @returns {boolean} */
const isPerformedWork = set => !!set?.done && !isWarmupRow(set)

/** @param {Workout | null | undefined} workout @returns {number} */
const startOf = workout => {
  const n = Number(workout?.start ?? workout?.t)
  return Number.isFinite(n) ? n : 0
}

/** @param {Workout} a @param {Workout | null | undefined} b @returns {boolean} */
const isLater = (a, b) => {
  if (!b) return true
  const da = String(a.d ?? '')
  const db = String(b.d ?? '')
  if (da !== db) return da > db
  return startOf(a) >= startOf(b)
}

/** @param {Workout[]} workouts @returns {Map<string, ExSessionSlots>} */
function sessionIndexFor(workouts) {
  let index = sessionIndexes.get(workouts)
  if (!index) {
    index = new Map()
    sessionIndexes.set(workouts, index)
    /** @param {RawSessionSlot | null | undefined} slot @param {RawSessionSlot} session */
    const keep = (slot, session) => (isLater(session.workout, slot?.workout) ? session : (slot ?? session))
    for (const workout of workouts) {
      /** @type {Map<string, RawSessionSlot>} */
      const byEx = new Map()
      for (const entry of workout?.entries || []) {
        const sets = Array.isArray(entry?.sets) ? entry.sets.filter(isPerformedWork) : []
        if (!sets.length) continue
        const cur = byEx.get(entry.id)
        if (cur) cur.sets.push(...sets)
        else byEx.set(entry.id, { workout, sets, target: entry.target || null, unit: entry.unit ?? workout.unit ?? null })
      }
      for (const [exId, session] of byEx) {
        let slots = index.get(exId)
        if (!slots) index.set(exId, slots = { any: null, byRoutine: new Map(), latest: null })
        if (isLater(workout, slots.latest)) slots.latest = workout
        slots.any = keep(slots.any, session)
        if (workout.routineId != null) slots.byRoutine.set(workout.routineId, keep(slots.byRoutine.get(workout.routineId), session))
      }
    }
  }
  return index
}

/**
 * A session read in the Profile unit: Sets and Target are converted from their stamp (ADR 0031).
 * Rows already in the unit are returned as stored.
 * @param {RawSessionSlot | null | undefined} session
 * @param {Unit} unit
 * @returns {PublicSession | null}
 */
function publicSession(session, unit) {
  if (!session) return null
  const from = session.unit ?? unit
  const read = session.sets.map(set => setIn(set, from, unit))
  const sets = read.every((set, i) => set === session.sets[i]) ? session.sets : read
  return { d: session.workout.d, sets, target: targetIn(session.target, from, unit) }
}

/**
 * Last session: latest Workout holding a performed Work set of the exercise, any Routine.
 * Date order, then start time; later array position breaks an exact tie. Sets span every Entry of the exercise.
 * Sets and Target are in the Profile's unit.
 * Null when never performed.
 * @param {Profile | null | undefined} S
 * @param {string | null | undefined} exId
 * @returns {PublicSession | null}
 */
export function lastSession(S, exId) {
  const workouts = logOf(S)
  if (!workouts || !exId) return null
  return publicSession(sessionIndexFor(workouts).get(exId)?.any, S?.unit || 'kg')
}

/**
 * Last session within one Routine. Strict: null when that Routine never held the exercise; without a routineId it is lastSession.
 * @param {Profile | null | undefined} S
 * @param {string | null | undefined} exId
 * @param {string | null | undefined} routineId
 * @returns {PublicSession | null}
 */
export function lastSessionInRoutine(S, exId, routineId) {
  if (!routineId) return lastSession(S, exId)
  const workouts = logOf(S)
  if (!workouts || !exId) return null
  return publicSession(sessionIndexFor(workouts).get(exId)?.byRoutine.get(routineId), S?.unit || 'kg')
}

/**
 * Latest Work set time: start timestamp in ms of the exercise's latest performed Work set's Workout (date midnight when unstamped), or null.
 * @param {Profile | null | undefined} S
 * @param {string | null | undefined} exId
 * @returns {number | null}
 */
export function latestWorkSetAt(S, exId) {
  const workouts = logOf(S)
  if (!workouts || !exId) return null
  const workout = sessionIndexFor(workouts).get(exId)?.latest
  if (!workout) return null
  const ts = workoutTimestamp(workout)
  return Number.isFinite(ts) ? ts : null
}

/**
 * Last Workout of a Routine: the latest Workout run from it, whatever it held (date, then start time); null if never run.
 * @param {Profile | null | undefined} S
 * @param {string | null | undefined} routineId
 * @returns {Workout | null}
 */
export function lastWorkoutInRoutine(S, routineId) {
  const workouts = logOf(S)
  if (!workouts || !routineId) return null
  /** @type {Workout | null} */
  let latest = null
  for (const workout of workouts) {
    if (workout?.routineId === routineId && isLater(workout, latest)) latest = workout
  }
  return latest
}

/** @type {WeakMap<Workout[], Map<Unit, { byEx: Map<string, { list: TimelinePoint[], before: RunningBest[] }>, ids: Map<string, number> }>>} */
const timelines = new WeakMap()
/** @type {WeakMap<Workout[], Map<Unit, Array<Map<string, ExWorkoutSummary>>>>} */
const summaries = new WeakMap()

/**
 * @param {Workout[]} workouts
 * @param {Unit} unit
 * @returns {Array<Map<string, ExWorkoutSummary>>}
 */
function summariesFor(workouts, unit) {
  let byUnit = summaries.get(workouts)
  if (!byUnit) summaries.set(workouts, byUnit = new Map())
  let list = byUnit.get(unit)
  if (!list) {
    list = workouts.map(workout => summarize(workout, unit))
    byUnit.set(unit, list)
  }
  return list
}

/**
 * @param {Workout} workout
 * @param {Unit} unit
 * @returns {Map<string, ExWorkoutSummary>}
 */
function summarize(workout, unit) {
  /** @type {Map<string, ExWorkoutSummary>} */
  const byEx = new Map()
  for (const entry of workout?.entries || []) {
    if (!entry?.id) continue
    const cur = byEx.get(entry.id) || { load: 0, loadSet: null, est: 0, estSet: null }
    let setTop = 0
    /** @type {SetRow | null} */
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

/** @param {{ pos: number, d: string, start: number }} a @param {{ pos: number, d: string, start: number }} b @returns {number} */
const cmpPoint = (a, b) => (a.d !== b.d ? (a.d < b.d ? -1 : 1) : a.start !== b.start ? a.start - b.start : a.pos - b.pos)

/**
 * Per exercise, points in (date, start, position) order with the running best before each, so a Workout reads its history by binary search.
 * @param {Workout[]} workouts
 * @param {Unit} unit
 */
function timelineFor(workouts, unit) {
  let byUnit = timelines.get(workouts)
  if (!byUnit) timelines.set(workouts, byUnit = new Map())
  let line = byUnit.get(unit)
  if (!line) {
    const sums = summariesFor(workouts, unit)
    /** @type {Map<string, TimelinePoint[]>} */
    const points = new Map()
    /** @type {Map<string, number>} */
    const ids = new Map()
    workouts.forEach((workout, pos) => {
      if (workout?.id != null && !ids.has(workout.id)) ids.set(workout.id, pos)
      for (const [id, top] of sums[pos]) {
        let list = points.get(id)
        if (!list) points.set(id, list = [])
        list.push({ pos, d: String(workout?.d || ''), start: startOf(workout), load: top.load, est: top.est })
      }
    })
    /** @type {Map<string, { list: TimelinePoint[], before: RunningBest[] }>} */
    const byEx = new Map()
    for (const [id, list] of points) {
      list.sort(cmpPoint)
      let load = 0
      let est = 0
      let seen = false
      const before = [{ load, est, seen }]
      for (const p of list) {
        if (p.load > 0 || p.est > 0) seen = true
        if (p.load > load) load = p.load
        if (p.est > est) est = p.est
        before.push({ load, est, seen })
      }
      byEx.set(id, { list, before })
    }
    byUnit.set(unit, line = { byEx, ids })
  }
  return line
}

/**
 * Records: the exercises a Workout set a Record in, read from the Training log. A Record is the Workout's
 * heaviest Set (load) or best Estimated 1RM Set beating every earlier performed Work set; an exercise's first
 * performed session is a baseline and an exercise is judged once per Workout. Load wins when both would count.
 * The Workout may be a copy of one in the log (found by id) or not yet added to it.
 *
 * @param {Profile | null | undefined} S
 * @param {Workout | null | undefined} workout
 * @returns {WorkoutRecord[]}
 *   One per exercise in Entry order. `set` is the Workout's own Set (null for a legacy top weight, with r 0);
 *   `w`, `prev` and `est` are in the Profile's unit, `prev` the earlier Best (load) or best estimate (e1rm).
 */
export function records(S, workout) {
  const workouts = logOf(S)
  if (!workouts || !workout) return []
  const unit = S?.unit || 'kg'
  const { byEx, ids } = timelineFor(workouts, unit)
  const found = workouts.indexOf(workout)
  const at = found >= 0 ? found : ids.get(workout.id) ?? Infinity
  const target = { d: String(workout.d || ''), start: startOf(workout), pos: at }
  /** @type {WorkoutRecord[]} */
  const out = []
  for (const [id, now] of summarize(workout, unit)) {
    const line = byEx.get(id)
    if (!line) continue
    let lo = 0
    let hi = line.list.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cmpPoint(line.list[mid], target) < 0) lo = mid + 1
      else hi = mid
    }
    const { load, est, seen } = line.before[lo]
    if (!seen) continue
    if (now.load > load) {
      const set = now.loadSet
      out.push({ id, kind: 'load', set, w: set ? round1(resolveSetWeight(set, workoutEntryOf(workout, id, set), workout, unit)) : now.load, r: set ? Math.round(Number(set.r) || 0) : 0, est: 0, prev: load })
    } else if (now.est > est && now.estSet) {
      const { set, w } = now.estSet
      out.push({ id, kind: 'e1rm', set, w: round1(w), r: Math.round(Number(set.r)), est: now.est, prev: est })
    }
  }
  return out
}

/**
 * Estimated 1RM by Workout: the points of e1rmSeries, each with the Workout it comes from, for a
 * reader that needs more of that Workout than its date (a Strength level reads the body weight then).
 *
 * @param {Profile | null | undefined} S
 * @param {string | null | undefined} exId
 * @returns {Array<{workout: Workout, t: number, d: string, y: number, w: number, r: number}>}
 */
export function e1rmByWorkout(S, exId) {
  const workouts = logOf(S)
  if (!workouts || !exId) return []
  const sums = summariesFor(workouts, S?.unit || 'kg')
  /** @type {Array<{workout: Workout, t: number, d: string, y: number, w: number, r: number}>} */
  const points = []
  workouts.forEach((workout, i) => {
    const top = sums[i].get(exId)
    if (!top?.est || !top.estSet) return
    points.push({
      workout,
      t: workoutTimestamp(workout),
      d: workout.d,
      y: top.est,
      w: round1(top.estSet.w),
      r: Math.round(Number(top.estSet.set.r)),
    })
  })
  return points
}

/**
 * Estimated 1RM series: one point per Workout with an estimable performed Work set of the exercise,
 * in Profile Workout order. `y` is the estimate Records already use for that Workout, across every
 * Entry. `w` and `r` are the Set behind it, `t` and `d` the Workout's. Loads are in the Profile's unit.
 * A hold or a cardio Entry with no reps adds no point.
 *
 * @param {Profile | null | undefined} S
 * @param {string | null | undefined} exId
 * @returns {Array<{t: number, d: string, y: number, w: number, r: number}>}
 */
export function e1rmSeries(S, exId) {
  return e1rmByWorkout(S, exId).map(({ workout, ...point }) => point)
}

/**
 * Standing Estimated 1RM: the series point with the greatest `y`, or null when none exists.
 * A tie keeps the earlier point. `{ est, w, r, d, t }` uses the Profile's unit.
 * @param {Profile | null | undefined} S
 * @param {string | null | undefined} exId
 * @returns {{ est: number, w: number, r: number, d: string, t: number } | null}
 */
export function best1RM(S, exId) {
  /** @type {{ est: number, w: number, r: number, d: string, t: number } | null} */
  let standing = null
  for (const point of e1rmSeries(S, exId)) {
    if (!standing || point.y > standing.est) {
      standing = { est: point.y, w: point.w, r: point.r, d: point.d, t: point.t }
    }
  }
  return standing
}

/**
 * The load Records of a Workout (see records).
 * @param {Profile | null | undefined} S
 * @param {Workout | null | undefined} workout
 * @returns {WorkoutRecord[]}
 */
export const loadRecords = (S, workout) => records(S, workout).filter(r => r.kind === 'load')

/**
 * The Estimated 1RM Records of a Workout, as {id, est, w, r, prev}.
 * @param {Profile | null | undefined} S
 * @param {Workout | null | undefined} workout
 * @returns {Array<{ id: string, est: number, w: number, r: number, prev: number }>}
 */
export const e1rmRecords = (S, workout) =>
  records(S, workout).filter(r => r.kind === 'e1rm').map(({ id, est, w, r, prev }) => ({ id, est, w, r, prev }))

/**
 * @param {Workout} workout
 * @param {string} id
 * @param {SetRow} set
 * @returns {Entry | undefined}
 */
function workoutEntryOf(workout, id, set) {
  return (workout.entries || []).find(e => e?.id === id && e.sets?.includes(set))
}

/**
 * Tonnage: load x reps of a Workout's performed Work sets (warm-ups excluded), in the Profile's unit rounded to 0.1.
 * @param {Profile | null | undefined} S
 * @param {Workout | ActiveWorkout | null | undefined} workout
 * @returns {number}
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
