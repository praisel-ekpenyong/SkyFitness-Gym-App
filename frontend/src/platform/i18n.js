import { useSyncExternalStore } from 'react'
import { getVersion, _setLangState } from '../lib/i18n-core.js'

const subs = new Set()
const notify = () => { subs.forEach(f => f()) }

export async function setLang() {
  if (_setLangState() > 1) return
  notify()
}

export function useLang() {
  return useSyncExternalStore(fn => { subs.add(fn); return () => subs.delete(fn) }, getVersion)
}
