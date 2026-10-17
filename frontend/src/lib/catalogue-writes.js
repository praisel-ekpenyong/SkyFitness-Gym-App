// Write side of Catalogue curations (CONTEXT.md): starring a Favorite exercise
// and retiring a Custom exercise. Three screens hand-rolled the favorites
// toggle, and the retire cascade mutated five collections from an import of the
// sheet — with the one policy that keeps deleted customs readable in history
// (the muscle snapshot) untested. Reads stay in catalogue-query.js /
// exercises.js; write-side siblings live in schedule.js and bodyweight.js.

import { exerciseMuscleSnapshot } from './muscles.js'
import { cleanupSg } from './supersetFlow.js'

/**
 * Star or unstar one exercise (CONTEXT.md: Favorite exercise — starred for
 * quick access across the library and the exercise pickers).
 *
 * A missing list reads as empty, so a hand-made or partially restored state
 * cannot break the toggle. Never mutates anything else; every star button in
 * the library, the detail sheet and the picker routes through this seam.
 *
 * @param {Object} S - Application state atom.
 * @param {string} id - Exercise id from the catalogue.
 * @returns {boolean} True when the exercise ends up starred.
 */
export function toggleFavorite(S, id) {
  const cur = S.favorites || []
  const star = !cur.includes(id)
  S.favorites = star ? [...cur, id] : cur.filter(x => x !== id)
  return star
}

/**
 * Retire a Custom exercise (CONTEXT.md: Unknown exercise — "a deleted custom…
 * rendered, removable, never fatal").
 *
 * The one home for the cascade, with every policy it owns stated once:
 * - the Active workout holds the id → refuse (the sheet asks before opening
 *   the confirm dialog; this seam refuses again for anyone who forgot to ask)
 * - history keeps rendering: matching finished entries get the display name
 *   stamped and a muscle snapshot filled in — once, only where none is stored
 * - routine sweeps that strand a lone superset tag dissolve it (cleanupSg)
 * - everything the exercise owned makes way: its customEx row, its entries in
 *   every routine, its Best suggestion (`exWeights`) and its star
 *
 * Never touches `week` / `dayPlan`: a Routine loses one Entry, it stays
 * scheduled. The Deleted-custom id itself is never rewritten — the resolver
 * (`exOr`) keeps rendering it as Unknown wherever it is still stored.
 *
 * @param {Object} S - Application state atom.
 * @param {Object} ex - Custom exercise to retire (needs `id`, `n`).
 * @returns {{ ok: boolean, reason: 'active'|null }} Refusal states why.
 */
export function deleteCustomEx(S, ex) {
  if (S.active?.entries?.some(e => e.id === ex.id)) return { ok: false, reason: 'active' }
  const snapshot = exerciseMuscleSnapshot(ex)
  ;(S.workouts || []).forEach(w => (w.entries || []).forEach(e => {
    if (e.id !== ex.id) return
    e.n = ex.n
    if (!e.muscleSnapshot || !Object.keys(e.muscleSnapshot).length) e.muscleSnapshot = snapshot
  }))
  S.customEx = (S.customEx || []).filter(x => x.id !== ex.id)
  ;(S.routines || []).forEach(r => { r.ex = r.ex.filter(e => e.id !== ex.id); cleanupSg(r.ex) })
  delete S.exWeights[ex.id]
  S.favorites = (S.favorites || []).filter(id => id !== ex.id)
  return { ok: true, reason: null }
}
