import { doneWorkSets } from './workout-model.js'
import { workoutTimestamp } from './format.js'
import { normalizeWeight, resolveSetWeight } from './units.js'

export { resolveSetWeight } from './units.js'


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

export function bestSetOf(entry, formula = DEFAULT_FORMULA, targetUnit = 'kg', workout = null) {
  let best = null
  for (const s of doneWorkSets(entry)) {
    const normW = resolveSetWeight(s, entry, workout, targetUnit)
    const est = estimate1RM(normW, s.r, formula)
    if (est !== null && (!best || est > best.est)) {
      best = {
        est,
        w: Math.round(normW * 10) / 10,
        r: Math.round(Number(s.r)),
      }
    }
  }
  return best
}

export function e1rmSeries(S, exId, formula = DEFAULT_FORMULA) {
  const pts = []
  const targetUnit = S?.unit || 'kg'
  for (const w of S?.workouts || []) {
    const entry = (w.entries || []).find(e => e?.id === exId)
    if (!entry) continue
    const best = bestSetOf(entry, formula, targetUnit, w)
    if (best) pts.push({ t: workoutTimestamp(w), d: w.d, y: best.est, w: best.w, r: best.r })
  }
  return pts
}

export function best1RM(S, exId, formula = DEFAULT_FORMULA) {
  let best = null
  e1rmSeries(S, exId, formula).forEach(p => { if (!best || p.y > best.est) best = { est: p.y, w: p.w, r: p.r, d: p.d, t: p.t } })
  return best
}
