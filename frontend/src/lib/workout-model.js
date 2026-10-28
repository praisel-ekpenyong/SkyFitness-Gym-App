import { isCardio, isBodyweightEq } from './exercises.js'
import { isWarmupRow, ensurePlainObject, objectOf } from './warmup.js'

export { phaseForSet, isWarmupRow, ensurePlainObject, objectOf } from './warmup.js'

export const MODES = Object.freeze(['reps', 'time', 'cardio'])
export const PHASES = Object.freeze({ WORK: 'work', WARMUP: 'warmup' })

/**
 * Normalize a mode-like value to a canonical logging mode.
 *
 * @param {*} value - Candidate mode; non-strings and unknown tokens fall back.
 * @param {string} [fallback] - Replacement when value is unknown; defaults to 'reps', and an unknown fallback itself yields 'reps'.
 * @returns {string} 'reps', 'time', or 'cardio'.
 */
export function normalizeMode(value, fallback = 'reps') {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (MODES.includes(token)) return token
  return MODES.includes(fallback) ? fallback : 'reps'
}

/**
 * Translate a weight-unit token to its logging mode.
 *
 * @param {*} value - Unit label such as 'reps', 'sec', or 'min'; non-strings yield null.
 * @returns {string|null} 'reps', 'time', 'cardio', or null when unrecognized.
 */
function modeFromUnit(value) {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (['rep', 'reps', 'repetition', 'repetitions'].includes(token)) return 'reps'
  if (['sec', 'secs', 'second', 'seconds'].includes(token)) return 'time'
  if (['min', 'mins', 'minute', 'minutes'].includes(token)) return 'cardio'
  return null
}

/**
 * Read the explicitly stored mode from a set, row, or target object.
 *
 * @param {*} source - Set, row, or config possibly carrying mode or unit; non-objects read as empty.
 * @returns {string|null} Stored mode, or null when neither mode nor unit names one.
 */
function explicitMode(source) {
  const obj = ensurePlainObject(source)
  const value = obj.mode
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return MODES.includes(token) ? token : modeFromUnit(obj.unit)
}

/**
 * Infer a logging mode from stored fields when no explicit mode is present.
 *
 * Explicit mode wins; otherwise legacy duration and count fields decide.
 *
 * @param {*} source - Set, row, or target possibly carrying mode, unit, or legacy result fields; non-objects read as empty.
 * @returns {string|null} Inferred mode, or null when nothing indicates one.
 */
function inferredMode(source) {
  const value = ensurePlainObject(source)
  const explicit = explicitMode(value)
  if (explicit) return explicit
  if (String(value.mode || '').trim().toLowerCase() === 'amrap') return 'reps'
  if (value.min != null || value.speed != null) return 'cardio'
  if (value.sec != null || value.seconds != null || value.durationSec != null) return 'time'
  if (value.r != null || value.reps != null || value.actualReps != null) return 'reps'
  return null
}

/** Resolve one row's mode: explicit row, parent target, then legacy result fields. */
export function modeForSet(set, target = {}) {
  return explicitMode(set) || inferredMode(target) || inferredMode(set) || 'reps'
}

/** Resolve a single mode for an entry; mixed work-row modes intentionally return null. */
export function modeForEntry(entry, fallback = null) {
  const source = ensurePlainObject(entry)
  const target = ensurePlainObject(source.target || source)
  const sets = Array.isArray(source.sets) ? source.sets : []
  const work = sets.filter(isWorkSet)
  const observed = work.length ? work : sets
  const modes = [...new Set(observed.map(set => modeForSet(set, target)))]
  if (modes.length > 1) return null
  if (modes.length === 1) return modes[0]
  const targetMode = inferredMode(target)
  if (targetMode) return targetMode
  return fallback == null ? modeForSet(source, target) : normalizeMode(fallback)
}

/**
 * Resolve the logging mode for an exercise config.
 *
 * @param {Object|null|undefined} cfg - Exercise config with optional mode and id; nullish reads as reps unless catalogued otherwise.
 * @returns {string} Explicit mode when valid, else 'cardio' for cardio exercises, else 'reps'.
 */
