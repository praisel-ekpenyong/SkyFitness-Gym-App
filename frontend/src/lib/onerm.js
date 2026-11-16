import { normalizeWeight } from './units.js'

export const REP_CAP = 12

export const FORMULAS = {
  epley: (w, r) => w * (1 + r / 30),
  brzycki: (w, r) => w * 36 / (37 - r),
  lombardi: (w, r) => w * Math.pow(r, 0.1)
}
export const DEFAULT_FORMULA = 'epley'

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
