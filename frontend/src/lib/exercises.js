import { EXDB } from './exercises-data.js'
import { t } from './i18n-core.js'
import { IMG_BASE, GIF_BASE } from './env.js'

export { EXDB }

// The generated dataset already supplies secondary muscles for most exercises. Keep the
// handful of conservative catalogue curations (primary muscle overrides and secondary muscle additions)
// here so a dataset refresh does not erase them. Values follow the dataset's existing alias vocabulary.
export const CATALOGUE_CURATIONS = {
  // Romanian Deadlifts
  '0085': { tg: 'hamstrings', smAdd: ['glutes'] },
  '1459': { tg: 'hamstrings', smAdd: ['glutes'] },
  // Stiff / Straight Leg Deadlifts
  '0432': { tg: 'hamstrings', smAdd: ['glutes'] },
  '0434': { tg: 'hamstrings', smAdd: ['glutes'] },
  '1009': { tg: 'hamstrings', smAdd: ['glutes'] },
  '1023': { tg: 'hamstrings', smAdd: ['glutes'] },
  // Single Leg Deadlifts
  '1756': { tg: 'hamstrings', smAdd: ['glutes'] },
  '1757': { tg: 'hamstrings', smAdd: ['glutes'] },
  '2805': { tg: 'hamstrings', smAdd: ['glutes'] },
  // Stiff Leg Good Morning
  '0115': { tg: 'hamstrings', smAdd: ['glutes'] },
  // Row variations rear delts
  '0027': { smAdd: ['rear deltoids'] },
  '0293': { smAdd: ['rear deltoids'] },
  '0499': { smAdd: ['rear deltoids'] },
  '0861': { smAdd: ['rear deltoids'] },
}

// Secondary muscles for an exercise, with the conservative additions applied as an
// overlay. The raw dataset is never mutated - consumers that want the pristine catalogue
// (export, print, import) keep reading EXDB untouched, while the muscle map sees the
// enriched list. Values follow the dataset's existing alias vocabulary.
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
    EXIDX[e.id] = curated
  } else {
    EXIDX[e.id] = e
  }
})
export const BODYPARTS = [...new Set(EXDB.map(e => e.bp))].sort()

// Equipment options present in a given list of exercises, most common first (issue #6).
// Deriving them from the *already filtered* list keeps the chip row short and means
// every body-part × equipment combination on screen has results behind it.
export function equipmentOf(list) {
  const c = {}
  list.forEach(e => { if (e.eq) c[e.eq] = (c[e.eq] || 0) + 1 })
  return Object.keys(c).sort((a, b) => c[b] - c[a] || String(a).localeCompare(String(b)))
}

// Custom (user-created) exercises live in synced state S.customEx (issue #11) and are
// merged into the id index here so every EXIDX[id] lookup keeps working unchanged.
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
// Full searchable catalogue — customs first so your own exercises are easy to find.
export const allExercises = st => [...(st?.customEx || []), ...EXDB.map(e => EXIDX[e.id])]

// Pinned dataset release for media streaming and CDN fallbacks.
import { PINNED_DATASET_COMMIT, CDN_IMG_BASE, CDN_GIF_BASE } from './media-cdn.js'
export { PINNED_DATASET_COMMIT, CDN_IMG_BASE, CDN_GIF_BASE }

// Sky does not commit 140 MB of media to git; relative defaults serve local assets bundled
// via `npm run media:fetch`, while CDN fallbacks keep fresh clones and missing assets functional.
// Bases arrive validated from the environment seam.

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

// Cardio exercises log time + speed instead of weight × reps.
export const isCardio = idOrEx => {
  const ex = typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx
  if (!ex) return false
  if (ex.bp === 'cardio') return true
  const tg = String(ex.tg || '').toLowerCase().trim()
  return tg === 'cardio' || tg === 'cardiovascular system'
}

// Exercises the dataset already knows carry no external load (issue #32) — a quarter of the
// catalogue. This seeds the `bw` flag on a fresh config so a push-up never asks for a weight
// nobody was going to enter. It is only the default: the flag lives on the config, so a dip
// done with a belt can turn it off and a custom exercise can turn it on.
export const isBodyweightEq = idOrEx =>
  (typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx)?.eq === 'body weight'

// An id that resolves to nothing — a plan file built against a different exercise dataset,
// a custom exercise deleted on another device before the sync arrived — still has to
// render. A placeholder keeps it visible (and removable) instead of taking the whole view
// down on the first `ex.n`.
export const exOr = id => EXIDX[id] ||
  { id, n: t('Unknown exercise'), bp: '', tg: '', eq: '', sm: [], st: [], missing: true }

/**
 * The exercise object a logged entry trains.
 *
 * Catalogue first so a live custom reads its current metadata; a deleted custom or
 * import falls back to an embedded `exercise` object, else the entry itself — whose
 * nested `muscleSnapshot` the muscle reads unwrap.
 *
 * @param {Object|null|undefined} entry - Entry with `id` and/or an embedded `exercise`.
 * @returns {Object|null} Resolved exercise/entry object, or null for nullish input.
 */
export const exerciseFor = entry => {
  const source = entry && typeof entry === 'object' ? entry : null
  if (!source) return null
  const embedded = source.exercise
  return EXIDX[source.id] || (embedded && typeof embedded === 'object' ? embedded : source)
}
