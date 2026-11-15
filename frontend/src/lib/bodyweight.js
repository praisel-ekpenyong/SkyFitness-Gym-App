
export { LB_TO_KG } from './units.js'
import { LB_TO_KG } from './units.js'

/**
 * Round a weigh-in to the stored 1-decimal policy.
 *
 * @param {number} w - Raw weight in the profile unit.
 * @returns {number} Weight rounded to one decimal.
 */
export const round1 = w => Math.round(w * 10) / 10

const byDay = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)

const stored = e => ({ d: e.d, w: round1(e.w), ...(e.t !== undefined ? { t: e.t } : {}) })

function writableLog(S) {
  if (!Array.isArray(S.bodyweight)) S.bodyweight = []
  return S.bodyweight
}

/**
 * Record one weigh-in (the sheet write rule: same day overwrites).
 *
 * @param {Object} S - Application state atom.
 * @param {string} d - Calendar date in ISO format ('YYYY-MM-DD').
 * @param {number} w - Weigh-in value in the profile unit (must be positive).
 * @param {number} [t] - Optional millisecond timestamp.
 * @param {boolean} [overwrite=true] - False leaves an existing day alone.
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

export function mergeWeighIns(S, entries = []) {
  const log = writableLog(S)
  const fresh = freshByDay(log, entries)
  fresh.forEach(e => log.push(stored(e)))
  log.sort(byDay)
  return { added: fresh.length, skipped: (entries || []).length - fresh.length }
}

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

export function latestWeighIn(S) {
  const log = S?.bodyweight
  if (!Array.isArray(log) || !log.length) return null
  let best = log[0]
  for (let i = 1; i < log.length; i++) if (log[i].d > best.d) best = log[i]
  return best
}

export function currentBodyweightKg(S) {
  const last = latestWeighIn(S)
  if (!last || !(last.w > 0)) return null
  return S?.unit === 'lb' ? last.w * LB_TO_KG : last.w
}

export function deltaTowardGoal(targetW, currentW, delta) {
  if (!delta) return 'var(--label-2)'
  if (!targetW) return 'var(--label)'
  const up = targetW > currentW
  return (delta > 0) === up ? 'var(--acc-text)' : 'var(--red-text)'
}
