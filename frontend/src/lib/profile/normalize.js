import { ACCENTS } from '../format.js'
import { trainingStyleOf, cleanVolumeRanges } from '../volume-ranges.js'
import { cleanProfileFields } from '../profile-fields.js'
import { streakRuleOf } from '../streak.js'
import { DEF } from './def.js'
import { admit } from './admit.js'

const clone = o => {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(o) } catch {}
  }
  return JSON.parse(JSON.stringify(o))
}

function freshProfile() {
  return clone(DEF)
}

/**
 * Turns any stored or restored payload into a complete Profile: defaults, known collections,
 * cleaned optional fields, then `admit` for old shapes and Training-log order.
 * @param {*} raw - Stored or restored Profile of any shape.
 * @param {number} now - Injected millisecond timestamp for age-dependent fields.
 * @returns {Object} A new, complete Profile; `DEF` itself is never returned.
 */
export function normalizeState(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return freshProfile()
  const base = clone(DEF)
  const S = { ...base, ...raw }
  S.workouts = Array.isArray(raw.workouts) ? raw.workouts : []
  S.routines = Array.isArray(raw.routines) ? raw.routines : []
  S.bodyweight = Array.isArray(raw.bodyweight) ? raw.bodyweight : []
  S.customEx = Array.isArray(raw.customEx) ? raw.customEx : []
  S.favorites = Array.isArray(raw.favorites) ? raw.favorites : []
  S.week = raw.week && typeof raw.week === 'object' && !Array.isArray(raw.week) ? { ...raw.week } : {}
  S.dayPlan = raw.dayPlan && typeof raw.dayPlan === 'object' && !Array.isArray(raw.dayPlan) ? { ...raw.dayPlan } : {}
  S.reminder = { ...base.reminder, ...(raw.reminder && typeof raw.reminder === 'object' && !Array.isArray(raw.reminder) ? raw.reminder : {}) }
  S.trainingStyle = trainingStyleOf(raw)
  S.streakRule = streakRuleOf(raw)
  S.volumeRanges = cleanVolumeRanges(raw.volumeRanges)
  Object.assign(S, cleanProfileFields(raw, now))
  S.accent = typeof raw.accent === 'string' && Object.hasOwn(ACCENTS, raw.accent) ? raw.accent : base.accent
  const a = raw.active
  S.active = a && typeof a === 'object' && !Array.isArray(a) && Array.isArray(a.entries) ? a : null
  return admit(S)
}
