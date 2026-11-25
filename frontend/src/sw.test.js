import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ORIGIN = 'https://sky.app'
const PINNED = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd'

// An in-memory CacheStorage with the browser's contracts that matter here: entries are keyed
// by absolute URL (a relative path resolves against the worker's origin), `addAll` fetches and
// rejects on a failed response, and a Response body can be read once.
function fakeCacheStorage() {
  const stores = new Map()
  const keyOf = req => new URL(typeof req === 'string' ? req : req.url, ORIGIN).href
  const cacheOf = name => {
    if (!stores.has(name)) stores.set(name, new Map())
    const entries = stores.get(name)
    return {
      match: async req => entries.get(keyOf(req))?.clone(),
      put: async (req, res) => { entries.set(keyOf(req), res) },
      addAll: async reqs => {
        const responses = await Promise.all(reqs.map(r => fetch(new Request(keyOf(r)))))
        responses.forEach((res, i) => {
          if (!res.ok) throw new TypeError(`addAll: ${res.status} for ${reqs[i]}`)
          entries.set(keyOf(reqs[i]), res)
        })
      },
      keys: async () => [...entries.keys()].map(url => new Request(url)),
      delete: async req => entries.delete(keyOf(req)),
    }
  }
  return {
    stores,
    open: async name => cacheOf(name),
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
    match: async req => {
      for (const name of stores.keys()) {
        const hit = await cacheOf(name).match(req)
        if (hit) return hit
      }
    },
  }
}

const image = body => new Response(body, { headers: { 'content-type': 'image/gif' } })
const page = () => new Response('<html>Sky</html>', { headers: { 'content-type': 'text/html' } })
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

