import { isCardio, isBodyweightEq } from './exercises.js'
import { lastEntryFor } from './history.js'
import { phaseForSet, isWarmupRow, ensurePlainObject, objectOf } from './warmup.js'

export { phaseForSet, isWarmupRow, ensurePlainObject, objectOf } from './warmup.js'

export const MODES = Object.freeze(['reps', 'time', 'cardio'])
export const PHASES = Object.freeze({ WORK: 'work', WARMUP: 'warmup' })

export function normalizeMode(value, fallback = 'reps') {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (MODES.includes(token)) return token
  return MODES.includes(fallback) ? fallback : 'reps'
}

function modeFromUnit(value) {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (['rep', 'reps', 'repetition', 'repetitions'].includes(token)) return 'reps'
  if (['sec', 'secs', 'second', 'seconds'].includes(token)) return 'time'
  if (['min', 'mins', 'minute', 'minutes'].includes(token)) return 'cardio'
  return null
}

function explicitMode(source) {
  const value = ensurePlainObject(source).mode
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return MODES.includes(token) ? token : modeFromUnit(ensurePlainObject(source).unit)
}

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
  const work = sets.filter(set => !isWarmupRow(set))
  const observed = work.length ? work : sets
  const modes = [...new Set(observed.map(set => modeForSet(set, target)))]
  if (modes.length > 1) return null
  if (modes.length === 1) return modes[0]
  const targetMode = inferredMode(target)
  if (targetMode) return targetMode
  return fallback == null ? modeForSet(source, target) : normalizeMode(fallback)
}

export function modeOf(cfg) {
  const m = cfg && cfg.mode
  if (m === 'reps' || m === 'time' || m === 'cardio') return m
  return isCardio(cfg && cfg.id) ? 'cardio' : 'reps'
}
export const isTimed = cfg => modeOf(cfg) === 'time'

export const isBw = cfg => (cfg && cfg.bodyweight != null ? !!cfg.bodyweight : isBodyweightEq(cfg && cfg.id))
export const isPerSide = cfg => !!(cfg && cfg.side)
export const sideReps = reps => (reps || 0) / 2
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
 * Make one work or warm-up row for `mode` from `target` and an optional
 * `prev` row to seed from. `target` carries the exercise config (min/speed
 * etc.); `prev` is the row to copy (history entry or last row). Warm-up rows
 * carry `phase:'warmup'+warmup:true` for legacy readers.
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

export function buildSets(S, cfg, options = {}) {
  const last = lastEntryFor(S, cfg.id)
  const n = Math.max(1, cfg.sets || 1)
  const mode = modeOf(cfg)
  const preferLast = !!options.preferLast
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
      const carried = prev && prev.sec > 0 ? prev : null
      sets.push(makeRow('time', cfg, { prev: carried }))
    }
    return sets
  }
  const conf = S?.exWeights?.[cfg.id]
  for (let i = 0; i < n; i++) {
    const prev = prevAt(i)
    const usable = prev && prev.r > 0 ? prev : null
    const w = preferLast && usable ? usable.w : (conf && conf.w > 0 ? conf.w : (usable ? usable.w : cfg.weight))
    const r = usable ? usable.r : cfg.reps
    // makeRow would otherwise re-derive r from prev, but w is already resolved
    // via exWeights/preferLast — so seed r from usable and override w explicitly.
    const row = makeRow('reps', { ...cfg, reps: r, weight: w }, { prev: null })
    // If usable exists, copy r already via target above; preserve w computed.
    sets.push(row)
  }
  return sets
}

export function workoutVolume(w) {
  let v = 0
  ;(w?.entries || []).forEach(e => (e.sets || []).forEach(s => { if (s.done && !isWarmupRow(s)) v += (s.w || 0) * (s.r || 0) }))
  return v
}

export function setsDone(w) {
  let n = 0
  ;(w?.entries || []).forEach(e => (e.sets || []).forEach(s => { if (s.done) n++ }))
  return n
}

export function setsDoneActive(A) {
  let n = 0
  if (A) (A.entries || []).forEach(e => (e.sets || []).forEach(s => { if (s.done) n++ }))
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
    if (isWarmupRow(next[j]) === warm && !next[j].done) {
      next[j] = { ...next[j] }
      if (value == null) delete next[j].w
      else next[j].w = value
    }
  }
  return next
}

/** Insert a warm-up row before the first work row, copying the preceding warm-up's values. */
export function insertWarmupRow(rows, mode, target = {}) {
  const firstWork = rows.findIndex(x => !isWarmupRow(x))
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

/** Completed non-warm-up sets across a workout's entries. */
export function workSetsDone(w) {
  return (w?.entries || []).reduce(
    (n, e) => n + (e.sets || []).filter(s => s.done && !isWarmupRow(s)).length, 0,
  )
}

const workRowsForMode = (entry = {}, mode = 'reps') => {
  const source = ensurePlainObject(entry)
  const target = ensurePlainObject(source.target || source)
  const expectedMode = normalizeMode(mode, 'reps')
  return (Array.isArray(source.sets) ? source.sets : [])
    .filter(set => phaseForSet(set) === 'work' && modeForSet(set, target) === expectedMode)
}

const completedRowsForMode = (entry, mode) => workRowsForMode(entry, mode).filter(s => s.done === true && !isWarmupRow(s))

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

/** Best load from completed work rows, with a guarded reps-only legacy topW fallback. */
export function bestWeightForEntry(entry = {}) {
  const target = entry.target || entry
  const workRows = Array.isArray(entry.sets)
    ? entry.sets.filter(s => phaseForSet(s) === 'work')
    : []
  const repsRows = metricRowsForEntry(entry, 'reps')
  if (!repsRows.length) {
    return workRows.reduce((best, set) => {
      if (set?.done !== true || isWarmupRow(set)) return best
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