export function modeOf(cfg) {
  const m = cfg && cfg.mode
  if (m === 'reps' || m === 'time' || m === 'cardio') return m
  return isCardio(cfg && cfg.id) ? 'cardio' : 'reps'
}
/**
 * Report whether an exercise config logs timed holds.
 *
 * @param {Object|null|undefined} cfg - Exercise config passed to modeOf.
 * @returns {boolean} True when the resolved mode is 'time'.
 */
export const isTimed = cfg => modeOf(cfg) === 'time'

/**
 * Report whether an exercise is logged as bodyweight work.
 *
 * @param {Object|null|undefined} cfg - Exercise config with optional bodyweight flag and id.
 * @returns {boolean} Explicit bodyweight flag when present, else the catalogue bodyweight default.
 */
export const isBw = cfg => (cfg && cfg.bodyweight != null ? !!cfg.bodyweight : isBodyweightEq(cfg && cfg.id))
/**
 * Report whether an exercise is logged per side.
 *
 * @param {Object|null|undefined} cfg - Exercise config with optional side flag; nullish yields false.
 * @returns {boolean} True only when cfg.side is truthy.
 */
export const isPerSide = cfg => !!(cfg && cfg.side)
/**
 * Convert a logged total into per-side reps for unilateral work.
 *
 * @param {number} reps - Logged total reps across both sides; nullish counts as 0.
 * @returns {number} Half the total, preserving .5 for odd totals.
 */
export const sideReps = reps => (reps || 0) / 2
/**
 * Return the rep stepper increment that keeps unilateral totals splittable.
 *
 * @param {Object|null|undefined} cfg - Exercise config with optional side flag.
 * @returns {number} 2 for per-side exercises, else 1.
 */
export const repStep = cfg => (isPerSide(cfg) ? 2 : 1)

// --- Row construction (deep seam) -----------------------------------------
// One home for the shape and fallback defaults of a reps/time/cardio row.
// Every site that once hand-rolled `{w,r} | {sec,w} | {min,speed}` now calls
// this, so a new Mode or a renamed field touches one file.
export const ROW_DEFAULTS = Object.freeze({
  cardio: Object.freeze({ min: 20, speed: 8 }),
  time: Object.freeze({ sec: 45, weight: 0 }),
  reps: Object.freeze({ reps: 10, weight: 0 }),
})
export const SETS_DEFAULTS = Object.freeze({ cardio: 1, time: 3, reps: 3 })

/**
 * Make one work or warm-up row for `mode` from `target` and an optional `prev` row.
 *
 * `target` carries the exercise config ({min,speed} for cardio, {sec,weight} for
 * time, {reps,weight} for reps); `prev` is the history or last row to copy.
 * Warm-up rows carry `phase:'warmup'+warmup:true` for legacy readers. Options
 * arrive as a destructured third argument.
 *
 * @param {string} mode - 'reps' | 'time' | 'cardio'.
 * @param {Object} [target] - Exercise config holding the mode's fields.
 * @param {Object|null} [prev=null] - Row to copy values from.
 * @param {boolean} [warmup=false] - Mark the row as a warm-up row.
 * @returns {Object} New set row with `done:false`.
 */
export function makeRow(mode, target = {}, { prev = null, warmup = false } = {}) {
  const m = normalizeMode(mode, 'reps')
  const base = warmup ? { done: false, phase: 'warmup', warmup: true } : { done: false }
  if (m === 'cardio') {
    const min = prev?.min ?? target.min ?? ROW_DEFAULTS.cardio.min
    const speed = prev?.speed ?? target.speed ?? ROW_DEFAULTS.cardio.speed
    return { min, speed, ...base }
  }
  if (m === 'time') {
    const sec = prev?.sec ?? target.sec ?? ROW_DEFAULTS.time.sec
    const w = prev?.w ?? target.weight ?? ROW_DEFAULTS.time.weight
    return { sec, w, ...base }
  }
  const w = prev?.w ?? target.weight ?? ROW_DEFAULTS.reps.weight
  const r = prev?.r ?? target.reps ?? ROW_DEFAULTS.reps.reps
  return { w, r, ...base }
}

