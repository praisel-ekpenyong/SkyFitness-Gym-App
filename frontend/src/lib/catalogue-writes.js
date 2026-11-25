
import { bodypartForMuscle } from './muscles.js'
import { actRoutine } from './routines.js'
import { uid } from './format.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').CustomExercise} CustomExercise */

/**
 * @param {Profile} S
 * @param {string} id
 * @returns {boolean}
 */
export function toggleFavorite(S, id) {
  const cur = S.favorites || []
  const star = !cur.includes(id)
  S.favorites = star ? [...cur, id] : cur.filter(x => x !== id)
  return star
}

/**
 * @param {Profile} S
 * @param {CustomExercise} ex
 * @returns {{ ok: boolean, reason: string | null }}
 */
export function deleteCustomEx(S, ex) {
  if (S.active?.entries?.some(e => e.id === ex.id)) return { ok: false, reason: 'active' }
  ;(S.workouts || []).forEach(w => (w.entries || []).forEach(e => {
    if (e.id === ex.id && !e.muscleSnapshot?.n && !e.n) e.n = ex.n
  }))
  S.customEx = (S.customEx || []).filter(x => x.id !== ex.id)
  actRoutine(S, { type: 'purgeExercise', exId: ex.id })
  S.favorites = (S.favorites || []).filter(id => id !== ex.id)
  return { ok: true, reason: null }
}

/**
 * @param {Profile} S
 * @param {{ id?: string, n: string, tg?: string, sm?: string[], desc?: string }} draft
 * @returns {string}
 */
export function upsertCustomEx(S, draft) {
  const bp = bodypartForMuscle(draft.tg)
  if (draft.id) {
    const entry = (S.customEx || []).find(x => x.id === draft.id)
    if (entry) {
      entry.n = draft.n
      entry.tg = draft.tg
      entry.sm = draft.sm
      if (draft.tg) entry.bp = bp
      entry.desc = draft.desc
    }
    return draft.id
  }
  S.customEx = S.customEx || []
  const id = 'c' + uid()
  S.customEx.push({ id, n: draft.n, bp, tg: draft.tg, sm: draft.sm, desc: draft.desc, eq: 'custom', custom: true })
  return id
}
