import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MOBILE, nativeSink } from './platform/mobile.js'
import { BASE_URL } from './lib/env.js'
import { registerSink, persistOnFirstKeep } from './platform/storage.js'
import { useStore } from './store/useStore.js'
import '@fontsource-variable/archivo/wdth.css'
import './index.css'

if (MOBILE) registerSink(nativeSink)
else persistOnFirstKeep(useStore.subscribe, navigator.storage)

if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)

const warmScreens = () => [
  import('./views/Workout.jsx'), import('./views/Plan.jsx'), import('./views/RoutineEdit.jsx'),
  import('./views/Stats.jsx'), import('./views/History.jsx'), import('./views/Library.jsx'),
  import('./views/Settings.jsx'), import('./lib/body-paths.js'),
].forEach(p => p.catch(() => {}))
if (window.requestIdleCallback) window.requestIdleCallback(warmScreens, { timeout: 3000 })
else setTimeout(warmScreens, 1500)

if (!MOBILE && 'serviceWorker' in navigator) {
  const secure = (typeof window !== 'undefined' && window.isSecureContext)
    || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    || location.protocol === 'https:'
  if (secure) {
    const swUrl = BASE_URL + 'sw.js'
    navigator.serviceWorker.register(swUrl).catch(() => {})
  }
}
