// A Routine name set in the display role beside a muscle map breaks at spaces only (design review E10,
// E11): the size steps down while its longest word is too wide for the text column, and when no step
// fits, the name takes the full width and the map moves below it. CSS cannot measure a word, so the
// width of each capital is kept here, measured in the built app (Archivo, display role: 800 weight,
// 62% stretch, uppercase), in em.
const EM = {
  A: .502, B: .484, C: .507, D: .505, E: .454, F: .397, G: .534, H: .506, I: .245, J: .428, K: .503, L: .413, M: .679,
  N: .51, O: .545, P: .474, Q: .545, R: .5, S: .456, T: .46, U: .497, V: .475, W: .705, X: .489, Y: .482, Z: .465,
  '-': .242, '/': .273, '&': .536, "'": .201, '.': .25, ',': .25,
}
const DIGIT = .431
const OTHER = .7          // anything unmeasured counts as wide as W, so it errs towards a smaller step
const MARGIN = 1.02       // rendering and rounding slack

/** The display-role width of one word, in em. */
export function wordEm(word) {
  let em = 0
  for (const ch of word.toUpperCase()) {
    const base = ch.normalize('NFD')[0]
    em += EM[base] ?? (/\d/.test(base) ? DIGIT : OTHER)
  }
  return em * MARGIN
}

/**
 * Where a name sits beside a map, measured on the narrowest phone (360 wide), in px. `steps` run
 * largest first and match the type tokens; `column` is the text column beside the map, `full` the
 * width of the card's content. Keep these in step with the CSS they name.
 */
export const NAME_LAYOUTS = {
  // .home-hero-body: 296px of content, map column 47%, gap 8px
  hero: { column: 148, full: 296, steps: [['poster', 56], ['s', 44], ['xs', 34], ['xxs', 28]], longName: 20 },
  // .rt-card: 302px of content, map column 30%, gap 8px; one size, --fs-heading
  card: { column: 203, full: 302, steps: [['heading', 28]] },
}

/**
 * The largest step at which every word of `name` fits the text column, or, when none does, the
 * largest at which it fits the full width with the map below (`stacked`). A name longer than
 * `longName` characters starts one step down so it does not run to many lines.
 */
export function fitName(name, layout) {
  const words = String(name || '').trim().split(/\s+/)
  const longest = Math.max(0, ...words.map(wordEm))
  const steps = layout.longName != null && String(name || '').length > layout.longName && layout.steps.length > 1
    ? layout.steps.slice(1) : layout.steps
  const fits = width => steps.find(([, px]) => longest * px <= width)
  const beside = fits(layout.column)
  if (beside) return { step: beside[0], stacked: false }
  const below = fits(layout.full)
  return { step: (below || steps[steps.length - 1])[0], stacked: true }
}
