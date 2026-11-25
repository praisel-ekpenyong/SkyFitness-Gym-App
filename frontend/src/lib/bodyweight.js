
import { normalizeWeight, sanitizeUnit } from './units.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').WeighIn} WeighIn */
/** @typedef {import('./types.js').Workout} Workout */
/** @typedef {import('./types.js').ActiveWorkout} ActiveWorkout */
/** @typedef {import('./types.js').Unit} Unit */

/**
 * Round a weigh-in to the stored 1-decimal policy.
 *
 * @param {number} w - Raw weight in the profile unit.
 * @returns {number} Weight rounded to one decimal.
 */
export const round1 = w => Math.round(w * 10) / 10

/** @param {WeighIn} a @param {WeighIn} b @returns {number} */
const byDay = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)

/** @param {WeighIn} e @returns {WeighIn} */
const stored = e => ({ d: e.d, w: round1(e.w), ...(e.t !== undefined ? { t: e.t } : {}) })

/** @param {Profile} S @returns {WeighIn[]} */
function writableLog(S) {
  if (!Array.isArray(S.bodyweight)) S.bodyweight = []
  return S.bodyweight
}

/**
 * Record one weigh-in (the sheet write rule: same day overwrites).
 *
 * @param {Profile} S - Application state atom.
 * @param {{ d?: string, w?: number, t?: number }} [entry] - Calendar date (`YYYY-MM-DD`), weight in profile unit, and optional ms timestamp.
 * @param {{ overwrite?: boolean }} [options] - False leaves an existing day alone.
 * @returns {WeighIn | undefined} The stored entry for the day.
 */
export function recordWeighIn(S, { d = '', w = 0, t } = {}, { overwrite = true } = {}) {
  const log = writableLog(S)
  const ex = log.find(b => b.d === d)
  if (ex) {
    if (!overwrite) return ex
    ex.w = round1(w)
    delete ex.unit
    if (t !== undefined) ex.t = t
  } else log.push(stored({ d, w, t }))
  log.sort(byDay)
  return log.find(b => b.d === d)
}

/**
 * @param {WeighIn[]} log
 * @param {WeighIn[]} entries
 * @returns {WeighIn[]}
 */
function freshByDay(log, entries) {
  const have = new Set(log.map(b => b.d))
  const fresh = []
  for (const e of entries || []) {
    if (!e?.d || have.has(e.d)) continue
    fresh.push(e)
    have.add(e.d)
  }
  return fresh
}

/**
 * Merge weigh-in entries into the Profile without overwriting existing days.
 * @param {Profile} S
 * @param {WeighIn[]} [entries=[]]
 * @returns {{ added: number, skipped: number }}
 */
export function mergeWeighIns(S, entries = []) {
  const log = writableLog(S)
  const fresh = freshByDay(log, entries)
  fresh.forEach(e => log.push(stored(e)))
  log.sort(byDay)
  return { added: fresh.length, skipped: (entries || []).length - fresh.length }
}

/**
 * Count how many weigh-in entries would be added vs skipped on merge.
 * @param {Profile} S
 * @param {WeighIn[]} [entries=[]]
 * @returns {{ added: number, skipped: number }}
 */
export function weighInsPreview(S, entries = []) {
  const log = Array.isArray(S.bodyweight) ? S.bodyweight : []
  const fresh = freshByDay(log, entries)
  return { added: fresh.length, skipped: (entries || []).length - fresh.length }
}

/**
 * Delete one day's weigh-in.
 *
 * @param {Profile} S - Application state atom.
 * @param {string} iso - ISO day to remove.
 * @returns {number} Entries removed (0 or 1).
 */
export function deleteWeighIn(S, iso) {
  if (!Array.isArray(S?.bodyweight)) return 0
  const before = S.bodyweight.length
  S.bodyweight = S.bodyweight.filter(b => b.d !== iso)
  return before - S.bodyweight.length
}

