import { DEFAULT_STYLE } from '../volume-ranges.js'
import { SCHEMA_VERSION } from './upgrades.js'

/** Every top-level Profile field and its factory default. Restore keys derive from these. */
export const DEF = {
  // A fresh Profile is in the current shape. A stored Profile without it is version 0 (ADR 0027).
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
