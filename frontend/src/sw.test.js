import { describe, expect, it, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Sky Service Worker (sw.js)', () => {
  let listeners = {}
  let fakeCaches = {}
  let cacheStore = {}

  function loadServiceWorker() {
    const swPath = path.resolve(__dirname, '../public/sw.js')
    const swCode = fs.readFileSync(swPath, 'utf-8')
    const executeServiceWorker = new Function('self', 'caches', 'location', swCode)
    executeServiceWorker(globalThis.self, globalThis.caches, globalThis.location)
  }

  beforeEach(() => {
    listeners = {}
    cacheStore = {}
    fakeCaches = {
      open: vi.fn(async (name) => ({
        match: vi.fn(async (req) => cacheStore[typeof req === 'string' ? req : req.url] || null),
        put: vi.fn(async (req, res) => {
          cacheStore[typeof req === 'string' ? req : req.url] = res
        }),
        addAll: vi.fn(async (reqs) => {
          reqs.forEach(r => { cacheStore[typeof r === 'string' ? r : r.url] = { ok: true, status: 200 } })
        }),
      })),
      keys: vi.fn(async () => ['old-cache', 'sky-rt-v1']),
      delete: vi.fn(async (k) => { delete cacheStore[k]; return true }),
      match: vi.fn(async (req) => cacheStore[typeof req === 'string' ? req : req.url] || null),
    }

    const fakeSelf = {
      addEventListener: (evt, cb) => { listeners[evt] = cb },
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn(() => Promise.resolve()) },
    }

    globalThis.self = fakeSelf
    globalThis.caches = fakeCaches
    globalThis.location = { origin: 'https://sky.app' }
  })

  it('installs and activates cleanly, purging stale cache keys', async () => {
    loadServiceWorker()

    expect(listeners['install']).toBeDefined()
    expect(listeners['activate']).toBeDefined()
    expect(listeners['fetch']).toBeDefined()

    let installWait
    listeners['install']({ waitUntil: p => { installWait = p } })
    await installWait
    expect(globalThis.self.skipWaiting).toHaveBeenCalled()

    let waitUntilPromise
    listeners['activate']({ waitUntil: p => { waitUntilPromise = p } })
    await waitUntilPromise
    expect(fakeCaches.delete).toHaveBeenCalledWith('old-cache')
    expect(fakeCaches.delete).not.toHaveBeenCalledWith('sky-rt-v1')
  })

  it('precaches the app shell on install so the first offline visit opens', async () => {
    loadServiceWorker()

    let waitUntilPromise
    listeners['install']({ waitUntil: p => { waitUntilPromise = p } })
    await waitUntilPromise

    expect(globalThis.self.skipWaiting).toHaveBeenCalled()
    expect(fakeCaches.open).toHaveBeenCalledWith('sky-rt-v1')
    expect(cacheStore['index.html']).toBeTruthy()
  })

  it('serves cached app shell when offline', async () => {
    loadServiceWorker()

    const cachedResponse = { ok: true, status: 200, body: '<html>Sky</html>' }
    cacheStore['https://sky.app/index.html'] = cachedResponse
    cacheStore['index.html'] = cachedResponse

    let respondedWithPromise
    const fakeEvent = {
      request: {
        method: 'GET',
        url: 'https://sky.app/plan',
      },
      respondWith: p => { respondedWithPromise = p },
    }

    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch (offline)')))

    listeners['fetch'](fakeEvent)
    const result = await respondedWithPromise
    expect(result).toBe(cachedResponse)
  })

  describe('exercise media routing', () => {
    const res = body => ({ ok: true, body, clone() { return this } })
    const hit = async url => {
      let responded
      listeners['fetch']({
        request: { method: 'GET', url },
        respondWith: p => { responded = p },
      })
      return { responded, result: await responded }
    }

    beforeEach(() => {
      globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('network disabled')))
    })

    it('serves local exercise media cache-first', async () => {
      loadServiceWorker()

      const img = res('jpg-bytes')
      const gif = res('gif-bytes')
      cacheStore['https://sky.app/media/images/0027.jpg'] = img
      cacheStore['https://sky.app/media/videos/0027.gif'] = gif

      expect((await hit('https://sky.app/media/images/0027.jpg')).result).toBe(img)
      expect((await hit('https://sky.app/media/videos/0027.gif')).result).toBe(gif)
      expect(globalThis.fetch).not.toHaveBeenCalled()
    })

    it('fetches and caches local exercise media on first sight', async () => {
      loadServiceWorker()

      const fresh = res('gif-bytes')
      globalThis.fetch = vi.fn(() => Promise.resolve(fresh))

      const { result } = await hit('https://sky.app/media/videos/0499.gif')
      expect(result).toBe(fresh)
      expect(cacheStore['https://sky.app/media/videos/0499.gif']).toBe(fresh)
    })

    it('leaves cross-origin media (CDN fallback) untouched', async () => {
      loadServiceWorker()

      const cdnUrl = 'https://cdn.jsdelivr.net/gh/exercises-dataset@abc/images/0027.jpg'
      const { responded } = await hit(cdnUrl)
      expect(responded).toBeUndefined()
    })

    it('resolves a graceful fallback for uncached media offline instead of breaking the fetch', async () => {
      loadServiceWorker()

      let responded
      listeners['fetch']({
        request: { method: 'GET', url: 'https://sky.app/media/images/9999.jpg' },
        respondWith: p => { responded = p },
      })
      const result = await responded
      expect(result.status).toBe(503)
    })
  })

  describe('runtime cache scope', () => {
    it('leaves the worker script itself out of the runtime cache', async () => {
      loadServiceWorker()
      globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('network disabled')))

      let responded = 'unset'
      listeners['fetch']({
        request: { method: 'GET', url: 'https://sky.app/sw.js' },
        respondWith: p => { responded = p },
      })
      expect(responded).toBe('unset')
      expect(globalThis.fetch).not.toHaveBeenCalled()
    })

    it('clones a shell asset before handing it to the page, while its body can still be read', async () => {
      loadServiceWorker()
      const res = new Response('app()', { status: 200 })
      globalThis.fetch = vi.fn(async () => res)
      // Opening a real cache takes a while: the page has the response well before the cache does.
      const openNow = fakeCaches.open
      fakeCaches.open = vi.fn(name => new Promise(resolve => setTimeout(() => resolve(openNow(name)), 5)))
      let responded
      listeners['fetch']({
        request: { url: 'https://sky.app/assets/index-abc.js', method: 'GET', mode: 'cors', destination: 'script' },
        respondWith: p => { responded = p },
      })
      // The browser starts reading the response as soon as respondWith resolves. A clone taken
      // after that throws, so nothing is cached and an offline reload opens a blank page.
      await (await responded).text()
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(await cacheStore['https://sky.app/assets/index-abc.js']?.text()).toBe('app()')
    })

    it('caches hashed shell assets on success under the versioned name', async () => {
      loadServiceWorker()

      const fresh = { ok: true, clone() { return this } }
      globalThis.fetch = vi.fn(() => Promise.resolve(fresh))

      let responded
      listeners['fetch']({
        request: { method: 'GET', url: 'https://sky.app/assets/app-abc123.js' },
        respondWith: p => { responded = p },
      })
      expect(await responded).toBe(fresh)
      expect(fakeCaches.open).toHaveBeenCalledWith('sky-rt-v1')
      expect(cacheStore['https://sky.app/assets/app-abc123.js']).toBe(fresh)
    })
  })
})
