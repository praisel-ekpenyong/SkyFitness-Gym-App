/* Sky service worker — precached shell plus scoped runtime caching (works with Vite's
   hashed asset names).
   - install precaches the app-shell entry points so the FIRST offline visit opens;
     navigations fall back to the cached index.html when the network is gone.
   - Exercise media (/media/images/, /media/videos/) is cache-first with a graceful
     503 fallback so an uncached asset offline resolves instead of breaking the fetch.
   - Runtime caching is scoped to shell plus assets (navigations, scripts, styles,
     images, icons, manifest) under one versioned name. Bump the version
     (sky-rt-v1 -> sky-rt-v2) whenever the precached shell format changes; activate
     purges every other key so stale shells cannot linger. */
const CACHE = 'sky-rt-v1'

// Bump this list (and CACHE above) when a shell entry point is added or renamed.
const SHELL = ['index.html', 'manifest.json']

const MEDIA_RE = /\/media\/(images|videos)\//

const ASSET_RE = /\.(js|css|png|jpe?g|gif|webp|svg|ico|woff2?|json)$/

// Same-origin shell-or-asset only: extensionless routes (the SPA fallback serves
// index.html for those), the precached entries, and static asset extensions.
// Anything else same-origin (unknown documents, worker script itself) is left
// untouched so the runtime cache cannot fill with non-shell responses.
function isShellOrAsset(url, req) {
  if (req.mode === 'navigate' || req.destination === 'document') return true
  const p = url.pathname
  if (p === '/' || p.endsWith('/index.html') || p === '/manifest.json') return true
  if (p.startsWith('/assets/')) return true
  if (!p.split('/').pop().includes('.')) return true   // SPA route -> index.html fallback
  return ASSET_RE.test(p)
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()))
})
// Rest-timer reminders go through reg.showNotification() from useUI.js directly — there is no
// push: Sky has no server to push from.

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.endsWith('/sw.js') || !isShellOrAsset(url, e.request)) return

  // Local bundles live under public/media/ (see npm run media:fetch); CDN mirrors keep
  // the same /media/images|videos shape via VITE_IMG_BASE/VITE_GIF_BASE overrides.
  const isMedia = MEDIA_RE.test(url.pathname)
  if (isMedia) {
    e.respondWith(caches.open(CACHE).then(c => c.match(e.request).then(hit =>
      hit || fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res })
        // Uncached media while offline resolves a fallback instead of breaking the
        // fetch — the <img> onerror path then falls back to the pinned CDN per asset.
        .catch(() => new Response('', { status: 503, statusText: 'Offline' }))
    )))
  } else {
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
      return res
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html'))))
  }
})