// Default config for a freshly added exercise.
export function defaultConfig(id, mode) {
  const m = mode || modeOf({ id })
  if (m === 'cardio') return { sets: SETS_DEFAULTS.cardio, min: ROW_DEFAULTS.cardio.min, speed: ROW_DEFAULTS.cardio.speed }
  const bw = isBodyweightEq(id) ? { bodyweight: true } : {}
  if (m === 'time') return { sets: SETS_DEFAULTS.time, sec: ROW_DEFAULTS.time.sec, weight: ROW_DEFAULTS.time.weight, mode: 'time', ...bw }
  return { sets: SETS_DEFAULTS.reps, reps: ROW_DEFAULTS.reps.reps, weight: ROW_DEFAULTS.reps.weight, mode: 'reps', ...bw }
}

/**
 * Build a freestyle entry config seeded from the exercise's last logged target.
 *
 * @param {Object} S - App state holding the workouts history.
 * @param {Object} cfg - Fresh exercise config providing defaults and id.
 * @returns {Object} Copy of cfg overlaid with the last target, keeping cfg.id and at least one set.
 */
export function freestyleConfig(S, cfg) {
  const last = lastEntryFor(S, cfg.id)
  if (!last) return { ...cfg }
  return {
    ...cfg,
    ...(last.target || {}),
    id: cfg.id,
    sets: Math.max(1, last.sets.length)
  }
}

/**
 * Build fresh uncompleted set rows for an exercise from plan and history.
 *
 * Rows reuse last logged values within the same mode and fall back to the plan.
 *
 * Routine-backed sessions pass `routineId` so a new Target shape seeds from that Routine's
 * own last working weight, never another Routine's `exWeights` high. `seedWeightOnly` keeps
 * the plan's top reps/seconds for a new Progression stream while still carrying that weight.
 *
 * @param {Object} S - App state with workouts history and optional exWeights working-weight hints.
 * @param {Object} cfg - Exercise plan carrying id, sets count, and mode fields.
 * @param {Object} options - Build flags:
 *   `preferLast` keeps each last set weight over the hint; `routineId` scopes history and
 *   disables the global working-weight hint; `seedWeightOnly` takes only the weight from
 *   history.
 * @returns {Array<Object>} New set rows with done:false, at least one row.
 */
export function buildSets(S, cfg, options = {}) {
  const routineId = options.routineId || null
  const last = routineId ? lastEntryForRoutine(S, cfg.id, routineId) : lastEntryFor(S, cfg.id)
  const n = Math.max(1, cfg.sets || 1)
  const mode = modeOf(cfg)
  const preferLast = !!options.preferLast
  const seedWeightOnly = !!options.seedWeightOnly
  const useExWeights = !routineId
  const sets = []
  const prevAt = i => (last ? (last.sets[i] || last.sets[last.sets.length - 1]) : null)

  if (mode === 'cardio') {
    for (let i = 0; i < n; i++) {
      const prev = prevAt(i)
      sets.push(makeRow('cardio', cfg, { prev }))
    }
    return sets
  }
  if (mode === 'time') {
    for (let i = 0; i < n; i++) {
      const prev = prevAt(i)
      const usable = prev && prev.sec > 0 ? prev : null
      // A new stream takes the working weight but not the old Target's duration.
      const carried = seedWeightOnly && usable ? { w: usable.w } : usable
      sets.push(makeRow('time', cfg, { prev: carried }))
    }
    return sets
  }
  const conf = useExWeights ? S?.exWeights?.[cfg.id] : null
  for (let i = 0; i < n; i++) {
    const prev = prevAt(i)
    const usable = prev && prev.r > 0 ? prev : null
    const w = preferLast && usable ? usable.w : (conf && conf.w > 0 ? conf.w : (usable ? usable.w : cfg.weight))
    const r = seedWeightOnly ? cfg.reps : (usable ? usable.r : cfg.reps)
    // makeRow would otherwise re-derive r from prev, but w is already resolved
    // via exWeights/preferLast — so seed r from usable and override w explicitly.
    const row = makeRow('reps', { ...cfg, reps: r, weight: w }, { prev: null })
    sets.push(row)
  }
  return sets
}

