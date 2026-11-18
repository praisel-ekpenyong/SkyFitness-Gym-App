import { dateLocale, t } from './i18n-core.js'
import { modeOf, isBw, isPerSide, sideReps } from './workout-model.js'

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
/** Non-breaking space: a number and its unit never wrap onto separate lines. */
export const NBSP = '\u00a0'
/**
 * Joins a number and its unit with a non-breaking space ("8,200 kg"), for any quantity, not only volume.
 * @param {number} v - The quantity.
 * @param {string} unit - The unit label.
 * @returns {string}
 */
export const fmtVol = (v, unit) => fmtNum(v) + NBSP + unit

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
 * Mints a short unique id for a new workout, routine, or imported exercise.
 * @returns {string} Base-36 timestamp plus random suffix; unique per call.
 */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

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

/** An exercise's planned target as one line, e.g. `3 × 10 · 60 kg`. */
export function exLine(cfg, unit) {
  const mode = modeOf(cfg)
  const n = cfg.sets || 1
  const load = cfg.weight ? ' · ' + (isBw(cfg) ? fmtSigned(cfg.weight) : fmtNum(cfg.weight)) + ' ' + unit : ''
  if (mode === 'cardio') return `${n} × ${cfg.min || 20} min @ ${fmtNum(cfg.speed || 8)} km/h`
  if (mode === 'time') return `${n} × ${fmtSec(cfg.sec || 45)}${load}`
  const split = isPerSide(cfg) ? ' · ' + t('{0}/side', fmtNum(sideReps(cfg.reps))) : ''
  return `${n} × ${cfg.reps}${load}${split}`
}
