import { DEFAULT_STYLE } from '../volume-ranges.js'

/** Every top-level Profile field and its factory default. Restore keys derive from these. */
export const DEF = {
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
  volumeRanges: {},
  streakRule: 'gentle'
}
