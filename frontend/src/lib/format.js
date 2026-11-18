
import { dateLocale, t } from './i18n-core.js'
import { modeOf, isBw, isPerSide, sideReps } from './workout-model.js'
import { EFFORT } from './effort.js'
/**
 * Today's local calendar date as callers store and compare day keys.
 * @returns {string} Date in `YYYY-MM-DD` local time, zero-padded, never UTC-shifted.
 */
export const todayISO = () => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
/**
 * Formats a Date as the `YYYY-MM-DD` day key the log is grouped by.
 * @param {Date} d - Local date to format; must be a valid Date.
 * @returns {string} Zero-padded `YYYY-MM-DD` in local time.
 */
export const isoOf = d =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

export const DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Renders a stored day key as the short or weekday list date the user reads.
 * @param {string} iso - Day key in `YYYY-MM-DD` form; parsed at midday to avoid DST shifts.
 * @param {boolean} long - When truthy adds the short weekday; otherwise day and month only.
 * @returns {string} Date formatted in the UI language.
 */
export function fmtDate(iso, long) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString(dateLocale(), long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' })
}
export function fmtDurParts(ms) {
  const m = Math.floor(ms / 60000)
  return m >= 60 ? [[fmtNum(Math.floor(m / 60)), 'h'], [String(m % 60), 'm']] : [[fmtNum(m), ' min']]
}
/**
 * Renders a duration in milliseconds as the compact list duration the user reads.
 * @param {number} ms - Elapsed milliseconds; values below one minute read as `0 min`.
 * @returns {string} `M min` below one hour, otherwise `Hh Mm`.
 */
export const fmtDur = ms => fmtDurParts(ms).map(p => p.join('')).join(' ')
export const durPart = ms => (ms >= 60000 ? [fmtDur(ms)] : [])
export const fmtNum = n => (Math.round(n * 10) / 10).toLocaleString(dateLocale())
export const fmtVol = (v, unit) => fmtNum(v) + ' ' + unit

export const MINUS = '\u2212'
export function fmtSigned(n, fmt = fmtNum) {
  const v = Number(n) || 0
  const body = fmt(Math.abs(v))
  if (!/[1-9]/.test(body)) return body
  return (v < 0 ? MINUS : '+') + body
}

const PROPER = { ez: 'EZ', bosu: 'BOSU', skierg: 'SkiErg' }
const UNIT = /^(kg|lb|lbs|km\/h|min|s|h|m)$/
export function sentenceCase(s) {
  const words = String(s ?? '').split(' ')
  const fixed = words.map(w => PROPER[w.toLowerCase()] || w)
  const [first = ''] = fixed
  if (!UNIT.test(first) && first === words[0]) fixed[0] = first.charAt(0).toUpperCase() + first.slice(1)
  return fixed.join(' ')
}
export const exCount = n => t(n === 1 ? '{0} exercise' : '{0} exercises', n)

/**
 * Groups a day key into its ISO calendar week bucket for weekly totals.
 * @param {string} d - Day key in `YYYY-MM-DD` form.
 * @returns {string} `YYYY-W` week key; week runs 1-53 and may belong to the adjacent year.
 */
export function weekKey(d) {
  const dt = new Date(d + 'T12:00:00')
  const day = (dt.getDay() + 6) % 7
  dt.setDate(dt.getDate() - day + 3)
  const jan4 = new Date(dt.getFullYear(), 0, 4)
  const week = 1 + Math.round(((dt - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7)
  return dt.getFullYear() + '-' + week
}

/**
 * The Monday that starts the ISO week holding a day.
 * @param {string} d - Day key in `YYYY-MM-DD` form.
 * @returns {string} That week's Monday as a `YYYY-MM-DD` day key.
 */
export function mondayOf(d) {
  const dt = new Date(d + 'T12:00:00')
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
  return isoOf(dt)
}

/**
 * Groups a day key or dated record into its calendar month bucket.
 * @param {string|Object} value - Day key string, or an object carrying a `d` day key; empty or missing input reads as empty.
 * @returns {string} `YYYY-MM` prefix, or an empty string when nothing parseable was given.
 */
export function monthKey(value) {
  const raw = value && typeof value === 'object' ? value.d ?? value : value
  return String(raw || '').slice(0, 7)
}

/**
 * Reports the device's IANA time-zone name for display and export stamps.
 * @returns {string} Zone name such as `Europe/Zurich`; `UTC` when undetectable.
 */
export const localTZ = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' } }

/**
 * Mints a short unique id for a new workout, routine, or imported exercise.
 * @returns {string} Base-36 timestamp plus random suffix; unique per call.
 */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

/**
 * Resolves a workout or weigh-in to a single sortable millisecond timestamp.
 * @param {Object} w - Workout or body-weight record with a numeric `start`/`t`, or a `d` day key; nullish or unparseable input yields NaN.
 * @returns {number} Milliseconds since epoch; NaN when no usable time is present.
 */
export function workoutTimestamp(w) {
  const ts = w?.start ?? w?.t
  if (ts != null) {
    const n = Number(ts)
    if (Number.isFinite(n)) return n
  }
  if (!w?.d) return NaN
  const t = new Date(w.d).getTime()
  return Number.isFinite(t) ? t : NaN
}
export const ACCENTS = { lime: '#a3e635', sky: '#5cb8ff', violet: '#b79cff', pink: '#ff6fa3', teal: '#3dd6c4' }

const clockText = n => Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0')

/**
 * Formats a duration in seconds as `m:ss`, rounding to the nearest second.
 * @param {number} sec - Duration in seconds; negatives and junk clamp to zero.
 * @returns {string} Minutes and seconds such as `1:30`.
 */
export function fmtSec(sec) {
  return clockText(Math.max(0, Math.round(Number(sec) || 0)))
}

export function fmtElapsed(sec) {
  return clockText(Math.max(0, Math.floor(Number(sec) || 0)))
}

const effortTail = s => {
  const k = s?.rir != null ? 'rir' : s?.rpe != null ? 'rpe' : null
  return k && EFFORT[k] ? ` (${EFFORT[k].hd} ${fmtNum(s[k])})` : ''
}

export function setLabel(id, s, cfg) {
  const c = cfg || { id }
  const mode = modeOf(c)
  if (mode === 'cardio') return `${s.min || 0} min @ ${fmtNum(s.speed || 0)} km/h`
  if (mode === 'time') return fmtSec(s.sec) + (s.w > 0 ? ` · ${fmtNum(s.w)}` : '')
  const reps = s.r || 0
  if (isBw({ ...c, id: c.id ?? id })) {
    const load = s.w > 0 ? `${fmtSigned(s.w)} × ` : ''
    return `${load}${reps}` + effortTail(s)
  }
  return `${fmtNum(s.w || 0)}×${reps}` + effortTail(s)
}

export function exLine(cfg, unit) {
  const mode = modeOf(cfg)
  const n = cfg.sets || 1
  const load = cfg.weight ? ' · ' + (isBw(cfg) ? fmtSigned(cfg.weight) : fmtNum(cfg.weight)) + ' ' + unit : ''
  if (mode === 'cardio') return `${n} × ${cfg.min || 20} min @ ${fmtNum(cfg.speed || 8)} km/h`
  if (mode === 'time') return `${n} × ${fmtSec(cfg.sec || 45)}${load}`
  const split = isPerSide(cfg) ? ' · ' + t('{0}/side', fmtNum(sideReps(cfg.reps))) : ''
  return `${n} × ${cfg.reps}${load}${split}`
}
