import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MOBILE, nativeSink } from './lib/mobile.js'
import { BASE_URL } from './lib/env.js'
import { registerSink } from './lib/storage.js'
// Bundled, never fetched from a font CDN: the CSP is same-origin, the app must open offline,
// and a plain build phones nowhere. wdth.css carries both axes the design system uses.
import '@fontsource-variable/archivo/wdth.css'
import './index.css'

// Mobile builds mirror every save into the app's data directory (survives WebView storage
// eviction). Registered before anything renders, so no persist can outrun it.
if (MOBILE) registerSink(nativeSink)

// The app owns scroll: every route starts at the top and sheets lock and restore the page. A
// sheet's history entry is rewound on close, and the browser's own restoration on that rewind
// would land after ours and put the page back where it was.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)

// Warm every screen once the first has painted. The service worker caches what gets fetched, so a
// screen never opened online would be missing offline, and the gym is where the signal drops: a
// workout must be able to start there. It also makes every later tab switch instant.
const warmScreens = () => [
  import('./views/Workout.jsx'), import('./views/Plan.jsx'), import('./views/RoutineEdit.jsx'),
  import('./views/Stats.jsx'), import('./views/History.jsx'), import('./views/Library.jsx'),
  import('./views/Settings.jsx'), import('./lib/body-paths.js'),
].forEach(p => p.catch(() => {}))
if (window.requestIdleCallback) window.requestIdleCallback(warmScreens, { timeout: 3000 })
else setTimeout(warmScreens, 1500)

// Not in the mobile build: the native shell already serves everything from disk.
// Service workers need a secure context — https, localhost, or the Capacitor shell —
// so gate on isSecureContext (covers https + http://localhost previews) with a
// localhost-hostname fallback for older browsers. BASE_URL from the environment
// seam keeps the scope correct on subpath deploys instead of a bare relative 'sw.js'.
if (!MOBILE && 'serviceWorker' in navigator) {
  const secure = (typeof window !== 'undefined' && window.isSecureContext)
    || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    || location.protocol === 'https:'
  if (secure) {
    const swUrl = BASE_URL + 'sw.js'
    navigator.serviceWorker.register(swUrl).catch(() => {})
  }
}
