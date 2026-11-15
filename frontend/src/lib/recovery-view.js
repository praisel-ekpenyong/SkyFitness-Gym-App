
import {
  FATIGUE_STATES,
  FATIGUE_THRESHOLD_FATIGUED,
  FATIGUE_THRESHOLD_READY,
  fatigueStateOf,
} from './recovery.js'

export { FATIGUE_STATES, fatigueStateOf }

export const FATIGUE_LEVELS = [
  { at: 0, level: 0 },
  { at: 0.15, level: 1 },
  { at: FATIGUE_THRESHOLD_READY, level: 2 },
  { at: 0.4, level: 3 },
  { at: FATIGUE_THRESHOLD_FATIGUED, level: 4, exclusive: true },
]
