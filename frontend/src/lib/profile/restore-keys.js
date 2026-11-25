import { DEF } from './def.js'

const NOT_RESTORED = new Set(['active'])

const LEGACY_RESTORE_KEYS = ['exWeights', 'streakRule', 'showRir']

/** The top-level keys a Restore copies, derived from DEF so a new key needs no second list. */
export const RESTORE_TOP_KEYS = [
  ...Object.keys(DEF).filter(key => !NOT_RESTORED.has(key)),
  ...LEGACY_RESTORE_KEYS.filter(key => !Object.hasOwn(DEF, key)),
]
