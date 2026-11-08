// Unit normalization domain seam (GLOSSARY.md: Read-time unit normalization, ADR 0019).
//
// Interprets historical set loads and scalar weights across kilograms ('kg') and
// pounds ('lb') on read without mutating stored history.

/** Kilograms per pound — canonical physical constant. */
export const LB_TO_KG = 0.45359237

/**
 * Round a weight to the canonical 1-decimal display and storage precision.
 *
 * @param {number} w - Numerical weight.
 * @returns {number} Weight rounded to 1 decimal place.
 */
export const round1 = w => Math.round(Number(w) * 10) / 10

/**
 * Sanitize and normalize unit labels to canonical 'kg' | 'lb'.
 *
 * Trims whitespace, ignores case, and maps common aliases ('lbs', 'pound', 'pounds')
 * to 'lb'. All other values (including nullish and unknown units) default to 'kg'.
 *
 * @param {string|null|undefined} unit - Raw unit string.
 * @returns {'kg'|'lb'} Canonical unit token.
 */
export function sanitizeUnit(unit) {
  if (!unit || typeof unit !== 'string') return 'kg'
  const u = unit.trim().toLowerCase()
  if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return 'lb'
  return 'kg'
}

/**
 * Convert a scalar load between units, applying 1-decimal rounding.
 *
 * Returns numerical weight unchanged if source and target units match.
 *
 * @param {number} val - Numerical load to normalize.
 * @param {string} fromUnit - Origin unit of the load ('kg' | 'lb').
 * @param {string} toUnit - Desired target unit ('kg' | 'lb').
 * @returns {number} Converted load in `toUnit` rounded to 1 decimal place.
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
 * Resolve the load of a set normalized to the target unit (ADR 0017, ADR 0019).
 *
 * Resolves unit context via cascade:
 * `set.unit ?? entry?.unit ?? workout?.unit ?? targetUnit`
 *
 * Converts the resolved load to `targetUnit` via `normalizeWeight`.
 *
 * @param {Object} set - Set row with weight property `w`.
 * @param {Object|null} [entry=null] - Containing workout entry.
 * @param {Object|null} [workout=null] - Containing workout.
 * @param {string} [targetUnit='kg'] - Target profile unit ('kg' | 'lb').
 * @returns {number} Normalized load in `targetUnit`.
 */
export function resolveSetWeight(set, entry = null, workout = null, targetUnit = 'kg') {
  const w = Number(set?.w)
  if (!Number.isFinite(w) || w <= 0) return 0
  const rawUnit = set?.unit ?? entry?.unit ?? workout?.unit ?? targetUnit
  return normalizeWeight(w, rawUnit, targetUnit)
}
