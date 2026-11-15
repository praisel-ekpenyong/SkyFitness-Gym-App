
import { useSyncExternalStore } from 'react'
import { dateLocale, t, instrFor, getVersion, _setLangState } from './i18n-core.js'

export { dateLocale, t, instrFor }

const subs = new Set()
const notify = () => { subs.forEach(f => f()) }

export async function setLang() {
  if (_setLangState() > 1) return
  notify()
}

export function useLang() {
  return useSyncExternalStore(fn => { subs.add(fn); return () => subs.delete(fn) }, getVersion)
}
