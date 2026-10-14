import {
  FATIGUE_STATES,
  FATIGUE_THRESHOLD_FATIGUED,
  FATIGUE_THRESHOLD_READY,
  fatigueStateOf,
} from './recovery.js'

export { FATIGUE_STATES, fatigueStateOf }

// Canonical Muscle map bands for Fatigue: ready below 0.25, recovering through 0.5,
// fatigued above. The semantic stops derive from the canonical Fatigue thresholds so
// the shade can never drift from the inspector label; l1/l3 only subdivide their
// bucket (l0/l1 ready, l2/l3 recovering, l4 fatigued).
export const FATIGUE_LEVELS = [
  { at: 0, level: 0 },
  { at: 0.15, level: 1 },
  { at: FATIGUE_THRESHOLD_READY, level: 2 },
  { at: 0.4, level: 3 },
  { at: FATIGUE_THRESHOLD_FATIGUED, level: 4, exclusive: true },
]
