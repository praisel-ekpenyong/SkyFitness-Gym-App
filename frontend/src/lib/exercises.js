import { EXDB } from './exercises-data.js'
import { t } from './i18n-core.js'
import { IMG_BASE, GIF_BASE } from './env.js'
import { withShoulderHeads } from './shoulder-heads.js'

export { EXDB }

export const CATALOGUE_CURATIONS = {
  '0085': { tg: 'hamstrings', smAdd: ['glutes'] },
  '1459': { tg: 'hamstrings', smAdd: ['glutes'] },
  '0432': { tg: 'hamstrings', smAdd: ['glutes'] },
  '0434': { tg: 'hamstrings', smAdd: ['glutes'] },
  '1009': { tg: 'hamstrings', smAdd: ['glutes'] },
  '1023': { tg: 'hamstrings', smAdd: ['glutes'] },
  '1756': { tg: 'hamstrings', smAdd: ['glutes'] },
  '1757': { tg: 'hamstrings', smAdd: ['glutes'] },
  '2805': { tg: 'hamstrings', smAdd: ['glutes'] },
  '0115': { tg: 'hamstrings', smAdd: ['glutes'] },
  '0027': { smAdd: ['rear deltoids'] },
  '0293': { smAdd: ['rear deltoids'] },
  '0499': { smAdd: ['rear deltoids'] },
  '0861': { smAdd: ['rear deltoids'] },
}

export const smOf = ex => {
  const base = Array.isArray(ex?.sm) ? ex.sm : (ex?.sm ? [ex.sm] : [])
  return [...new Set([...base, ...(CATALOGUE_CURATIONS[ex?.id]?.smAdd || [])])]
}

export const EXIDX = {}
EXDB.forEach(e => {
  const curation = CATALOGUE_CURATIONS[e.id]
  if (curation) {
    const curated = curation.tg ? { ...e, tg: curation.tg } : { ...e }
    curated.sm = smOf(curated)
    EXIDX[e.id] = withShoulderHeads(curated)
  } else {
    EXIDX[e.id] = withShoulderHeads(e)
  }
})
export const BODYPARTS = [...new Set(EXDB.map(e => e.bp))].sort()

export function equipmentOf(list) {
  const c = {}
  list.forEach(e => { if (e.eq) c[e.eq] = (c[e.eq] || 0) + 1 })
  return Object.keys(c).sort((a, b) => c[b] - c[a] || String(a).localeCompare(String(b)))
}

let customIds = []
/**
 * Points id lookups at the user's current custom exercises for every caller.
 * @param {Object[]} list - Custom exercises to expose; nullish or empty clears the previous set.
 * @returns {void} Nothing; removes ids that are no longer listed and adds the new ones as a side effect.
 */
export function registerCustom(list) {
  customIds.forEach(id => delete EXIDX[id])
  customIds = (list || []).map(e => e.id)
  ;(list || []).forEach(e => { EXIDX[e.id] = e })
}
export const allExercises = st => [...(st?.customEx || []), ...EXDB.map(e => EXIDX[e.id])]

import { PINNED_DATASET_COMMIT, CDN_IMG_BASE, CDN_GIF_BASE } from './media-cdn.js'
export { PINNED_DATASET_COMMIT, CDN_IMG_BASE, CDN_GIF_BASE }


/**
 * Resolves the bundled still-image URL the cards show by default.
 * @param {Object} ex - Exercise with an `img` file name; nullish or imageless yields an empty string.
 * @returns {string} Local image path, or an empty string when there is nothing to show.
 */
export const imgSrc = ex => (ex?.img ? IMG_BASE + ex.img : '')
/**
 * Resolves the bundled clip URL played while a demo runs.
 * @param {Object} ex - Exercise with a `gif` file name; nullish or clipless yields an empty string.
 * @returns {string} Local clip path, or an empty string when there is nothing to play.
 */
export const gifSrc = ex => (ex?.gif ? GIF_BASE + ex.gif : '')
/**
 * Resolves the pinned CDN still-image URL used when the bundled file is missing.
 * @param {Object} ex - Exercise with an `img` file name; nullish or imageless yields an empty string.
 * @returns {string} CDN image URL, or an empty string when there is nothing to show.
 */
export const cdnImgSrc = ex => (ex?.img ? CDN_IMG_BASE + ex.img : '')
/**
 * Resolves the pinned CDN clip URL used when the bundled file is missing.
 * @param {Object} ex - Exercise with a `gif` file name; nullish or clipless yields an empty string.
 * @returns {string} CDN clip URL, or an empty string when there is nothing to play.
 */
export const cdnGifSrc = ex => (ex?.gif ? CDN_GIF_BASE + ex.gif : '')

/**
 * Picks the one media URL a card or demo should load for an exercise.
 * @param {Object} ex - Exercise with `img`/`gif` file names; nullish yields an empty string.
 * @param {boolean} playing - When true selects the motion clip instead of the still image.
 * @param {boolean} fallback - When true selects the pinned CDN copy instead of the bundled file.
 * @returns {string} Chosen URL, or an empty string when the exercise carries no matching file.
 */
export const mediaSrc = (ex, { playing = false, fallback = false } = {}) => {
  if (playing) {
    return fallback ? cdnGifSrc(ex) : gifSrc(ex)
  }
  return fallback ? cdnImgSrc(ex) : imgSrc(ex)
}

export const isCardio = idOrEx => {
  const ex = typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx
  if (!ex) return false
  if (ex.bp === 'cardio') return true
  const tg = String(ex.tg || '').toLowerCase().trim()
  return tg === 'cardio' || tg === 'cardiovascular system'
}

export const isBodyweightEq = idOrEx =>
  (typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx)?.eq === 'body weight'

export const exOr = id => EXIDX[id] ||
  { id, n: t('Unknown exercise'), bp: '', tg: '', eq: '', sm: [], st: [], missing: true }

export const exerciseFor = entry => {
  const source = entry && typeof entry === 'object' ? entry : null
  if (!source) return null
  const embedded = source.exercise
  return EXIDX[source.id] || (embedded && typeof embedded === 'object' ? embedded : source)
}
