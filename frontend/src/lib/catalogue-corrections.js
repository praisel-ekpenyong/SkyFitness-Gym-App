/**
 * Movement-pattern corrections to the upstream catalogue (ADR 0012, ADR 0024).
 *
 * Each pattern names the curation it applies and the hand-reviewed catalogue
 * ids it applies to. Name patterns only proposed these ids; every id was read
 * and checked. Combination moves and misfires are left out on purpose and
 * keep their catalogue tags. No name matching happens at runtime.
 *
 * Curation fields (spelled the way the catalogue spells muscles):
 * - `tg`: overrides the primary target.
 * - `smAdd`: secondary muscles to add.
 * - `smRemove`: secondary muscles to drop, from `sm` and from `mg`.
 */

export const LOWER_BODY_CORRECTIONS = [
  {
    pattern: 'squat, hack squat, front squat',
    tg: 'quads',
    smAdd: ['glutes', 'adductors'],
    smRemove: ['quadriceps', 'hamstrings', 'calves', 'core'],
    ids: ['0043'],
  },
]

/**
 * Flattens pattern lists into the id-keyed overlay the catalogue index reads.
 * @param {Object[]} patterns - Pattern entries with `ids` and curation fields.
 * @returns {Object} Map of catalogue id to `{ tg?, smAdd?, smRemove? }`.
 */
export function curationsByIdOf(patterns) {
  const out = {}
  for (const { ids, pattern, ...curation } of patterns) {
    for (const id of ids) {
      if (out[id]) throw new Error(`catalogue id ${id} is in two correction patterns`)
      out[id] = curation
    }
  }
  return out
}
