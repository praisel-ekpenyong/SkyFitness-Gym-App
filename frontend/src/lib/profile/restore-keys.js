import { DEF } from './def.js'

// A Restore must never copy the in-flight Active workout.
const NOT_RESTORED = new Set(['active'])

// `exWeights` was written before ADR 0021. Old backups keep it untouched, though nothing reads it.
const LEGACY_RESTORE_KEYS = ['exWeights']

/** The top-level keys a Restore copies, derived from DEF so a new key needs no second list. */
export const RESTORE_TOP_KEYS = [
  ...Object.keys(DEF).filter(key => !NOT_RESTORED.has(key)),
  ...LEGACY_RESTORE_KEYS.filter(key => !Object.hasOwn(DEF, key)),
]
