import { applyHypertrophyPlan } from './hypertrophy-5day.js'

/** @typedef {import('../types.js').Profile} Profile */

/**
 * Plans a development build may preload with `VITE_SEED_PLAN=<name>`.
 * @type {Record<string, (S: Profile) => void>}
 */
export const SEED_PLANS = { 'hypertrophy-5day': applyHypertrophyPlan }

/**
 * Preload a named plan into a profile that has no routines yet. Any profile with routines,
 * an unknown name or no name comes back untouched, so a seed can never overwrite real data.
 * Production builds never pass a name (see `validateEnv`).
 *
 * @param {Profile} S - Booted profile state; not mutated.
 * @param {string|undefined} name - Key in `SEED_PLANS`.
 * @returns {Profile} A seeded copy, or `S` itself when nothing applies.
 */
export function seedPlanInto(S, name) {
  const apply = name && Object.hasOwn(SEED_PLANS, name) ? SEED_PLANS[name] : null
  if (!apply || S?.routines?.length) return S
  const seeded = structuredClone(S)
  apply(seeded)
  return seeded
}
