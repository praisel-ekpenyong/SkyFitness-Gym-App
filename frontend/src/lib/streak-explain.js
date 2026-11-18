import { t } from './i18n-core.js'
import { fmtNum } from './format.js'

/** The sentence that explains one week's mark in the calendar. */
export function weekExplanation(week) {
  switch (week.state) {
    case 'counted':
      return t('You trained, so this week counts. Streak: {0}.', fmtNum(week.run))
    case 'broke':
      return t('No workout, so the streak started over.')
    case 'missed':
      return t('No workout this week.')
    case 'open':
      return t('Still open. One workout and it counts.')
    default:
      return ''
  }
}

/** The accessible name of a week's mark, e.g. "Week of 3 Nov: counted". */
export function markLabel(dayLabel, state) {
  return t('Week of {0}: {1}', dayLabel, t(state))
}

const MARK_ICON = { counted: 'check', broke: 'xmark', missed: 'minus' }

/** The icon name drawn inside a week's mark, or null for a state with no icon (an open week). */
export function markIcon(state) {
  return MARK_ICON[state] ?? null
}
