import { EXDB } from './exercises-data.js'
import { t } from './i18n-core.js'

export { EXDB }

// The generated dataset already supplies secondary muscles for most exercises. Keep the
// handful of conservative catalogue additions that are useful to the muscle map here so a
// dataset refresh does not erase them. Values follow the dataset's existing alias vocabulary.
const SECONDARY_ADDITIONS = {
  '0027': ['rear deltoids'], // barbell bent over row
  '0293': ['rear deltoids'], // dumbbell bent over row
  '0499': ['rear deltoids'], // inverted row
  '0861': ['rear deltoids'], // cable seated row
}

// Secondary muscles for an exercise, with the small conservative additions applied as an
// overlay. The raw dataset is never mutated - consumers that want the pristine catalogue
// (export, print, import) keep reading EXDB untouched, while the muscle map sees the
// enriched list. Values follow the dataset's existing alias vocabulary.
export const smOf = ex => {
  const base = Array.isArray(ex?.sm) ? ex.sm : (ex?.sm ? [ex.sm] : [])
  return [...new Set([...base, ...(SECONDARY_ADDITIONS[ex?.id] || [])])]
}

export const EXIDX = {}
EXDB.forEach(e => { EXIDX[e.id] = e })
export const BODYPARTS = [...new Set(EXDB.map(e => e.bp))].sort()

// Equipment options present in a given list of exercises, most common first (issue #6).
// Deriving them from the *already filtered* list keeps the chip row short and means
// every body-part × equipment combination on screen has results behind it.
export function equipmentOf(list) {
  const c = {}
  list.forEach(e => { if (e.eq) c[e.eq] = (c[e.eq] || 0) + 1 })
  return Object.keys(c).sort((a, b) => c[b] - c[a] || (a < b ? -1 : 1))
}

// Custom (user-created) exercises live in synced state S.customEx (issue #11) and are
// merged into the id index here so every EXIDX[id] lookup keeps working unchanged.
let customIds = []
export function registerCustom(list) {
  customIds.forEach(id => delete EXIDX[id])
  customIds = (list || []).map(e => e.id)
  ;(list || []).forEach(e => { EXIDX[e.id] = e })
}
// Full searchable catalogue — customs first so your own exercises are easy to find.
export const allExercises = st => [...(st.customEx || []), ...EXDB]

// Pinned upstream dataset release for media streaming and CDN fallbacks.
export const PINNED_DATASET_COMMIT = '7455efae41b330c265e7cd4b78dfa848e7ce5ebd'
export const CDN_IMG_BASE = `https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@${PINNED_DATASET_COMMIT}/images/`
export const CDN_GIF_BASE = `https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@${PINNED_DATASET_COMMIT}/videos/`

// Sky does not commit 140 MB of media to git; relative defaults serve local assets bundled
// via `npm run media:fetch`, while CDN fallbacks keep fresh clones and missing assets functional.
const ENV = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}
const IMG_BASE = (ENV.VITE_IMG_BASE || 'media/images/').replace(/\/?$/, '/')
const GIF_BASE = (ENV.VITE_GIF_BASE || 'media/videos/').replace(/\/?$/, '/')

export const imgSrc = ex => (ex?.img ? IMG_BASE + ex.img : '')
export const gifSrc = ex => (ex?.gif ? GIF_BASE + ex.gif : '')
export const cdnImgSrc = ex => (ex?.img ? CDN_IMG_BASE + ex.img : '')
export const cdnGifSrc = ex => (ex?.gif ? CDN_GIF_BASE + ex.gif : '')

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
