import { effectiveRoutine } from '../lib/history.js'
import { isoOf } from '../lib/dates.js'
import { EXIDX, imgSrc, gifSrc } from '../lib/exercises.js'

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

export async function warmArt(ids) {
  if (typeof navigator === 'undefined' || !navigator.onLine || !navigator.serviceWorker?.controller) return
  for (const id of ids) {
    const ex = EXIDX[id]
    for (const url of [imgSrc(ex), gifSrc(ex)]) {
      if (!url) continue
      try { await fetch(url, { mode: 'cors', credentials: 'omit' }) } catch {  }
    }
  }
}
