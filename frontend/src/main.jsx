import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MOBILE, nativeSink } from './lib/mobile.js'
import { registerSink } from './lib/storage.js'
import './index.css'

// Mobile builds mirror every save into the app's data directory (survives WebView storage
// eviction). Registered before anything renders, so no persist can outrun it.
if (MOBILE) registerSink(nativeSink)

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)

// Not in the mobile build: the native shell already serves everything from disk.
if (!MOBILE && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}
