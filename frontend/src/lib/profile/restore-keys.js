import { DEF } from './def.js'

// A Restore must never copy the in-flight Active workout.
const NOT_RESTORED = new Set(['active'])

// `exWeights` was written before ADR 0021, and `streakRule` (the Freeze rule) before the Week streak
// became a plain count. Old backups keep both untouched, though nothing reads them.
const LEGACY_RESTORE_KEYS = ['exWeights', 'streakRule']

/** The top-level keys a Restore copies, derived from DEF so a new key needs no second list. */
export const RESTORE_TOP_KEYS = [
  ...Object.keys(DEF).filter(key => !NOT_RESTORED.has(key)),
  ...LEGACY_RESTORE_KEYS.filter(key => !Object.hasOwn(DEF, key)),
]