/**
 * Whether a row is a work set — the phase reading, complement of `isWarmupRow`.
 *
 * GLOSSARY.md: Work set — any set that is not a warm-up; all metrics, judgements
 * and policies read work sets only. A missing or unrecognised phase reads as
 * work (the `phaseForSet` contract), so the predicate is for real rows.
 *
 * @param {Object|null|undefined} set - Set/row object.
 * @returns {boolean} True when the row is a work set.
 */
export const isWorkSet = set => !isWarmupRow(set)

/**
 * Whether a set was performed (checked off).
 *
 * GLOSSARY.md: Performed — an unchecked set counts as not having happened,
 * everywhere. Read as truthy: production writes booleans, and a hand-edited
 * `done: 1` counts rather than silently disappearing from the strict readers.
 *
 * @param {Object|null|undefined} set - Set/row object.
 * @returns {boolean} True when the set was checked off.
 */
export const isPerformed = set => !!set?.done

/** The work sets of an entry, performed or not (the phase-only list). */
export const workSets = entry => (Array.isArray(entry?.sets) ? entry.sets : []).filter(isWorkSet)

/** The performed work sets of an entry — the list metrics read. */
export const doneWorkSets = entry => workSets(entry).filter(isPerformed)

/** Whether an entry has at least one performed work set — the entry-counts-as-trained test. */
export const hasWorkSet = entry => doneWorkSets(entry).length > 0

/**
 * Tonnage of one Workout: load × reps across performed Work sets.
 *
 * @param {Object|null|undefined} w - Workout with an entries array of set rows; nullish yields 0.
 * @returns {number} Summed load × reps; 0 when none.
 */
export function tonnageOf(w) {
  let v = 0
  ;(w?.entries || []).forEach(e => doneWorkSets(e).forEach(s => { v += (s.w || 0) * (s.r || 0) }))
  return v
}

/**
 * Count every completed set in a finished workout.
 *
 * @param {Object|null|undefined} w - Workout with an entries array of set rows; nullish yields 0.
 * @returns {number} Number of performed sets (truthy `done`), including warm-ups.
 */
export function setsDone(w) {
  let n = 0
  ;(w?.entries || []).forEach(e => (e.sets || []).forEach(s => { if (isPerformed(s)) n++ }))
  return n
}

/**
 * Cascade a weight change forward: following sets of the same warm-up flag that are still
 * undone take the new value (null deletes the key). Done sets are never rewritten.
 */
export function cascadeWeight(rows, from, value) {
  const warm = isWarmupRow(rows[from])
  const next = rows.slice()
  for (let j = from + 1; j < next.length; j++) {
    if (isWarmupRow(next[j]) === warm && !isPerformed(next[j])) {
      next[j] = { ...next[j] }
      if (value == null) delete next[j].w
      else next[j].w = value
    }
  }
  return next
}

/** Insert a warm-up row before the first work row, copying the preceding warm-up's values. */
export function insertWarmupRow(rows, mode, target = {}) {
  const firstWork = rows.findIndex(isWorkSet)
  const at = firstWork === -1 ? rows.length : firstWork
  const l = rows[at - 1] || rows[rows.length - 1]
  const warm = makeRow(mode, target, { prev: l || null, warmup: true })
  const next = rows.slice()
  next.splice(at, 0, warm)
  return next
}

/** Remove the row at `i`, never emptying the entry below one row. */
export function removeRowAt(rows, i) {
  if (rows.length <= 1) return rows.slice()
  const next = rows.slice()
  next.splice(i, 1)
  return next
}

/** Performed work sets across a workout's entries. */
export function workSetsDone(w) {
  return (w?.entries || []).reduce((n, e) => n + doneWorkSets(e).length, 0)
}

