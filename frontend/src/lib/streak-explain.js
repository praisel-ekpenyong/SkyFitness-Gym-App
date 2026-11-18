import { t } from './i18n-core.js'
import { FREEZE_BANK } from './streak.js'
import { fmtNum } from './format.js'

/** The sentence that explains one week's mark in the calendar. */
export function weekExplanation(week, rule) {
  switch (week.state) {
    case 'counted': {
      const base = t('You trained, so this week counts. Streak: {0}.', week.run)
      return week.earned ? base + ' ' + t('It also earned a freeze.') : base
    }
    case 'frozen':
      return t('No workout, so a freeze covered it. The streak kept going, but this week adds nothing.')
    case 'broke':
      return rule === 'strict'
        ? t('No workout, and your rule has no freezes, so the streak started over.')
        : t('No workout and no freeze left, so the streak started over.')
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

/** The freeze line under the calendar header: what the bank holds and how the next freeze is earned. */
export function freezeLine({ rule, freezes, toNextFreeze }) {
  if (FREEZE_BANK[rule] === 0) return t('Strict rule: no freezes are banked.')
  if (freezes >= FREEZE_BANK[rule]) return t('Bank full: the next freeze would be lost.')
  return toNextFreeze === 1
    ? t('Next freeze in {0} counted week.', fmtNum(toNextFreeze))
    : t('Next freeze in {0} counted weeks.', fmtNum(toNextFreeze))
}

/** The freeze rules in the order the picker lists them. */
export const RULE_ORDER = ['strict', 'gentle', 'generous']
export const RULE_NAME = { strict: 'Strict', gentle: 'Gentle', generous: 'Generous' }

/** The short preview under a rule's name in the picker: its current and best streak, e.g. "14 wk · best 14". */
export function ruleSegmentPreview({ current, best }) {
  return t('{0} wk · best {1}', fmtNum(current), fmtNum(best))
}

/** A rule, its bank size, and what its current and best streak would be: the picker option's accessible label. */
export function rulePreviewLine(rule, { current, best }) {
  const bank = FREEZE_BANK[rule]
  const freezes = bank === 1 ? t('{0} freeze', fmtNum(bank)) : t('{0} freezes', fmtNum(bank))
  const now = current === 1 ? t('{0} week', fmtNum(current)) : t('{0} weeks', fmtNum(current))
  return t('{0} ({1}): {2}, best {3}', t(RULE_NAME[rule]), freezes, now, fmtNum(best))
}
