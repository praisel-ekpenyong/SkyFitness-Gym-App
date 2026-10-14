import { useSyncExternalStore } from 'react'
import { t } from '../lib/i18n.js'

function subscribe(fn) {
  window.addEventListener('online', fn)
  window.addEventListener('offline', fn)
  return () => {
    window.removeEventListener('online', fn)
    window.removeEventListener('offline', fn)
  }
}

// Tiny local-serving indicator: hidden while online, a status badge while the
// service worker is serving the shell from cache.
export default function OfflineBadge() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  if (online) return null
  return <div className="offline-badge" role="status">{t('Offline · serving locally')}</div>
}
