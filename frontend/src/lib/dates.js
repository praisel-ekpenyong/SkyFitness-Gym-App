import { dateLocale } from './i18n-core.js'

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
 * Parses a YYYY-MM-DD day key into a local Date at midday (12:00:00) to avoid DST boundary shifts.
 * @param {string} d - Day key in `YYYY-MM-DD` format.
 * @returns {Date} Date instance set to local noon.
 */
export function parseDay(d) {
  return d ? new Date(d + 'T12:00:00') : new Date(NaN)
}

/**
 * Renders a stored day key as the short or weekday list date the user reads.
 * @param {string} iso - Day key in `YYYY-MM-DD` form; parsed at midday to avoid DST shifts.
 * @param {boolean} long - When truthy adds the short weekday; otherwise day and month only.
 * @returns {string} Date formatted in the UI language.
 */
export function fmtDate(iso, long) {
  const d = parseDay(iso)
  return d.toLocaleDateString(dateLocale(), long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' })
}

/**
 * Monday-first weekday index of a date: Monday 0 ... Sunday 6.
 * @param {Date} d - Local date.
 * @returns {number} 0-6, Monday first.
 */
export const mondayIndexOf = d => (d.getDay() + 6) % 7

/**
 * Fails loudly when a clock argument is not a millisecond timestamp, so a forgotten or misplaced `now` never reads as NaN dates.
 * @param {*} now - The value received as the clock.
 * @param {string} name - Parameter name, for the message.
 * @throws {TypeError} When `now` is not a finite number.
 */
export function assertClock(now, name = 'now') {
  if (!Number.isFinite(now)) throw new TypeError(`${name} must be a finite millisecond timestamp, got ${String(now)}`)
}

/**
 * Groups a day key into its ISO calendar week bucket for weekly totals.
 * @param {string} d - Day key in `YYYY-MM-DD` form.
 * @returns {string} `YYYY-W` week key; week runs 1-53 and may belong to the adjacent year.
 */
export function weekKey(d) {
  const dt = parseDay(d)
  const day = mondayIndexOf(dt)
  dt.setDate(dt.getDate() - day + 3)
  const jan4 = new Date(dt.getFullYear(), 0, 4)
  const week = 1 + Math.round(((dt - jan4) / 86400000 - 3 + mondayIndexOf(jan4)) / 7)
  return dt.getFullYear() + '-' + week
}

/**
 * The Monday that starts the ISO week holding a day.
 * @param {string} d - Day key in `YYYY-MM-DD` form.
 * @returns {string} That week's Monday as a `YYYY-MM-DD` day key.
 */
export function mondayOf(d) {
  const dt = parseDay(d)
  dt.setDate(dt.getDate() - mondayIndexOf(dt))
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
  const t = parseDay(w.d).getTime()
  return Number.isFinite(t) ? t : NaN
}
