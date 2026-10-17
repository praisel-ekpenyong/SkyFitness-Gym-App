// Write side of Catalogue curations (CONTEXT.md): starring a Favorite exercise,
// deleting a Custom exercise and saving one. Three screens hand-rolled the
// favorites toggle, and the delete cascade mutated five collections from an
// import of the sheet — with the one policy that keeps deleted customs readable
// in history (the muscle snapshot) untested. The custom-exercise form assembled
// the stored record inline; the update-vs-create fork and the record's shape
// are decided once here, at the same seam. Reads stay in catalogue-query.js /
// exercises.js; write-side siblings live in schedule.js and bodyweight.js.

import { exerciseMuscleSnapshot, bodypartForMuscle } from './muscles.js'
import { cleanupSg } from './supersetFlow.js'
import { uid } from './format.js'

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
 * Delete a Custom exercise (CONTEXT.md: Unknown exercise — "a deleted custom…
 * rendered, removable, never fatal").
 *
 * The one home for the delete cascade, with every policy it owns stated once:
 * - the Active workout holds the id → refuse (the sheet asks before opening
 *   the confirm dialog; this seam refuses again for anyone who forgot to ask)
 * - history keeps rendering: matching finished entries get the display name
 *   stamped and a muscle snapshot filled in — once, only where none is stored
 * - routine sweeps that strand a lone superset tag dissolve it (cleanupSg)
 * - everything the exercise owned stands down: its customEx row, its entries in
 *   every routine, its Best suggestion (`exWeights`) and its star
 *
 * Never touches `week` / `dayPlan`: a Routine loses one Entry, it stays
 * scheduled. The Deleted-custom id itself is never rewritten — the resolver
 * (`exOr`) keeps rendering it as Unknown wherever it is still stored.
 *
 * @param {Object} S - Application state atom.
 * @param {Object} ex - Custom exercise to delete (needs `id`, `n`).
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

/**
 * Create or update a Custom exercise (CONTEXT.md: Custom exercise) — the store
 * write of the custom-exercise form. The sheet keeps everything that decides
 * *whether* to save (required name, required primary, duplicate-name check,
 * cardio clearing secondaries); this seam owns everything about *what* lands:
 * - update: exactly the five editable fields (n, tg, sm, bp, desc) mutate on
 *   the found entry; a stale id (entry gone) writes nothing — the silent
 *   no-op the sheet has always shown, preserved
 * - create: the stored record shape, stated once — fresh `'c' + uid()` id,
 *   `eq: 'custom'`, `custom: true`, body part derived from the primary
 * The form passes only user-entered fields; it never assembles the record.
 *
 * @param {Object} S - Application state atom.
 * @param {Object} draft - User-entered fields: `{ id, n, tg, sm, desc }` (id null to create).
 * @returns {string} The stored exercise's id — the sheet's `onDone(EXIDX[id])` reads it even when nothing was written.
 */
export function upsertCustomEx(S, draft) {
  const bp = bodypartForMuscle(draft.tg)
  if (draft.id) {
    const entry = (S.customEx || []).find(x => x.id === draft.id)
    if (entry) {
      entry.n = draft.n
      entry.tg = draft.tg
      entry.sm = draft.sm
      entry.bp = bp
      entry.desc = draft.desc
    }
    return draft.id
  }
  S.customEx = S.customEx || []
  const id = 'c' + uid()
  S.customEx.push({ id, n: draft.n, bp, tg: draft.tg, sm: draft.sm, desc: draft.desc, eq: 'custom', custom: true })
  return id
}
