
/** @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Workout} Workout */
/** @typedef {import('./types.js').ActiveWorkout} ActiveWorkout */
/** @typedef {import('./types.js').Entry} Entry */
/** @typedef {import('./types.js').SetRow} SetRow */
/** @typedef {import('./types.js').Target} Target */

export const LB_TO_KG = 0.45359237

/**
 * Round a weight to the canonical 1-decimal display and storage precision.
 *
 * @param {number} w - Numerical weight.
 * @returns {number} Weight rounded to 1 decimal place.
 */
export const round1 = w => Math.round(Number(w) * 10) / 10

/**
 * Normalize a unit string to `'kg'` or `'lb'`.
 * @param {unknown} unit
 * @returns {Unit}
 */
export function sanitizeUnit(unit) {
  if (!unit || typeof unit !== 'string') return 'kg'
  const u = unit.trim().toLowerCase()
  if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return 'lb'
  return 'kg'
}

/**
 * Convert a weight between units, rounded to 1 decimal place.
 * @param {unknown} val
 * @param {unknown} fromUnit
 * @param {unknown} toUnit
 * @returns {number}
 */
export function normalizeWeight(val, fromUnit, toUnit) {
  const n = Number(val)
  if (!Number.isFinite(n) || n === 0) return 0
  const from = sanitizeUnit(fromUnit)
  const to = sanitizeUnit(toUnit)
  if (from === to) return n
  if (from === 'lb' && to === 'kg') return round1(n * LB_TO_KG)
  if (from === 'kg' && to === 'lb') return round1(n / LB_TO_KG)
  return n
}

/**
 * The unit an Entry is logged in: its own stamp, else the Workout's, else `fallback`.
 * A Target and a Prescription have no Set stamp, so this is their unit. A Set's own stamp still wins, in `resolveSetWeight`.
 *
 * @param {Entry | null | undefined} entry - The Entry.
 * @param {Workout | ActiveWorkout | null | undefined} workout - The Workout.
 * @param {Unit} fallback - Used when neither is stamped.
 * @returns {Unit} The unit to read the Entry's Target and Prescription in.
 */
export function entryUnit(entry, workout, fallback) {
  return entry?.unit ?? workout?.unit ?? fallback
}

/**
 * Resolve a Set's weight into `targetUnit` using the Set -> Entry -> Workout -> targetUnit cascade.
 * @param {SetRow | null | undefined} set
 * @param {Entry | null | undefined} entry
 * @param {Workout | ActiveWorkout | null | undefined} workout
 * @param {Unit} targetUnit
 * @returns {number}
 */
export function resolveSetWeight(set, entry, workout, targetUnit) {
  const w = Number(set?.w)
  if (!Number.isFinite(w) || w <= 0) return 0
  const rawUnit = set?.unit ?? entryUnit(entry, workout, targetUnit)
  return normalizeWeight(w, rawUnit, targetUnit)
}

const PLATE_STEP = { kg: 1.25, lb: 2.5 }

/**
 * An Increment in another unit (ADR 0028, amended 2026-11-19). An Increment is a plate step, not a measured load:
 * it converts, then rounds to the nearest multiple of the target unit's smallest plate step (1.25 kg, 2.5 lb),
 * never below one step. The only place `inc` is converted; a time-mode `inc` (seconds) never comes here.
 *
 * @param {number} inc - The Increment in `from`.
 * @param {Unit | string} from - The unit it is in.
 * @param {Unit | string} to - The unit wanted.
 * @returns {number} The Increment in `to`; `inc` itself when the units match or it is not a load.
 */
export function convertIncrement(inc, from, to) {
  if (!isLoad(inc) || sanitizeUnit(from) === sanitizeUnit(to)) return inc
  const step = PLATE_STEP[sanitizeUnit(to)]
  const exact = Number(inc) * (sanitizeUnit(to) === 'kg' ? LB_TO_KG : 1 / LB_TO_KG)
  return Math.max(1, Math.round(exact / step)) * step
}

/** @param {unknown} a @param {unknown} b @returns {boolean} */
const sameUnit = (a, b) => sanitizeUnit(a) === sanitizeUnit(b)
/** @param {unknown} v @returns {boolean} */
const isLoad = v => Number.isFinite(Number(v)) && Number(v) !== 0

