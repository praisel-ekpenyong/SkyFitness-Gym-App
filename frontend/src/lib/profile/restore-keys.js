import { DEF } from './def.js'

// A Restore must never copy the in-flight Active workout.
const NOT_RESTORED = new Set(['active'])

// `exWeights` was written before ADR 0021, and `streakRule` (the Freeze rule) before the Week streak
// became a plain count. Old backups keep both untouched, though nothing reads them. `showRir` is
// carried for the 0 → 1 upgrade step, which turns it into `effort` and drops it (ADR 0027).
const LEGACY_RESTORE_KEYS = ['exWeights', 'streakRule', 'showRir']

/** The top-level keys a Restore copies, derived from DEF so a new key needs no second list. */
export const RESTORE_TOP_KEYS = [
  ...Object.keys(DEF).filter(key => !NOT_RESTORED.has(key)),
  ...LEGACY_RESTORE_KEYS.filter(key => !Object.hasOwn(DEF, key)),
]
