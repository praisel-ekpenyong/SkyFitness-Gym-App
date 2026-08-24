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

    listeners['install']()
    expect(globalThis.self.skipWaiting).toHaveBeenCalled()

    let waitUntilPromise
    listeners['activate']({ waitUntil: p => { waitUntilPromise = p } })
    await waitUntilPromise
    expect(fakeCaches.delete).toHaveBeenCalledWith('old-cache')
    expect(fakeCaches.delete).not.toHaveBeenCalledWith('sky-rt-v1')
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
})
