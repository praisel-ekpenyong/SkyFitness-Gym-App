// Body-weight log (GLOSSARY.md): the ongoing series of daily weigh-ins on Home
// with a goal weight — one entry per day, chronological.
//
// The sheet (upsert today's reading), the importer (skip days already logged),
// and Stats (derive the latest reading in kg) each reimplemented this log's
// write rules by hand, so import could silently drift from the sheet. All
// three read and write through this seam now; the batch path sorts once so a
// multi-year Health export does not pay a re-sort per entry.
//
// Never touches the per-workout weigh-in (`w.bw`, GLOSSARY.md: Weigh-in) —
// that stamp belongs to the workout lifecycle, not to this log.

/** Kilograms per pound — the single conversion factor shared with the CSV parser. */
export const LB_TO_KG = 0.45359237

/**
 * Round a weigh-in to the stored 1-decimal policy.
 *
 * @param {number} w - Raw weight in the profile unit.
 * @returns {number} Weight rounded to one decimal.
 */
export const round1 = w => Math.round(w * 10) / 10

/** Chronological order for ISO-day entries. */
const byDay = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)

/** Canonical stored entry: weight rounded to 1 decimal, `t` kept only when supplied. */
const stored = e => ({ d: e.d, w: round1(e.w), ...(e.t !== undefined ? { t: e.t } : {}) })

/**
 * Writable log, normalizing a missing one in place (draft-mutation precedent,
 * ADR 0004-clean). Readers must not use this — see latestWeighIn.
 *
 * @param {Object} S - Application state atom.
 * @returns {Array} The `S.bodyweight` log, always an array afterwards.
 */
function writableLog(S) {
  if (!Array.isArray(S.bodyweight)) S.bodyweight = []
  return S.bodyweight
}

/**
 * Record one weigh-in (the sheet write rule: same day overwrites).
 *
 * @param {Object} S - Application state atom.
 * @param {Object} entry - `{ d, w, t? }` weigh-in in the profile unit; `w` must be positive.
 * @param {Object} [opts] - `{ overwrite: true }`; false leaves an existing day alone.
 * @returns {Object} The stored entry for the day.
 */
export function recordWeighIn(S, { d, w, t } = {}, { overwrite = true } = {}) {
  const log = writableLog(S)
  const ex = log.find(b => b.d === d)
  if (ex) {
    if (!overwrite) return ex
    ex.w = round1(w)
    if (t !== undefined) ex.t = t
  } else log.push(stored({ d, w, t }))
  log.sort(byDay)
  return log.find(b => b.d === d)
}

// The import rule (GLOSSARY.md: Import — existing days win): a weigh-in whose
// day is already logged — or whose day clashes with another weigh-in in the
// same batch — is skipped, so importing twice never rewrites a logged reading.
// One statement shared by the merge and its dry-run below.
function freshByDay(log, entries) {
  const have = new Set(log.map(b => b.d))
  const fresh = []
  for (const e of entries || []) {
    if (!e?.d || have.has(e.d)) continue
    fresh.push(e)
    have.add(e.d)
  }
  return fresh
}

/**
 * Merge a batch of weigh-ins (the import write rule: existing days win, so
 * importing twice never rewrites a logged reading). Sorts once for the batch.
 *
 * @param {Object} S - Application state atom.
 * @param {Array} entries - Weigh-ins in the profile unit.
 * @returns {{ added: number, skipped: number }} Import counts for the summary.
 */
export function mergeWeighIns(S, entries = []) {
  const log = writableLog(S)
  const fresh = freshByDay(log, entries)
  fresh.forEach(e => log.push(stored(e)))
  log.sort(byDay)
  return { added: fresh.length, skipped: (entries || []).length - fresh.length }
}

/**
 * Count what a weigh-in import would do without writing — the ImportSummary
 * reads its totals from this dry-run instead of re-deriving the merge rule by
 * hand in the sheet. Reads only: never normalizes or sorts the log.
 *
 * @param {Object} S - Application state atom.
 * @param {Array} entries - Weigh-ins in the profile unit.
 * @returns {{ added: number, skipped: number }} The same shape mergeWeighIns returns.
 */
export function weighInsPreview(S, entries = []) {
  const log = Array.isArray(S.bodyweight) ? S.bodyweight : []
  const fresh = freshByDay(log, entries)
  return { added: fresh.length, skipped: (entries || []).length - fresh.length }
}

/**
 * Delete one day's weigh-in.
 *
 * @param {Object} S - Application state atom.
 * @param {string} iso - ISO day to remove.
 * @returns {number} Entries removed (0 or 1).
 */
export function deleteWeighIn(S, iso) {
  if (!Array.isArray(S?.bodyweight)) return 0
  const before = S.bodyweight.length
  S.bodyweight = S.bodyweight.filter(b => b.d !== iso)
  return before - S.bodyweight.length
}

/**
 * Read the weigh-in before the latest one (previous distinct day).
 * Order-independent like latestWeighIn, so legacy or hand-edited stores
 * read correctly too.
 *
 * @param {Object} S - Application state atom.
 * @returns {Object|null} Previous `{ d, w, t? }` entry, or null when fewer
 * than two distinct days are logged.
 */
export function prevWeighIn(S) {
  const log = S?.bodyweight
  if (!Array.isArray(log) || log.length < 2) return null
  const last = latestWeighIn(S)
  let prev = null
  for (const b of log) {
    if (b.d < last.d && (!prev || b.d > prev.d)) prev = b
  }
  return prev
}

/**
 * Read the chronologically latest weigh-in. Scans by day rather than taking
 * the last element, so legacy or hand-edited stores read correctly too.
 *
 * @param {Object} S - Application state atom.
 * @returns {Object|null} Latest `{ d, w, t? }` entry, or null when none logged.
 */
export function latestWeighIn(S) {
  const log = S?.bodyweight
  if (!Array.isArray(log) || !log.length) return null
  let best = log[0]
  for (let i = 1; i < log.length; i++) if (log[i].d > best.d) best = log[i]
  return best
}

/**
 * Canonical-kg reading of the latest weigh-in for the fatigue model.
 * Target and readings share `S.unit` (GoalSheet writes the display unit, the
 * parser converts into it), so only a pound profile needs converting.
 *
 * @param {Object} S - Application state atom with `unit` and `bodyweight`.
 * @returns {number|null} Latest weight in kg, or null when none logged.
 */
export function currentBodyweightKg(S) {
  const last = latestWeighIn(S)
  if (!last || !(last.w > 0)) return null
  return S?.unit === 'lb' ? last.w * LB_TO_KG : last.w
}

/**
 * Judge a weight delta against the goal (pure: the caller passes the goal, so
 * no hidden store read). Falsy deltas and an unset goal stay neutral; the
 * "reached!" display stays in the view, not here.
 *
 * Returns a color token rather than an enum: both call sites consume the
 * result directly as a CSS color and there are no other consumers, so an enum
 * would only add a view-side mapping at each site for no extra testability.
 *
 * @param {number|null} targetW - Goal weight in the profile unit, or null when unset.
 * @param {number} currentW - Weight the delta was measured from, same unit.
 * @param {number|null} delta - Signed change in the profile unit.
 * @returns {string} CSS color token: toward-goal, away, or neutral.
 */
export function deltaTowardGoal(targetW, currentW, delta) {
  if (!delta) return 'var(--label-2)'
  if (!targetW) return 'var(--label)'
  const up = targetW > currentW
  return (delta > 0) === up ? 'var(--acc-text)' : 'var(--red-text)'
}
