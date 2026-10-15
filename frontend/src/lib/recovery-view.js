// Presentation bridge between the domain recovery model (lib/recovery.js) and
// the SVG body heatmap (lib/muscles.js). Aligns color shade levels with semantic
// fatigue states so visual cues match inspector labels at all boundaries.

import {
  FATIGUE_STATES,
  FATIGUE_THRESHOLD_FATIGUED,
  FATIGUE_THRESHOLD_READY,
  fatigueStateOf,
} from './recovery.js'

export { FATIGUE_STATES, fatigueStateOf }

/**
 * Canonical Muscle map thresholds for fatigue visualization in body heatmaps.
 *
 * Passed as the `thresholds` rule array to `levelsOf` in `muscles.js`. Rules are evaluated
 * in order; the last matching rule wins.
 *
 * Alignment with `fatigueStateOf`:
 * - Level 0..1: 'ready' (fatigue < 0.25)
 * - Level 2..3: 'recovering' (0.25 <= fatigue <= 0.5)
 * - Level 4: 'fatigued' (fatigue > 0.5)
 *
 * The terminal threshold at 0.5 specifies `exclusive: true` (matching `value > 0.5`),
 * ensuring that a fatigue value of exactly 0.5 maps to Level 3 ('recovering') so the
 * heatmap shade never conflicts with the muscle inspector label.
 */
export const FATIGUE_LEVELS = [
  { at: 0, level: 0 },
  { at: 0.15, level: 1 },
  { at: FATIGUE_THRESHOLD_READY, level: 2 },
  { at: 0.4, level: 3 },
  { at: FATIGUE_THRESHOLD_FATIGUED, level: 4, exclusive: true },
]
