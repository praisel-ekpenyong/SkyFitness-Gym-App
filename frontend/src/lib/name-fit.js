// CSS cannot measure a word, so the width of each capital is kept here, measured in the built app (Archivo, display role: 800 weight, 62% stretch, uppercase), in em.
const EM = {
  A: .502, B: .484, C: .507, D: .505, E: .454, F: .397, G: .534, H: .506, I: .245, J: .428, K: .503, L: .413, M: .679,
  N: .51, O: .545, P: .474, Q: .545, R: .5, S: .456, T: .46, U: .497, V: .475, W: .705, X: .489, Y: .482, Z: .465,
  '-': .242, '/': .273, '&': .536, "'": .201, '.': .25, ',': .25,
}
const DIGIT = .431
const OTHER = .7
const MARGIN = 1.02

export function wordEm(word) {
  let em = 0
  for (const ch of word.toUpperCase()) {
    const base = ch.normalize('NFD')[0]
    em += EM[base] ?? (/\d/.test(base) ? DIGIT : OTHER)
  }
  return em * MARGIN
}

export const NAME_MEDIA = {
  phone: '(max-width: 699px)',
  tablet: '(min-width: 700px) and (max-width: 999px)',
  desktop: '(min-width: 1000px)',
}

export const NAME_LAYOUTS = {
  hero: {
    steps: ['poster', 's', 'xs', 'xxs'], longName: 20,
    at: {
      phone: { column: 148, full: 296, px: [56, 44, 34, 28] },
      tablet: { column: 312, full: 604, px: [56, 44, 34, 28] },
      desktop: { column: 168, full: 326, px: [68, 56, 44, 34] },
    },
  },
  card: {
    steps: ['heading'],
    at: {
      phone: { column: 203, full: 302, px: [28] },
      tablet: { column: 430, full: 626, px: [28] },
      desktop: { column: 206, full: 306, px: [28] },
    },
  },
}

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

export const stackClasses = fit => fit.stacked.map(k => ' name-stacked-' + k).join('')
