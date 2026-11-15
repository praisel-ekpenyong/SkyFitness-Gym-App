// A Routine name set in the display role beside a muscle map breaks at spaces only: the size
// steps down while its longest word is too wide for the text column, and where no step fits, the
// name takes the full width and the map moves below it. CSS cannot measure a word, so the width of
// each capital is kept here, measured in the built app (Archivo, display role: 800 weight, 62%
// stretch, uppercase), in em.
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
 * The app's three layouts and the media range each covers. Keep in step with the breakpoints in
 * `styles/shell.css` (700, 1000) and with the `.name-stacked-*` rules in `home.css` and `screens.css`.
 */
export const NAME_MEDIA = {
  phone: '(max-width: 699px)',
  tablet: '(min-width: 700px) and (max-width: 999px)',
  desktop: '(min-width: 1000px)',
}

/**
 * Where a name sits beside a map, in px, measured in the built app at the narrowest width of each
 * layout's range (360, 700, 1000). `steps` are the size classes, largest first; `px` gives each
 * step's size on that layout (the desktop hero is one token larger). `column` is the text column
 * beside the map, `full` the width of the card's content. Keep these in step with the CSS they name.
 */
export const NAME_LAYOUTS = {
  // .home-hero-body: map column 47% (46% on a desktop), gap 8px; on a desktop it shares the row with the side column
  hero: {
    steps: ['poster', 's', 'xs', 'xxs'], longName: 20,
    at: {
      phone: { column: 148, full: 296, px: [56, 44, 34, 28] },
      tablet: { column: 312, full: 604, px: [56, 44, 34, 28] },
      desktop: { column: 168, full: 326, px: [68, 56, 44, 34] },
    },
  },
  // .rt-card: map column 30%, gap 8px; one size, --fs-heading; on a desktop Plan has two columns
  card: {
    steps: ['heading'],
    at: {
      phone: { column: 203, full: 302, px: [28] },
      tablet: { column: 430, full: 626, px: [28] },
      desktop: { column: 206, full: 306, px: [28] },
    },
  },
}

/**
 * The size step for `name`, chosen on the phone (the narrowest column): the largest step at which
 * every word fits beside the map, or, when none does, the largest at which it fits the full width.
 * A name longer than `longName` characters starts one step down so it does not run to many lines.
 * `stacked` lists the layouts on which the longest word, at that step's size there, is too wide
 * for the column beside the map, so the map sits below the name.
 */
export function fitName(name, layout) {
  const text = String(name || '').trim()
  const longest = Math.max(0, ...text.split(/\s+/).map(wordEm))
  const first = layout.longName != null && text.length > layout.longName && layout.steps.length > 1 ? 1 : 0
  const phone = layout.at.phone
  const fits = width => {
    for (let i = first; i < layout.steps.length; i++) if (longest * phone.px[i] <= width) return i
    return -1
  }
  let i = fits(phone.column)
  if (i < 0) i = fits(phone.full)
  if (i < 0) i = layout.steps.length - 1
  const stacked = Object.keys(layout.at).filter(k => longest * layout.at[k].px[i] > layout.at[k].column)
  return { step: layout.steps[i], stacked }
}

/** The class names that apply a fit's stacked layouts, each inside its own media range. */
export const stackClasses = fit => fit.stacked.map(k => ' name-stacked-' + k).join('')
