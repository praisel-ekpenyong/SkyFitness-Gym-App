// Ahead-of-time exercise art. The service worker keeps every picture it has served, but a workout
// started where the signal drops (the gym) would still show blank art for exercises not yet seen.
// So, while online and idle, the art for the session in progress and the coming week's sessions is
// fetched once; the service worker caches it on the way through.
import { effectiveRoutine } from './history.js'
import { isoOf } from './format.js'
import { EXIDX, imgSrc, gifSrc } from './exercises.js'

/**
 * Exercise ids worth having art for offline: the workout in progress first, then the routines
 * scheduled over the next seven days, soonest first, each id once.
 * @param {Object} S - Application state.
 * @param {string} iso - Today, 'YYYY-MM-DD'.
 * @param {number} [cap=24] - Most ids returned, so one long plan cannot fill the art cache.
 * @returns {string[]} Exercise ids.
 */
export function exercisesToWarm(S, iso, cap = 24) {
  const ids = []
  const add = id => { if (id && !ids.includes(id)) ids.push(id) }
  for (const e of S?.active?.entries || []) add(e.id)
  const [y, m, d] = iso.split('-').map(Number)
  for (let i = 0; i < 7; i++) {
    const r = effectiveRoutine(S, isoOf(new Date(y, m - 1, d + i)))
    for (const e of r?.ex || []) add(e.id)
  }
  return ids.slice(0, cap)
}

/**
 * Fetches the still and the animation for each exercise, one at a time, so the service worker
 * stores them. Does nothing offline or without a controlling service worker; failures are ignored.
 * @param {string[]} ids - Exercise ids from `exercisesToWarm`.
 */
export async function warmArt(ids) {
  if (typeof navigator === 'undefined' || !navigator.onLine || !navigator.serviceWorker?.controller) return
  for (const id of ids) {
    const ex = EXIDX[id]
    for (const url of [imgSrc(ex), gifSrc(ex)]) {
      if (!url) continue
      try { await fetch(url, { mode: 'cors', credentials: 'omit' }) } catch { /* offline again or blocked: skip */ }
    }
  }
}
