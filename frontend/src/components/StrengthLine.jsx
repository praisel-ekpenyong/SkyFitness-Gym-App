import { t } from '../lib/i18n.js'
import { fmtNum, fmtVol } from '../lib/format.js'
import { STRENGTH_REASON } from '../lib/strength-level.js'

/**
 * The words for one lift's reading, shared by the Strength levels card row and the exercise detail line.
 * A field is null when that part has nothing to say.
 */
export function strengthWordsOf(lift, unit) {
  const { everTrained, trainedLately, current, peak, next } = lift
  return {
    currentLevel: current ? (current.level ? t(current.level) : t('Below Beginner')) : null,
    peak: peak?.level ? t('Peak {0}', t(peak.level)) : null,
    untrained: everTrained ? null : t('not trained yet'),
    lapsed: everTrained && !trainedLately ? t('not trained lately') : null,
    needsWeighIn: trainedLately && !current ? t('Needs a weigh-in near this lift') : null,
    next: next ? t('Next: {0} at {1}', t(next.level), fmtVol(next.weight, unit)) : null,
  }
}

/** One line in a graded lift's exercise detail: the same wording and states as the Strength levels card. */
export function ExerciseStrengthLine({ reading, unit }) {
  const { reason, trainedLately, peak } = reading
  if (reason === STRENGTH_REASON.sex) return <div className="small muted ex-strength">{t('Set your sex under Settings, Profile to see strength levels.')}</div>
  if (reason === STRENGTH_REASON.weighIn) return <div className="small muted ex-strength">{t('Log a weigh-in to see strength levels.')}</div>
  const w = strengthWordsOf(reading, unit)
  const parts = trainedLately
    ? [w.currentLevel ?? w.needsWeighIn, w.peak, w.next]
    : [w.peak, w.lapsed ?? w.untrained]
  return <div className={'small ex-strength' + (trainedLately ? '' : ' dim')}>
    <span className="muted">{t('Strength')}</span> {parts.filter(Boolean).join(' · ')}
  </div>
}
