import { DEFAULT_STYLE } from '../volume-ranges.js'
import { SCHEMA_VERSION } from './upgrades.js'

/** @typedef {import('../types.js').Profile} Profile */

/**
 * Every top-level Profile field and its factory default. Restore keys derive from these.
 * @type {Profile}
 */
export const DEF = {
  schemaVersion: SCHEMA_VERSION,

  unit: 'kg',
  restSec: 90,
  sound: true,
  keepAwake: true,
  theme: 'dark',
  accent: 'lime',
  body: 'male',
  targetW: null,

  bodyweight: [],
  routines: [],
  week: {},
  dayPlan: {},
  workouts: [],
  active: null,
  customEx: [],
  gifSize: 'full',
  favorites: [],


  reminder: { on: false, time: '08:00', tz: null },

  effort: null,

  lastExport: null,

  displayName: null,

  sex: null,
  birthYear: null,

  trainingStyle: DEFAULT_STYLE,
  volumeRanges: {}
}
