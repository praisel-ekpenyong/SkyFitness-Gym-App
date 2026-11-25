import { t } from './i18n-core.js'
import { fmtNum } from './format.js'

/**
 * The sentence that explains one week's mark in the calendar.
 * @param {{ state: string, run?: number }} week
 * @returns {string}
 */
export function weekExplanation(week) {
  switch (week.state) {
    case 'counted':
      return t('You trained, so this week counts. Streak: {0}.', fmtNum(week.run ?? 0))
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

/**
 * The accessible name of a week's mark, e.g. "Week of 3 Nov: counted".
 * @param {string} dayLabel
 * @param {string} state
 * @returns {string}
 */
export function markLabel(dayLabel, state) {
  return t('Week of {0}: {1}', dayLabel, t(state))
}

/** @type {Record<string, string>} */
const MARK_ICON = { counted: 'check', broke: 'xmark', missed: 'minus' }

/**
 * The icon name drawn inside a week's mark, or null for a state with no icon (an open week).
 * @param {string} state
 * @returns {string | null}
 */
export function markIcon(state) {
  return MARK_ICON[state] ?? null
}