describe('Sky Service Worker (sw.js)', () => {
  let listeners
  let caches
  let skipWaiting

  function loadServiceWorker() {
    const code = fs.readFileSync(path.resolve(import.meta.dirname, '../public/sw.js'), 'utf-8')
    const self = {
      addEventListener: (type, fn) => { listeners[type] = fn },
      skipWaiting,
      clients: { claim: vi.fn(async () => {}) },
    }
    new Function('self', 'caches', 'location', code)(self, caches, { origin: ORIGIN })
  }

  async function lifecycle(type) {
    let pending
    listeners[type]({ waitUntil: p => { pending = p } })
    await pending
  }

  /** What the worker answers a GET with, or `undefined` when it leaves the request to the network. */
  async function get(url, init) {
    let responded
    listeners.fetch({ request: new Request(url, init), respondWith: p => { responded = p } })
    return responded && (await responded)
  }

  const cached = async (cacheName, url) => caches.stores.get(cacheName)?.has(url)

  beforeEach(() => {
    listeners = {}
    caches = fakeCacheStorage()
    skipWaiting = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    loadServiceWorker()
  })

  describe('install and activate', () => {
    it('precaches the app shell on install so the first offline visit opens', async () => {
      fetch.mockImplementation(async () => page())
      await lifecycle('install')
      expect(skipWaiting).toHaveBeenCalled()
      expect(await cached('sky-rt-v1', `${ORIGIN}/index.html`)).toBe(true)
      expect(await cached('sky-rt-v1', `${ORIGIN}/manifest.json`)).toBe(true)
    })

    it('does not install when the shell cannot be fetched, so a broken deploy never replaces a working worker', async () => {
      fetch.mockImplementation(async () => new Response('', { status: 500 }))
      await expect(lifecycle('install')).rejects.toThrow()
      expect(skipWaiting).not.toHaveBeenCalled()
    })

    it('purges stale caches on activate but keeps the shell and the exercise art caches', async () => {
      for (const name of ['old-cache', 'sky-rt-v1', 'sky-media-v1']) await caches.open(name)
      await lifecycle('activate')
      expect(await caches.keys()).toEqual(['sky-rt-v1', 'sky-media-v1'])
    })
  })

  describe('app shell', () => {
    it('serves the cached shell for any route when offline', async () => {
      await (await caches.open('sky-rt-v1')).put('index.html', page())
      const res = await get(`${ORIGIN}/plan`)
      expect(await res.text()).toBe('<html>Sky</html>')
    })

    it('leaves non-GET requests and other origins to the network', async () => {
      expect(await get(`${ORIGIN}/plan`, { method: 'POST', body: 'x' })).toBeUndefined()
      expect(await get('https://example.com/app.js')).toBeUndefined()
    })

    it('leaves the worker script itself out of the runtime cache', async () => {
      expect(await get(`${ORIGIN}/sw.js`)).toBeUndefined()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('caches a hashed asset on success and hands the page a body it can still read', async () => {
      fetch.mockImplementation(async () => new Response('app()', { status: 200 }))
      const open = caches.open
      caches.open = name => new Promise(resolve => setTimeout(() => resolve(open(name)), 5))

      const res = await get(`${ORIGIN}/assets/index-abc.js`)
      expect(await res.text()).toBe('app()')
      await new Promise(resolve => setTimeout(resolve, 20))

      const copy = await caches.stores.get('sky-rt-v1').get(`${ORIGIN}/assets/index-abc.js`).text()
      expect(copy).toBe('app()')
    })

    it('does not cache a failed asset response', async () => {
      fetch.mockImplementation(async () => new Response('nope', { status: 404 }))
      await get(`${ORIGIN}/assets/gone.js`)
      await settle()
      expect(await cached('sky-rt-v1', `${ORIGIN}/assets/gone.js`)).toBeFalsy()
    })
  })

  describe('exercise media', () => {
    it('serves local exercise media cache-first, without touching the network', async () => {
      const cache = await caches.open('sky-rt-v1')
      await cache.put(`${ORIGIN}/media/images/0027.jpg`, image('jpg-bytes'))
      await cache.put(`${ORIGIN}/media/videos/0027.gif`, image('gif-bytes'))

      expect(await (await get(`${ORIGIN}/media/images/0027.jpg`)).text()).toBe('jpg-bytes')
      expect(await (await get(`${ORIGIN}/media/videos/0027.gif`)).text()).toBe('gif-bytes')
      expect(fetch).not.toHaveBeenCalled()
    })

    it('fetches and caches local exercise media on first sight', async () => {
      fetch.mockImplementation(async () => image('gif-bytes'))
      const res = await get(`${ORIGIN}/media/videos/0499.gif`)
      expect(await res.text()).toBe('gif-bytes')
      await settle()
      expect(await cached('sky-rt-v1', `${ORIGIN}/media/videos/0499.gif`)).toBe(true)
    })

    it('does not cache the app page that a missing local media file falls back to', async () => {
      fetch.mockImplementation(async () => page())
      await get(`${ORIGIN}/media/images/0027.jpg`)
      await settle()
      expect(await cached('sky-rt-v1', `${ORIGIN}/media/images/0027.jpg`)).toBeFalsy()
    })

    it('leaves CDN images that are not the pinned dataset to the network', async () => {
      expect(await get('https://cdn.jsdelivr.net/gh/exercises-dataset@abc/images/0027.jpg')).toBeUndefined()
    })

    it('caches pinned CDN exercise art on first sight and serves it offline', async () => {
      const url = `${PINNED}/videos/0025.gif`
      fetch.mockImplementation(async () => image('gif-bytes'))
      expect(await (await get(url)).text()).toBe('gif-bytes')
      await settle()
      expect(await cached('sky-media-v1', url)).toBe(true)

      fetch.mockClear()
      fetch.mockImplementation(async () => { throw new TypeError('offline') })
      expect(await (await get(url)).text()).toBe('gif-bytes')
      expect(fetch).not.toHaveBeenCalled()
    })

    it('answers uncached art offline with a 503 the page can fall back from', async () => {
      expect((await get(`${PINNED}/images/9999.jpg`)).status).toBe(503)
      expect((await get(`${ORIGIN}/media/images/9999.jpg`)).status).toBe(503)
    })

    it('keeps the 400 most recent CDN images', async () => {
      fetch.mockImplementation(async () => image('x'))
      for (let i = 0; i < 402; i++) {
        await get(`${PINNED}/images/${String(i).padStart(4, '0')}.jpg`)
        await settle()
      }
      const kept = caches.stores.get('sky-media-v1')
      expect(kept.size).toBe(400)
      expect(kept.has(`${PINNED}/images/0000.jpg`)).toBe(false)
      expect(kept.has(`${PINNED}/images/0401.jpg`)).toBe(true)
    })
  })
})