/**
 * Whether an entry still has work sets left to tick.
 *
 * The one definition of "work left" that every completion check reads: the
 * superset step, the set toggle, the working-weight sheet and the finish
 * surfaces. Warm-up rows are preparatory and never count as work left.
 * Accepts either an entry directly, or an entries array with an index.
 *
 * @param {Array<Object>|Object} entryOrEntries - Entries array or a single entry object.
 * @param {number} [idx] - Index when passing an entries array.
 * @returns {boolean} True if the entry has an unticked work set; missing entries read as none.
 */
export const hasWork = (entryOrEntries, idx) => {
  const entry = idx == null ? entryOrEntries : entryOrEntries?.[idx]
  return workSets(entry).some(set => !isPerformed(set))
}

/**
 * Whether an entry has nothing left to do.
 *
 * An entry counts as done when no work set remains unticked (GLOSSARY.md:
 * Session progress). An entry left with only warm-up rows — or none at all —
 * has nothing left to do and counts as done, so a session can always be
 * finished without a false "unchecked" claim. Nullish entries are not done.
 *
 * @param {Object} entry - Workout entry containing a sets array.
 * @returns {boolean} True when no work set is left to tick.
 */
export function isExerciseDone(entry) {
  if (!entry || !Array.isArray(entry.sets)) return false
  return !hasWork(entry)
}

/**
 * The one reading of Active workout progress (GLOSSARY.md: Session progress).
 *
 * Work sets only: warm-up rows never move any number here. Every surface that
 * shows or asks how far the session has come reads this — `done`/`total` the
 * header, `remaining` the finish confirm, `exDone`/`exTotal`/`allDone` the
 * finish button — so the surfaces cannot disagree. `allDone` means every entry
 * has nothing left to do; an empty session is not done.
 *
 * @param {Object|null} A - Active workout with an entries array; nullish yields zeroes.
 * @returns {{ done: number, total: number, remaining: number, exDone: number, exTotal: number, allDone: boolean }}
 *   done/total: ticked vs all work sets. exDone/exTotal: entries with nothing
 *   left to do vs all entries.
 */
export function sessionProgress(A) {
  const entries = A?.entries || []
  const total = entries.reduce((n, e) => n + workSets(e).length, 0)
  const done = workSetsDone(A)
  const exDone = entries.filter(isExerciseDone).length
  const exTotal = entries.length
  return { done, total, remaining: total - done, exDone, exTotal, allDone: exTotal > 0 && exDone === exTotal }
}

/**
 * Select work-phase rows of one mode from an entry.
 *
 * @param {Object} entry - Workout entry with sets and optional target; missing sets count as empty.
 * @param {string} mode - Requested mode; unknown values normalize to 'reps'.
 * @returns {Array<Object>} Work rows matching the normalized mode, in logged order.
 */
const workRowsForMode = (entry = {}, mode = 'reps') => {
  const source = ensurePlainObject(entry)
  const target = ensurePlainObject(source.target || source)
  const expectedMode = normalizeMode(mode, 'reps')
  return (Array.isArray(source.sets) ? source.sets : [])
    .filter(set => isWorkSet(set) && modeForSet(set, target) === expectedMode)
}

/**
 * Select completed work rows of one mode from an entry.
 *
 * @param {Object} entry - Workout entry passed to workRowsForMode.
 * @param {string} mode - Requested mode passed to workRowsForMode.
 * @returns {Array<Object>} Done work rows of that mode, excluding warm-ups.
 */
const completedRowsForMode = (entry, mode) => workRowsForMode(entry, mode).filter(isPerformed)

/**
 * Select the completed rows that score an entry's headline metric.
 *
 * @param {Object} entry - Workout entry with sets and optional target.
 * @param {string} mode - Requested mode; unknown or missing values fall back to the entry's own metric mode.
 * @returns {Array<Object>} Completed rows for the resolved mode, or [] when the entry has no metric mode.
 */
export function metricRowsForEntry(entry, mode) {
  const requested = typeof mode === 'string' ? mode.trim().toLowerCase() : ''
  const resolved = MODES.includes(requested) ? requested : metricModeForEntry(entry)
  return resolved ? completedRowsForMode(entry, resolved) : []
}

