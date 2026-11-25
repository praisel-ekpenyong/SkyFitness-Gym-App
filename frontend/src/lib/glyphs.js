export const DEFAULT_GLYPH = 'figureStrength'

export const GLYPH_GROUPS = [
  { key: 'Strength',  items: ['figureStrength', 'arm', 'abs', 'legs', 'pullup'] },
  { key: 'Equipment', items: ['dumbbell', 'barbell', 'kettlebell', 'plate', 'machine'] },
  { key: 'Cardio',    items: ['figureRun', 'bike', 'swim', 'boxing', 'timer'] },
  { key: 'Recovery',  items: ['stretch', 'moon', 'heart', 'flame', 'bolt'] },
]

/** @type {Record<string, string>} */
const LEGACY = {
  '💪': 'arm', '🦾': 'arm', '🫸': 'figureStrength', '🫷': 'pullup',
  '🏋️': 'dumbbell', '🏋': 'dumbbell', '🏋️‍♀️': 'dumbbell',
  '🦵': 'legs', '🍑': 'legs',
  '🔥': 'flame', '⚡': 'bolt', '💥': 'bolt', '🧨': 'bolt', '😤': 'flame',
  '🏃': 'figureRun', '🏃‍♀️': 'figureRun', '🚴': 'bike', '🏊': 'swim',
  '🤸': 'stretch', '🧘': 'stretch', '🧘‍♀️': 'stretch',
  '🥊': 'boxing', '🧗': 'pullup', '⛰️': 'figureRun', '🏔️': 'figureRun', '🚀': 'bolt',
  '🎯': 'target', '🏆': 'trophy', '🥇': 'medal', '⭐': 'star', '🌟': 'star',
  '👑': 'crown', '🛡️': 'shield', '⚔️': 'shield', '❤️‍🔥': 'heart',
  '🦍': 'kettlebell', '🐂': 'barbell', '🐻': 'kettlebell', '🦁': 'boxing',
  '🐺': 'figureRun', '🦈': 'swim', '🤖': 'machine',
}

/**
 * Resolves a stored routine glyph to the icon key the UI renders.
 * @param {string} v - Icon key or legacy emoji; falsy yields the default.
 * @param {string[]} [iconNames=[]] - Supported icon names from the rendering component.
 * @returns {string} Known key unchanged, legacy emoji mapped, otherwise the default glyph; unrecognised emoji retry on the base character first.
 */
export function glyphOf(v, iconNames = []) {
  if (!v) return DEFAULT_GLYPH
  if (iconNames.includes(v)) return v
  if (LEGACY[v]) return LEGACY[v]
  const base = [...v].filter(c => c !== '️' && c !== '‍')[0]
  return (base && LEGACY[base]) || DEFAULT_GLYPH
}
