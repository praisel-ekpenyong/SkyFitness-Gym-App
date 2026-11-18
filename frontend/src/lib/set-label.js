import { t } from './i18n-core.js'
import { modeOf, isBw, isPerSide, sideReps } from './workout-model.js'
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

export const formatSet = setLabel

export function exLine(cfg, unit) {
  const mode = modeOf(cfg)
  const n = cfg.sets || 1
  const load = cfg.weight ? ' · ' + (isBw(cfg) ? fmtSigned(cfg.weight) : fmtNum(cfg.weight)) + ' ' + unit : ''
  if (mode === 'cardio') return `${n} × ${cfg.min || 20} min @ ${fmtNum(cfg.speed || 8)} km/h`
  if (mode === 'time') return `${n} × ${fmtSec(cfg.sec || 45)}${load}`
  const split = isPerSide(cfg) ? ' · ' + t('{0}/side', fmtNum(sideReps(cfg.reps))) : ''
  return `${n} × ${cfg.reps}${load}${split}`
}