/** @type {WeakMap<WeighIn[], Map<Unit, WeighIn[]>>} */
const readings = new WeakMap()

/**
 * The Body-weight log with every Weigh-in in the Profile unit, in stored order. A Weigh-in stamped
 * in another unit reads converted; the stored log is never rewritten (ADR 0031). Returns the stored
 * array itself when nothing needs converting.
 *
 * @param {Profile | null | undefined} S - Profile state.
 * @returns {WeighIn[]} Weigh-ins in `S.unit`.
 */
export function weighIns(S) {
  const log = Array.isArray(S?.bodyweight) ? S.bodyweight : []
  const unit = sanitizeUnit(S?.unit)
  /** @param {WeighIn} b */
  const foreign = b => b?.unit != null && sanitizeUnit(b.unit) !== unit
  if (!log.some(foreign)) return log
  let byUnit = readings.get(log)
  if (!byUnit) readings.set(log, byUnit = new Map())
  if (!byUnit.has(unit)) byUnit.set(unit, log.map(b => (foreign(b) ? { ...b, w: normalizeWeight(b.w, b.unit, unit), unit } : b)))
  return byUnit.get(unit) ?? log
}

/** @param {WeighIn[]} log @returns {WeighIn | null} */
function latestOf(log) {
  if (!log.length) return null
  let best = log[0]
  for (let i = 1; i < log.length; i++) if (log[i].d > best.d) best = log[i]
  return best
}

/**
 * The second-most-recent Weigh-in in the Profile unit, or null.
 * @param {Profile | null | undefined} S
 * @returns {WeighIn | null}
 */
export function prevWeighIn(S) {
  const log = weighIns(S)
  if (log.length < 2) return null
  const last = latestOf(log)
  if (!last) return null
  /** @type {WeighIn | null} */
  let prev = null
  for (const b of log) {
    if (b.d < last.d && (!prev || b.d > prev.d)) prev = b
  }
  return prev
}

/**
 * The latest Weigh-in, in the Profile unit, or null.
 * @param {Profile | null | undefined} S
 * @returns {WeighIn | null}
 */
export function latestWeighIn(S) {
  return latestOf(weighIns(S))
}

/**
 * The latest Weigh-in with a usable weight, in kg, or null. A broken entry is skipped, not read as no body weight.
 * @param {Profile | null | undefined} S
 * @returns {number | null}
 */
export function currentBodyweightKg(S) {
  const log = Array.isArray(S?.bodyweight) ? S.bodyweight : []
  const last = latestOf(log.filter(b => Number(b?.w) > 0))
  if (!last) return null
  const w = Number(last.w)
  return normalizeWeight(w, last.unit ?? S?.unit, 'kg')
}

/**
 * A Workout's Session body weight in the Profile unit, read from `bwUnit`, else the Workout's stamp.
 *
 * @param {Profile | null | undefined} S - Profile state.
 * @param {Workout | ActiveWorkout | null | undefined} workout - A finished or active Workout.
 * @returns {number | null} Body weight in `S.unit`, or null when the Workout has none.
 */
export function sessionBodyweight(S, workout) {
  const bw = Number(workout?.bw)
  if (workout?.bw == null || !Number.isFinite(bw) || bw <= 0) return null
  const unit = sanitizeUnit(S?.unit)
  return normalizeWeight(bw, ('bwUnit' in workout ? workout.bwUnit : undefined) || workout.unit || unit, unit)
}

/**
 * Color token indicating whether a weight delta moves toward `targetW`.
 * @param {number | null | undefined} targetW
 * @param {number} currentW
 * @param {number} delta
 * @returns {string}
 */
export function deltaTowardGoal(targetW, currentW, delta) {
  if (!delta) return 'var(--label-2)'
  if (!targetW) return 'var(--label)'
  const up = targetW > currentW
  return (delta > 0) === up ? 'var(--acc-text)' : 'var(--red-text)'
}
