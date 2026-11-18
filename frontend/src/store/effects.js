import { useUI } from './useUI.js'
import { playSetComplete, playWorkoutComplete } from '../platform/sound.js'
import { t } from '../lib/i18n.js'

const NOTICE = { cardio: () => t('Cardio logged'), timed: () => t('Hold logged') }

/**
 * Applies the Active workout's effects to the timers, sound and toasts.
 * The only store code that touches useUI. `open-finish` is left to the view,
 * because opening a sheet from here would be an import cycle.
 * @param {Array<{type: string}>} effects - From act(). A `rest:start` may name its `sec`; one that does not rests for the Profile's `restSec`.
 * @param {() => Object} getS - The live Profile, for `restSec` and `sound`; timers read `sound` on every tick.
 * @param {(command: Object) => *} [send] - Where a hold sends `completeHold` when its time is up; required for `hold:start`.
 */
export function runEffects(effects, getS, send) {
  if (!send && effects.some(e => e.type === 'hold:start')) throw new Error('A hold needs a sender for its completeHold')
  const ui = useUI.getState()
  const S = getS()
  const soundOn = () => getS().sound
  for (const e of effects) {
    if (e.type === 'rest:start') ui.startRest(e.sec > 0 ? e.sec : S.restSec, soundOn)
    else if (e.type === 'rest:stop') ui.stopRest()
    else if (e.type === 'hold:start') ui.startWork(e.sec, e.label, elapsed => send({ type: 'completeHold', ref: e.ref, elapsed }), soundOn)
    else if (e.type === 'hold:stop') ui.stopWork()
    else if (e.type === 'sound:set') playSetComplete(S.sound)
    else if (e.type === 'sound:finish') playWorkoutComplete(S.sound)
    else if (e.type === 'notice' && NOTICE[e.notice]) ui.toast(NOTICE[e.notice]())
  }
}