/**
 * The load fields of a Target that change between two units: `weight` (exact), and `inc` (snapped to a plate step) unless the Mode is time (seconds).
 * @param {Partial<Target> | null | undefined} cfg
 * @param {Unit | string} from
 * @param {Unit | string} to
 * @returns {Partial<Target>}
 */
function targetPatch(cfg, from, to) {
  /** @type {Partial<Target>} */
  const patch = {}
  if (!cfg || sameUnit(from, to)) return patch
  if (isLoad(cfg.weight) && cfg.weight != null) patch.weight = normalizeWeight(cfg.weight, from, to)
  if (cfg.mode !== 'time' && isLoad(cfg.inc) && cfg.inc != null) patch.inc = convertIncrement(cfg.inc, from, to)
  return patch
}

/**
 * A Target (ExCfg) with its loads in another unit (ADR 0031).
 *
 * @overload
 * @param {Target} cfg - Routine exercise config.
 * @param {Unit | string} from - The unit its loads are in.
 * @param {Unit | string} to - The unit wanted.
 * @returns {Target} `cfg` itself when nothing changes, else a converted copy.
 */
/**
 * @overload
 * @param {Partial<Target> | null} cfg - Routine exercise config or a frozen Entry target.
 * @param {Unit | string} from - The unit its loads are in.
 * @param {Unit | string} to - The unit wanted.
 * @returns {Partial<Target> | null} `cfg` itself when nothing changes, else a converted copy.
 */
/**
 * @param {Partial<Target> | null | undefined} cfg
 * @param {Unit | string} from
 * @param {Unit | string} to
 * @returns {Partial<Target> | null | undefined}
 */
export function targetIn(cfg, from, to) {
  const patch = targetPatch(cfg, from, to)
  return Object.keys(patch).length ? { ...cfg, ...patch } : cfg
}

/**
 * One logged row with its load in another unit. A row's own `unit` stamp wins over `from`.
 *
 * @param {SetRow} set - A Set row.
 * @param {Unit | string} from - The unit of its Entry or Workout.
 * @param {Unit | string} to - The unit wanted.
 * @returns {SetRow} `set` itself when nothing changes, else a converted copy.
 */
export function setIn(set, from, to) {
  if (!set || !isLoad(set.w)) return set
  const own = set.unit ?? from
  if (sameUnit(own, to)) return set
  return { ...set, w: normalizeWeight(set.w, own, to), ...(set.unit != null ? { unit: sanitizeUnit(to) } : {}) }
}

/**
 * One Set of an Entry, read in the Profile unit.
 * The load uses the same cascade as `resolveSetWeight`: the Set's stamp, else `entryUnit`.
 * A Set with no load, or already in that unit, is the stored Set.
 *
 * @param {SetRow} set - A Set.
 * @param {Entry | null | undefined} entry - The Entry it belongs to.
 * @param {Workout | ActiveWorkout | null | undefined} workout - The Workout it belongs to.
 * @param {Unit} targetUnit - The unit wanted, usually the Profile unit.
 * @returns {SetRow} `set` itself when nothing changes, else a converted copy.
 */
export function readSet(set, entry, workout, targetUnit) {
  return setIn(set, entryUnit(entry, workout, targetUnit), targetUnit)
}

/**
 * The Settings unit switch, on a Profile draft (ADR 0031). Plans and settings convert in place:
 * every Routine's `weight` and `inc`, and the Goal weight. Logs are never rewritten: a Workout or
 * Weigh-in without a unit stamp is stamped with the outgoing unit, so it keeps reading as it did.
 * Refused while a workout is active, because the Active workout is read in `S.unit`.
 *
 * @param {Profile} S - Profile (or immer draft); mutated.
 * @param {Unit | string} unit - The unit to switch to.
 * @returns {boolean} True when the Profile switched.
 */
export function switchUnit(S, unit) {
  const from = sanitizeUnit(S.unit)
  const to = sanitizeUnit(unit)
  if (from === to || S.active) return false
  for (const routine of S.routines || []) {
    for (const cfg of routine?.ex || []) Object.assign(cfg, targetPatch(cfg, from, to))
  }
  if (isLoad(S.targetW)) S.targetW = normalizeWeight(S.targetW, from, to)
  for (const workout of S.workouts || []) if (workout && workout.unit == null) workout.unit = from
  for (const weighIn of S.bodyweight || []) if (weighIn && weighIn.unit == null) weighIn.unit = from
  S.unit = to
  return true
}
