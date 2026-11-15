const CACHE = 'sky-rt-v1'
const MEDIA_CACHE = 'sky-media-v1'
const MEDIA_MAX = 400
const CDN_MEDIA_RE = /^https:\/\/cdn\.jsdelivr\.net\/gh\/hasaneyldrm\/exercises-dataset@[0-9a-f]+\/(images|videos)\//

const SHELL = ['index.html', 'manifest.json']

const MEDIA_RE = /\/media\/(images|videos)\//

const ASSET_RE = /\.(js|css|png|jpe?g|gif|webp|svg|ico|woff2?|json)$/

function isShellOrAsset(url, req) {
  if (req.mode === 'navigate' || req.destination === 'document') return true
  const p = url.pathname
  if (p === '/' || p.endsWith('/index.html') || p === '/manifest.json') return true
  if (p.startsWith('/assets/')) return true
  if (!p.split('/').pop().includes('.')) return true
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

// Only a real image is stored: a missing local file comes back as the app page (the host's SPA fallback answers every path with index.html), which must not be kept under an image's name.
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

  const isMedia = MEDIA_RE.test(url.pathname)
  if (isMedia) {
    e.respondWith(mediaFirst(e.request, CACHE))
  } else {
    e.respondWith(fetch(e.request).then(res => {
      // Clone here, not inside the .then: by the time caches.open resolves the page has started reading `res`, its body is spent, and a late clone throws so nothing is ever cached.
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)) }
      return res
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html'))))
  }
})
