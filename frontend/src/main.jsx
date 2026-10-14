import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MOBILE, nativeSink } from './lib/mobile.js'
import { BASE_URL } from './lib/env.js'
import { registerSink } from './lib/storage.js'
import './index.css'
import './skin.css'

// Mobile builds mirror every save into the app's data directory (survives WebView storage
// eviction). Registered before anything renders, so no persist can outrun it.
if (MOBILE) registerSink(nativeSink)

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)

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
