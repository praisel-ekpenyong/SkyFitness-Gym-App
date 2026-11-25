import { normalizeWeight } from './units.js'

/** @typedef {import('./types.js').Unit} Unit */

export const REP_CAP = 12
const EPLEY_DIVISOR = 30

/** @type {Record<'epley' | 'brzycki' | 'lombardi', (w: number, r: number) => number>} */
export const FORMULAS = {
  epley: (w, r) => w * (1 + r / EPLEY_DIVISOR),
  brzycki: (w, r) => w * 36 / (37 - r),
  lombardi: (w, r) => w * Math.pow(r, 0.1)
}
export const DEFAULT_FORMULA = 'epley'

/**
 * Invert the Epley formula to estimate reps possible at `w` for a target `e1rm`.
 *
 * @param {number} e1rm - Target or estimated 1RM.
 * @param {number} w - Working load (must be positive).
 * @returns {number|null} Estimated reps (unrounded, unclamped), or null when inputs are non-positive.
 */
export function epleyReps(e1rm, w) {
  const max = Number(e1rm)
  const weight = Number(w)
  if (!Number.isFinite(max) || !Number.isFinite(weight) || max <= 0 || weight <= 0) return null
  return EPLEY_DIVISOR * (max / weight - 1)
}

/**
 * Estimate 1RM from a submaximal set weight and rep count.
 * @param {number | string | null | undefined} w
 * @param {number | string | null | undefined} r
 * @param {'epley' | 'brzycki' | 'lombardi'} [formula=DEFAULT_FORMULA]
 * @param {Unit | null} [setUnit=null]
 * @param {Unit | null} [targetUnit=null]
 * @returns {number | null}
 */
export function estimate1RM(w, r, formula = DEFAULT_FORMULA, setUnit = null, targetUnit = null) {
  let weight = Number(w)
  const reps = Number(r)
  if (!isFinite(weight) || !isFinite(reps)) return null
  if (weight <= 0 || reps < 1) return null
  if (reps > REP_CAP) return null
  if (setUnit && targetUnit && setUnit !== targetUnit) {
    weight = normalizeWeight(weight, setUnit, targetUnit)
  }
  const fn = FORMULAS[formula] || FORMULAS[DEFAULT_FORMULA]
  const est = reps === 1 ? weight : fn(weight, Math.round(reps))
  if (!isFinite(est) || est <= 0) return null
  return Math.round(est * 10) / 10
}
