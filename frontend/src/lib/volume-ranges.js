// Volume ranges: the band of effective sets per week a muscle is aimed at, by training style.
// Terms: GLOSSARY.md (Volume range, Training style). Defaults follow Schoenfeld and Pelland et al. (2024–25).

import { t } from './i18n.js'

export const DEFAULT_STYLE = 'standard'

/** [low, high] effective sets per week for the 13 ranged muscles. Front delts start at 0: pressing covers them. */
export const STYLE_RANGES = {
  low: {
    chest: [4, 10], lats: [4, 10], 'upper-back': [3, 8],
    'front-delts': [0, 6], 'side-delts': [4, 10], 'rear-delts': [3, 8],
    biceps: [3, 8], triceps: [3, 8],
    quadriceps: [4, 10], hamstring: [3, 8], gluteal: [2, 8], calves: [4, 8],
    abs: [3, 8],
  },
  standard: {
    chest: [10, 20], lats: [10, 20], 'upper-back': [6, 16],
    'front-delts': [0, 12], 'side-delts': [8, 20], 'rear-delts': [6, 16],
    biceps: [8, 18], triceps: [6, 16],
    quadriceps: [8, 18], hamstring: [6, 16], gluteal: [4, 16], calves: [8, 16],
    abs: [6, 16],
  },
  high: {
    chest: [14, 26], lats: [14, 26], 'upper-back': [10, 22],
    'front-delts': [0, 16], 'side-delts': [12, 26], 'rear-delts': [10, 22],
    biceps: [12, 22], triceps: [10, 20],
    quadriceps: [12, 22], hamstring: [10, 20], gluteal: [8, 20], calves: [12, 20],
    abs: [10, 20],
  },
}

/** The 13 ranged muscles, in display order; every other muscle is count-only. */
export const RANGED_MUSCLES = Object.keys(STYLE_RANGES[DEFAULT_STYLE])

/**
 * Whether a muscle's low end is pinned at 0, so it never reads "below": pressing covers front delts.
 * @param {string} slug - Muscle slug.
 * @returns {boolean}
 */
export const lowPinned = slug => slug === 'front-delts'

/** Training styles in display order. */
export const TRAINING_STYLES = ['low', 'standard', 'high']

const STYLE_NAME = { low: 'Low volume', standard: 'Standard', high: 'High volume' }

/**
 * Lifter-facing name of a training style.
 * @param {string} style - Training style.
 * @returns {string}
 */
export const trainingStyleName = style => t(STYLE_NAME[style] || STYLE_NAME[DEFAULT_STYLE])

/**
 * The profile's training style; absent or unknown reads as Standard.
 * @param {object} S - Profile.
 * @returns {'low'|'standard'|'high'}
 */
export function trainingStyleOf(S) {
  const style = S?.trainingStyle
  return TRAINING_STYLES.includes(style) ? style : DEFAULT_STYLE
}

/** Highest number either end of an edited volume range may take. */
export const RANGE_MAX = 40

const isWhole = n => Number.isInteger(n) && n >= 0 && n <= RANGE_MAX

/**
 * A stored per-muscle edit, or null when it is not a usable range for a ranged muscle.
 * A pinned muscle's low end is clamped to 0.
 * @param {string} slug - Muscle slug.
 * @param {*} value - Stored value, expected [low, high].
 * @returns {[number, number]|null}
 */
export function validRangeEdit(slug, value) {
  if (!RANGED_MUSCLES.includes(slug) || !Array.isArray(value) || value.length !== 2) return null
  const [low, high] = value
  if (!isWhole(low) || !isWhole(high) || low > high) return null
  return [lowPinned(slug) ? 0 : low, high]
}

/**
 * The volume range that applies to one muscle for this profile: the style's, or a valid edit on top.
 * @param {object} S - Profile.
 * @param {string} slug - Muscle slug.
 * @returns {{range: [number, number]|null, edited: boolean}} Range, or null for a count-only muscle.
 */
export function volumeRangeOf(S, slug) {
  const style = STYLE_RANGES[trainingStyleOf(S)][slug]
  if (!style) return { range: null, edited: false }
  const edit = validRangeEdit(slug, S?.volumeRanges?.[slug])
  return edit ? { range: edit, edited: true } : { range: [...style], edited: false }
}

/**
 * The usable per-muscle edits of a stored value; anything invalid is dropped.
 * @param {*} value - Stored `volumeRanges`.
 * @returns {Object<string, [number, number]>}
 */
export function cleanVolumeRanges(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out = {}
  for (const slug of RANGED_MUSCLES) {
    const edit = validRangeEdit(slug, value[slug])
    if (edit) out[slug] = edit
  }
  return out
}

/**
 * Edits one muscle's range on top of the style; a range equal to the style's removes the edit.
 * Mutates the profile (use inside a store update).
 * @param {object} S - Profile.
 * @param {string} slug - Ranged muscle slug.
 * @param {[number, number]} range - Whole numbers, 0 ≤ low ≤ high ≤ 40; anything else is ignored.
 */
export function setVolumeRange(S, slug, range) {
  const edit = validRangeEdit(slug, range)
  if (!edit) return
  const style = STYLE_RANGES[trainingStyleOf(S)][slug]
  const next = { ...(S.volumeRanges || {}) }
  if (edit[0] === style[0] && edit[1] === style[1]) delete next[slug]
  else next[slug] = edit
  S.volumeRanges = next
}

/**
 * Back to the style's ranges: clears every per-muscle edit. Mutates the profile.
 * @param {object} S - Profile.
 */
export function clearVolumeRanges(S) {
  S.volumeRanges = {}
}

/**
 * Switches the training style and clears every edit. Mutates the profile.
 * @param {object} S - Profile.
 * @param {'low'|'standard'|'high'} style - Unknown values are ignored.
 */
export function switchTrainingStyle(S, style) {
  if (!TRAINING_STYLES.includes(style)) return
  S.trainingStyle = style
  S.volumeRanges = {}
}

/**
 * Whether any stored edit is in force.
 * @param {object} S - Profile.
 * @returns {boolean}
 */
export function hasRangeEdits(S) {
  return RANGED_MUSCLES.some(slug => volumeRangeOf(S, slug).edited)
}

/**
 * Where a set count sits against a volume range.
 * @param {number} sets - Effective sets (projected, or done when there is no projection).
 * @param {[number, number]|null} range - Volume range.
 * @param {string} slug - Muscle slug; a pinned muscle never reads below.
 * @returns {'below'|'in'|'above'|null} Null for a count-only muscle.
 */
export function verdictOf(sets, range, slug) {
  if (!range) return null
  if (sets < range[0] && !lowPinned(slug)) return 'below'
  if (sets > range[1]) return 'above'
  return 'in'
}
