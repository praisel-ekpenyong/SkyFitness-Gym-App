import { useUI } from './useUI.js'
import { playSetComplete, playWorkoutComplete } from '../lib/sound.js'
import { t } from '../lib/i18n.js'

const NOTICE = { cardio: () => t('Cardio logged'), timed: () => t('Hold logged') }

/**
 * Applies the Active workout's effects to the timers, sound and toasts.
 * The only store code that touches useUI. `open-finish` is left to the view,
 * because opening a sheet from here would be an import cycle.
 * @param {Array<{type: string}>} effects - From act().
 * @param {Object} S - The Profile, for `restSec` and `sound`.
 */
export function runEffects(effects, S) {
  const ui = useUI.getState()
  for (const e of effects) {
    if (e.type === 'rest:start') ui.startRest(S.restSec)
    else if (e.type === 'rest:stop') ui.stopRest()
    else if (e.type === 'hold:stop') ui.stopWork()
    else if (e.type === 'sound:set') playSetComplete(S.sound)
    else if (e.type === 'sound:finish') playWorkoutComplete(S.sound)
    else if (e.type === 'notice' && NOTICE[e.notice]) ui.toast(NOTICE[e.notice]())
  }
}
