/* Sky service worker — precached shell plus scoped runtime caching (works with Vite's
   hashed asset names).
   - install precaches the app-shell entry points so the FIRST offline visit opens;
     navigations fall back to the cached index.html when the network is gone.
   - Exercise media (/media/images/, /media/videos/) is cache-first with a graceful
     503 fallback so an uncached asset offline resolves instead of breaking the fetch.
   - Runtime caching is scoped to shell plus assets (navigations, scripts, styles,
     images, icons, manifest) under one versioned name. Bump the version
     (sky-rt-v1 -> sky-rt-v2) whenever the precached shell format changes; activate
     purges every other key so stale shells cannot linger.
   - Exercise art from the pinned dataset CDN is cache-first in its own cache (MEDIA_CACHE), which
     survives shell updates and is capped, so every exercise once seen still shows offline. */
const CACHE = 'sky-rt-v1'
const MEDIA_CACHE = 'sky-media-v1'
const MEDIA_MAX = 400   // entries; oldest go first. A GIF is ~100-300 KB.
// Only the dataset the app pins (src/lib/exercises.js); any other cross-origin request is left alone.
const CDN_MEDIA_RE = /^https:\/\/cdn\.jsdelivr\.net\/gh\/hasaneyldrm\/exercises-dataset@[0-9a-f]+\/(images|videos)\//

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
    Promise.all(keys.filter(k => k !== CACHE && k !== MEDIA_CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()))
})
// Rest-timer reminders go through reg.showNotification() from useUI.js directly — there is no
// push: Sky has no server to push from.

// Exercise art: cache-first. Only a real image is stored: a missing local file comes back as the
// app page (the host's SPA fallback answers every path with index.html), which must not be kept
// under an image's name. Uncached art offline answers 503 so the <img> can fall back.
const isImage = res => res.ok && /^image\//.test(res.headers?.get?.('content-type') || '')
async function trim(c) {
  if (typeof c.keys !== 'function') return
  const keys = await c.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MEDIA_MAX)).map(k => c.delete(k)))
}
const mediaFirst = (req, name) => caches.open(name).then(c => c.match(req).then(hit =>
  hit || fetch(req).then(res => {
    if (isImage(res)) { const copy = res.clone(); c.put(req, copy).then(() => trim(c)) }
    return res
  }).catch(() => new Response('', { status: 503, statusText: 'Offline' }))
))

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return
  if (CDN_MEDIA_RE.test(e.request.url)) { e.respondWith(mediaFirst(e.request, MEDIA_CACHE)); return }
  if (url.origin !== location.origin) return
  if (url.pathname.endsWith('/sw.js') || !isShellOrAsset(url, e.request)) return

  // Local bundles live under public/media/ (see npm run media:fetch); CDN mirrors keep
  // the same /media/images|videos shape via VITE_IMG_BASE/VITE_GIF_BASE overrides.
  const isMedia = MEDIA_RE.test(url.pathname)
  if (isMedia) {
    e.respondWith(mediaFirst(e.request, CACHE))
  } else {
    e.respondWith(fetch(e.request).then(res => {
      // Clone here, not inside the .then: by the time caches.open resolves the page has started
      // reading `res`, its body is spent, and a late clone throws so nothing is ever cached.
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)) }
      return res
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html'))))
  }
})
