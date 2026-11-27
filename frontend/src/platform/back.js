// Capacitor's BridgeActivity does not handle back at all — without a JS listener the activity simply finishes.
import { MOBILE } from './mobile.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'

export const EXIT_WINDOW = 2000

async function capacitorApp() {
  const { App } = await import('@capacitor/app')
  return App
}

/**
 * Registers the native backButton listener and resolves to its disposer. Web builds
 * have no native Back, so they get a no-op disposer.
 * @param {(ev: { canGoBack?: boolean }) => void} handler
 * @returns {Promise<() => void>}
 */
async function listenBackButton(handler) {
  if (!MOBILE) return () => {}
  try {
    const App = await capacitorApp()
    const sub = await App.addListener('backButton', handler)
    return () => { void sub.remove() }
  } catch (e) {
    return () => {}
  }
}

async function exitApp() {
  try {
    const App = await capacitorApp()
    await App.exitApp()
  } catch (e) {}
}

/**
 * @typedef {object} HardwareBackDeps
 * @property {(handler: (ev: { canGoBack?: boolean }) => void) => (() => void) | Promise<() => void>} [listen]
 * @property {() => void} [goBack]
 * @property {(msg: string) => void} [toast]
 * @property {() => void} [exit]
 * @property {() => number} [now]
 */

/**
 * The hardware-Back Adapter for the sheet-history Module. `install` takes the
 * Module's one Back handle and returns an idempotent disposer.
 * @param {HardwareBackDeps} [deps]
 */
export function createHardwareBackAdapter({
  listen = listenBackButton,
  goBack = () => window.history.back(),
  toast = msg => useUI.getState().toast(msg),
  exit = exitApp,
  now = Date.now,
} = {}) {
  return {
    /**
     * @param {() => boolean} handle - the Module's Back handle
     * @returns {() => void} idempotent disposer, unregistering only this listener
     */
    install: handle => {
      let disposed = false
      /** @type {(() => void) | null} */
      let remove = null
      let armedAt = -Infinity

      /** @param {{ canGoBack?: boolean }} [ev] */
      const onBack = ev => {
        if (disposed) return
        if (handle()) { armedAt = -Infinity; return }
        if (ev?.canGoBack) { armedAt = -Infinity; goBack(); return }
        if (now() - armedAt < EXIT_WINDOW) { armedAt = -Infinity; void exit(); return }
        armedAt = now()
        toast(t('Press back again to exit'))
      }

      const registration = listen(onBack)
      /** @param {() => void} remover */
      const attach = remover => {
        if (disposed) remover()
        else remove = remover
      }
      if (registration instanceof Promise) void registration.then(attach).catch(() => {})
      else attach(registration)

      return () => {
        if (disposed) return
        disposed = true
        remove?.()
      }
    },
  }
}
