import { modeOf, isBw } from './workout-model.js'
import { EFFORT } from './effort.js'
import { fmtNum, fmtSigned, fmtSec } from './format.js'

/** @typedef {import('./types.js').SetRow} SetRow */
/** @typedef {import('./types.js').Target} Target */

/** @param {SetRow | null | undefined} s */
const effortTail = s => {
  const k = s?.rir != null ? 'rir' : s?.rpe != null ? 'rpe' : null
  if (!k) return ''
  const v = k === 'rir' ? s?.rir : s?.rpe
  return v != null ? ` (${EFFORT[k].hd} ${fmtNum(v)})` : ''
}

/**
 * @param {string} id
 * @param {SetRow} s
 * @param {Partial<Target> & { id?: string, perSide?: boolean }} [cfg]
 * @returns {string}
 */
export function setLabel(id, s, cfg) {
  const c = cfg || { id }
  const mode = modeOf(c)
  if (mode === 'cardio') return `${s.min || 0} min @ ${fmtNum(s.speed || 0)} km/h`
  if (mode === 'time') return fmtSec(s.sec ?? 0) + ((s.w ?? 0) > 0 ? ` · ${fmtNum(s.w ?? 0)}` : '')
  const reps = s.r || 0
  if (isBw({ ...c, id: c.id ?? id })) {
    const load = (s.w ?? 0) > 0 ? `${fmtSigned(s.w ?? 0)} × ` : ''
    return `${load}${reps}` + effortTail(s)
  }
  return `${fmtNum(s.w || 0)}×${reps}` + effortTail(s)
}
