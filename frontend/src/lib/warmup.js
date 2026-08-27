// Single source of truth for warm-up vs work phase detection.
// Extracted to break the circular dependency history.js <-> workout-model.js
// and to eliminate duplicated isWarmupRow logic.

export const ensurePlainObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
/** @deprecated use ensurePlainObject — kept for backward compat */
export const objectOf = ensurePlainObject

function normalizedPhase(value, fallback = 'work') {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (token === 'warmup' || token === 'warm-up' || token === 'warm_up') return 'warmup'
  if (token === 'work') return 'work'
  return fallback === 'warmup' ? 'warmup' : 'work'
}

/** Resolve a row's phase. An explicit phase wins over the legacy warmup boolean. */
export function phaseForSet(set, fallback = 'work') {
  const source = ensurePlainObject(set)
  if (source.phase != null && source.phase !== '') return normalizedPhase(source.phase, fallback)
  return source.warmup === true ? 'warmup' : normalizedPhase(undefined, fallback)
}

export function isWarmupRow(set) {
  return phaseForSet(set) === 'warmup'
}