/** The authoritative metric for an entry; reps rows take precedence over timed/cardio rows. */
export function metricModeForEntry(entry, fallback = null) {
  for (const mode of MODES) {
    if (completedRowsForMode(entry, mode).length) return mode
  }
  return modeForEntry(entry, fallback)
}

/**
 * Backwards walk shared by the last-entry readers.
 *
 * Scans workouts in reverse order, keeping only those the `match` predicate accepts, and returns
 * the first matching exercise entry that has performed work sets. Callers add their filter
 * (any-Routine vs one Routine) as the predicate; the entry shape is fixed here.
 *
 * @param {Object} S - Application state atom containing `workouts`.
 * @param {string} exId - Exercise identifier from EXIDX.
 * @param {(w: Object) => boolean} match - Workout filter; false skips the workout entirely.
 * @returns {{ d: string, sets: Array<Object>, target: Object|null }|null} Last entry summary, or null.
 */
const lastEntryWalk = (S, exId, match) => {
  const workouts = S?.workouts || []
  for (let i = workouts.length - 1; i >= 0; i--) {
    const w = workouts[i]
    if (!match(w)) continue
    const en = (w.entries || []).find(e => e.id === exId)
    // `target` is what the session prescribed; finished workouts carry it so labels and the
    // progression engine can read a session back the way it was logged.
    if (!en?.sets) continue
    const workDone = doneWorkSets(en)
    if (workDone.length) return { d: w.d, sets: workDone, target: en.target || null }
  }
  return null
}

/**
 * Find the most recent workout entry for an exercise containing completed work sets.
 *
 * Scans workouts in reverse chronological order. Warm-up rows are excluded so prep sets
 * never masquerade as training sessions. Retains the prescribed `target` for progression audits.
 *
 * @param {Object} S - Application state atom containing `workouts`.
 * @param {string} exId - Exercise identifier from EXIDX.
 * @returns {{ d: string, sets: Array<Object>, target: Object|null }|null} Last entry summary, or null if never performed.
 */
export function lastEntryFor(S, exId) {
  return lastEntryWalk(S, exId, () => true)
}

/**
 * Find the most recent workout entry for an exercise within one Routine.
 *
 * A new Progression stream seeds its first rows from the Routine it belongs to. Reading the
 * global last Entry (or `exWeights`) instead would let a heavy Routine's 100 kg session seed
 * a light Routine's 40 kg plan. Falls back to the global read when no Routine is supplied.
 *
 * @param {Object} S - Application state atom containing `workouts`.
 * @param {string} exId - Exercise identifier from EXIDX.
 * @param {string} [routineId] - Routine whose history to read; falsy means any Routine.
 * @returns {{ d: string, sets: Array<Object>, target: Object|null }|null} Last entry summary.
 */
export function lastEntryForRoutine(S, exId, routineId) {
  if (!routineId) return lastEntryFor(S, exId)
  return lastEntryWalk(S, exId, w => w?.routineId === routineId)
}

/** Best load from completed work rows, with a guarded reps-only legacy topW fallback. */
export function bestWeightForEntry(entry = {}) {
  const target = entry.target || entry
  const workRows = workSets(entry)
  const repsRows = metricRowsForEntry(entry, 'reps')
  if (!repsRows.length) {
    return workRows.reduce((best, set) => {
      if (!isPerformed(set)) return best
      const weight = Number(set.w)
      return Number.isFinite(weight) && weight > best ? weight : best
    }, 0)
  }

  let best = 0
  repsRows.forEach(set => {
    const weight = Number(set?.w)
    if (Number.isFinite(weight) && weight > best) best = weight
  })

  const parentMode = modeForSet({}, target)
  const hasNonRepsWorkRow = workRows.some(set => modeForSet(set, target) !== 'reps')
  const hasWarmupRow = Array.isArray(entry.sets) && entry.sets.some(isWarmupRow)
  const topWeight = Number(entry.topW)
  if (parentMode === 'reps' && !hasNonRepsWorkRow && !hasWarmupRow
    && Number.isFinite(topWeight) && topWeight > best) best = topWeight
  return best
}
