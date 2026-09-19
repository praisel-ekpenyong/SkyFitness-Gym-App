/* Sky service worker — runtime caching (works with Vite's hashed asset names).
   Exercise media (/media/images/, /media/videos/) cache-first; everything else
   network-first with offline fallback. */
const CACHE = 'sky-rt-v1'

self.addEventListener('install', () => self.skipWaiting())
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

  // Local bundles live under public/media/ (see npm run media:fetch); CDN mirrors keep
  // the same /media/images|videos shape via VITE_IMG_BASE/VITE_GIF_BASE overrides.
  const isMedia = url.pathname.includes('/media/images/') || url.pathname.includes('/media/videos/')
  if (isMedia) {
    e.respondWith(caches.open(CACHE).then(c => c.match(e.request).then(hit =>
      hit || fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res })
    )))
  } else {
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
      return res
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html'))))
  }
})
