
export const LB_TO_KG = 0.45359237

/**
 * Round a weight to the canonical 1-decimal display and storage precision.
 *
 * @param {number} w - Numerical weight.
 * @returns {number} Weight rounded to 1 decimal place.
 */
export const round1 = w => Math.round(Number(w) * 10) / 10

export function sanitizeUnit(unit) {
  if (!unit || typeof unit !== 'string') return 'kg'
  const u = unit.trim().toLowerCase()
  if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return 'lb'
  return 'kg'
}

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
 * @param {Object|null} entry - The Entry.
 * @param {Object|null} workout - The Workout.
 * @param {string} [fallback='kg'] - Used when neither is stamped.
 * @returns {string} The unit to read the Entry's Target and Prescription in.
 */
export function entryUnit(entry, workout, fallback = 'kg') {
  return entry?.unit ?? workout?.unit ?? fallback
}

export function resolveSetWeight(set, entry = null, workout = null, targetUnit = 'kg') {
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
 * @param {string} from - The unit it is in.
 * @param {string} to - The unit wanted.
 * @returns {number} The Increment in `to`; `inc` itself when the units match or it is not a load.
 */
export function convertIncrement(inc, from, to) {
  if (!isLoad(inc) || sanitizeUnit(from) === sanitizeUnit(to)) return inc
  const step = PLATE_STEP[sanitizeUnit(to)]
  const exact = Number(inc) * (sanitizeUnit(to) === 'kg' ? LB_TO_KG : 1 / LB_TO_KG)
  return Math.max(1, Math.round(exact / step)) * step
}

const sameUnit = (a, b) => sanitizeUnit(a) === sanitizeUnit(b)
const isLoad = v => Number.isFinite(Number(v)) && Number(v) !== 0

/** The load fields of a Target that change between two units: `weight` (exact), and `inc` (snapped to a plate step) unless the Mode is time (seconds). */
function targetPatch(cfg, from, to) {
  const patch = {}
  if (!cfg || sameUnit(from, to)) return patch
  if (isLoad(cfg.weight)) patch.weight = normalizeWeight(cfg.weight, from, to)
  if (cfg.mode !== 'time' && isLoad(cfg.inc)) patch.inc = convertIncrement(cfg.inc, from, to)
  return patch
}

/**
 * A Target (ExCfg) with its loads in another unit (ADR 0031).
 *
 * @param {Object|null} cfg - Routine exercise config or a frozen Entry target.
 * @param {string} from - The unit its loads are in.
 * @param {string} to - The unit wanted.
 * @returns {Object|null} `cfg` itself when nothing changes, else a converted copy.
 */
export function targetIn(cfg, from, to) {
  const patch = targetPatch(cfg, from, to)
  return Object.keys(patch).length ? { ...cfg, ...patch } : cfg
}

/**
 * One logged row with its load in another unit. A row's own `unit` stamp wins over `from`.
 *
 * @param {Object} set - A Set row.
 * @param {string} from - The unit of its Entry or Workout.
 * @param {string} to - The unit wanted.
 * @returns {Object} `set` itself when nothing changes, else a converted copy.
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
 * @param {Object} set - A Set.
 * @param {Object|null} [entry] - The Entry it belongs to.
 * @param {Object|null} [workout] - The Workout it belongs to.
 * @param {string} [targetUnit='kg'] - The unit wanted, usually the Profile unit.
 * @returns {Object} `set` itself when nothing changes, else a converted copy.
 */
export function readSet(set, entry = null, workout = null, targetUnit = 'kg') {
  return setIn(set, entryUnit(entry, workout, targetUnit), targetUnit)
}

/**
 * The Settings unit switch, on a Profile draft (ADR 0031). Plans and settings convert in place:
 * every Routine's `weight` and `inc`, and the Goal weight. Logs are never rewritten: a Workout or
 * Weigh-in without a unit stamp is stamped with the outgoing unit, so it keeps reading as it did.
 * Refused while a workout is active, because the Active workout is read in `S.unit`.
 *
 * @param {Object} S - Profile (or immer draft); mutated.
 * @param {string} unit - The unit to switch to.
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
