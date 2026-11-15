// Capacitor's BridgeActivity does not handle back at all — without a JS listener the activity simply finishes.
// Once a `backButton` listener exists, the plugin stops falling through to finish() — back can then only leave the app through App.exitApp().
import { MOBILE } from './mobile.js'
import { useUI } from '../store/useUI.js'
import { t } from './i18n.js'

export const EXIT_WINDOW = 2000

export function decideBack({ top, canGoBack, exitArmed }) {
  if (top) return top.locked ? 'ignore' : 'sheet'
  if (canGoBack) return 'history'
  return exitArmed ? 'exit' : 'arm-exit'
}

export function makeBackHandler({ getSheets, closeSheet, toast, goBack, exit, now = Date.now }) {
  let armedAt = -Infinity
  return (ev = {}) => {
    const sheets = getSheets()
    const action = decideBack({
      top: sheets[sheets.length - 1],
      canGoBack: !!ev.canGoBack,
      exitArmed: now() - armedAt < EXIT_WINDOW,
    })
    if (action !== 'arm-exit') armedAt = -Infinity
    if (action === 'sheet') closeSheet(sheets[sheets.length - 1].id)
    else if (action === 'history') goBack()
    else if (action === 'arm-exit') { armedAt = now(); toast(t('Press back again to exit')) }
    else if (action === 'exit') exit()
    return action
  }
}

export async function initBackButton() {
  if (!MOBILE) return () => {}
  try {
    const { App } = await import('@capacitor/app')
    const handler = makeBackHandler({
      getSheets: () => useUI.getState().sheets,
      closeSheet: id => useUI.getState().closeSheet(id),
      toast: msg => useUI.getState().toast(msg),
      goBack: () => window.history.back(),
      exit: () => App.exitApp(),
    })
    const sub = await App.addListener('backButton', handler)
    return () => sub.remove()
  } catch (e) {
    return () => {}
  }
}
