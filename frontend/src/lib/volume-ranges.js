// Volume ranges: the band of effective sets per week a muscle is aimed at, by training style.
// Sources and per-style tables: .scratch/weekly-volume/spec.md (Pelland 2024–25, Schoenfeld).

export const DEFAULT_STYLE = 'standard'

/** [low, high] effective sets per week for the 13 ranged muscles. Front delts start at 0: pressing covers them. */
export const STYLE_RANGES = {
  standard: {
    chest: [10, 20], lats: [10, 20], 'upper-back': [6, 16],
    'front-delts': [0, 12], 'side-delts': [8, 20], 'rear-delts': [6, 16],
    biceps: [8, 18], triceps: [6, 16],
    quadriceps: [8, 18], hamstring: [6, 16], gluteal: [4, 16], calves: [8, 16],
    abs: [6, 16],
  },
}

/**
 * The volume range that applies to one muscle for this profile.
 * @param {object} S - Profile.
 * @param {string} slug - Muscle slug.
 * @returns {{range: [number, number]|null, edited: boolean}} Range, or null for a count-only muscle.
 */
export function volumeRangeOf(S, slug) {
  const range = STYLE_RANGES[DEFAULT_STYLE][slug]
  return { range: range ? [...range] : null, edited: false }
}

/**
 * Where a set count sits against a volume range.
 * @param {number} sets - Effective sets (projected, or done when there is no projection).
 * @param {[number, number]|null} range - Volume range.
 * @returns {'below'|'in'|'above'|null} Null for a count-only muscle.
 */
export function verdictOf(sets, range) {
  if (!range) return null
  if (sets < range[0]) return 'below'
  if (sets > range[1]) return 'above'
  return 'in'
}
