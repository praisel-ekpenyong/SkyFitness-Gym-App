import { modeOf, isBw } from './workout-model.js'
import { EFFORT } from './effort.js'
import { fmtNum, fmtSigned, fmtSec } from './format.js'

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
