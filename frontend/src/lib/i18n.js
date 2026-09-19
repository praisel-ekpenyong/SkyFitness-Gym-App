// Browser-only shell of the i18n module. The runtime-agnostic state and readers live
// in i18n-core.js (plain Node-loadable); this file adds the React subscription hook `useLang`
// and a `setLang` kept as an async no-op so boot code needs no re-plumbing.

import { useSyncExternalStore } from 'react'
import { dateLocale, t, instrFor, getVersion, _setLangState } from './i18n-core.js'

export { dateLocale, t, instrFor }

// React subscription bookkeeping — kept here, not in core, so core has zero React coupling.
const subs = new Set()
const notify = () => { subs.forEach(f => f()) }

// Sky ships English only — the locale/instruction packs and their lazy loaders are gone.
// setLang stays because App.jsx calls it on boot. The first call notifies so the shell settles
// after mount; later calls skip it — nothing can change.
export async function setLang() {
  if (_setLangState() > 1) return
  notify()
}

// Re-renders the subscribing component (and its children) whenever the language changes.
export function useLang() {
  return useSyncExternalStore(fn => { subs.add(fn); return () => subs.delete(fn) }, getVersion)
}
