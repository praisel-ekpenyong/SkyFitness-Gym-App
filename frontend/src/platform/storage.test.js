// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  pickNewest, backupDue, BACKUP_NAG_MS, LOCAL_KEY, loadLocal, save, flush, load,
  registerSink, __setSinksForTests, __setLocalWriteForTests, __resetStorageBlockedForTests,
  isStorageBlocked, onStorageSync, isMirrorFailing, requestPersistence, persistOnFirstKeep, PERSIST_ASKED_KEY, idbSave, __resetMirrorFailuresForTests
} from './storage.js'

const copy = (ts, workouts = ['w1']) => ({ ts, state: { _ts: ts, workouts } })

describe('pickNewest', () => {
  it('lets the newer mirror win when it is fresher than localStorage', () => {
    const local = copy(100)
    const mirror = copy(200, ['w2'])
    expect(pickNewest(local, mirror)).toBe(mirror.state)
  })

  it('keeps the localStorage copy when it is the fresher one', () => {
    const local = copy(300, ['w1'])
    const mirror = copy(200, ['w2'])
    expect(pickNewest(local, mirror)).toBe(local.state)
  })

  it('falls back to empty defaults (null) when neither storage has anything', () => {
    expect(pickNewest(null, null)).toBeNull()
  })

  it('takes the only copy that exists', () => {
    const local = copy(100)
    const mirror = copy(200)
    expect(pickNewest(local, null)).toBe(local.state)
    expect(pickNewest(null, mirror)).toBe(mirror.state)
  })

  it('treats an unstamped side as no copy at all — an old pre-timestamp save cannot beat a stamped mirror', () => {
    const unstamped = { ts: undefined, state: { workouts: ['w1'] } }
    const mirror = copy(1, ['w2'])
    expect(pickNewest(unstamped, mirror)).toBe(mirror.state)
    expect(pickNewest(null, { ts: undefined, state: { workouts: ['w2'] } })).toBeNull()
  })

  it('prefers the localStorage copy on a timestamp tie rather than swapping for nothing', () => {
    const local = copy(100, ['w1'])
    const mirror = copy(100, ['w2'])
    expect(pickNewest(local, mirror)).toBe(local.state)
  })
})

const WEEKS = 14 * 24 * 60 * 60 * 1000
expect(BACKUP_NAG_MS).toBe(WEEKS)

describe('backupDue', () => {
  it('is due when there has never been an export', () => {
    expect(backupDue(null, 1_000_000)).toBe(true)
    expect(backupDue(undefined, 1_000_000)).toBe(true)
  })

  it('is due once the last export is older than the threshold', () => {
    expect(backupDue(1_000_000 - WEEKS - 1, 1_000_000)).toBe(true)
  })

  it('is quiet while the last export is still within the threshold', () => {
    expect(backupDue(1_000_000 - WEEKS + 1, 1_000_000)).toBe(false)
    expect(backupDue(1_000_000, 1_000_000)).toBe(false)
  })

  it('disappears after a fresh export — the timestamp moves up, the nag goes away', () => {
    const before = 1_000_000 - WEEKS - 1
    expect(backupDue(before, 1_000_000)).toBe(true)
    const after = 1_000_000
    expect(backupDue(after, 1_000_000)).toBe(false)
  })

  it('survives a lastExport stamp from the future without throwing or flipping out', () => {
    expect(backupDue(2_000_000, 1_000_000)).toBe(false)
  })
})


let writes
let sink

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  writes = []
  sink = { id: 'fake', read: async () => null, write: x => writes.push(x) }
  __setSinksForTests([sink])
  __setLocalWriteForTests()
  __resetStorageBlockedForTests()
})

describe('save / flush', () => {
  it('lands the snapshot in localStorage synchronously, unchanged', () => {
    const snapshot = Object.freeze({ workouts: ['w1'], _ts: 1_234_567_890 })
    save(snapshot)
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY))).toEqual({ workouts: ['w1'], _ts: 1_234_567_890 })
    expect(loadLocal()).toEqual(snapshot)
  })

  it('drains the mirrors once, on the trailing edge, with the newest snapshot', () => {
    save({ n: 1 })
    vi.advanceTimersByTime(300)
    save({ n: 2 })
    expect(writes).toEqual([])
    vi.advanceTimersByTime(800)
    expect(writes).toEqual([{ n: 2 }])
  })

  it('flush() drains immediately and cannot double-drain', () => {
    save({ n: 3 })
    flush()
    flush()
    expect(writes).toHaveLength(1)
    vi.advanceTimersByTime(5_000)
    expect(writes).toHaveLength(1)
  })

  it('flush() with nothing pending is a harmless no-op', () => {
    expect(() => flush()).not.toThrow()
    expect(writes).toEqual([])
  })

  it('registerSink adds a mirror alongside the default IndexedDB sink', () => {
    __setSinksForTests()
    const extra = { id: 'extra', read: async () => null, write: x => writes.push(x) }
    registerSink(extra)
    save({ n: 4 })
    flush()
    expect(writes).toEqual([{ n: 4 }])
  })

  it('survives a storage quota exceeded exception and still drains to sinks', () => {
    // Denied device storage goes through the injectable local-write seam:
    // per-instance stubbing of the frozen happy-dom Storage never lands.
    __setLocalWriteForTests(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError') })
    expect(() => save({ n: 5 })).not.toThrow()
    expect(writes).toEqual([])
    vi.advanceTimersByTime(800)
    expect(writes).toEqual([{ n: 5 }])
    __setLocalWriteForTests()
    save({ n: 6 })
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY)).n).toBe(6)
    flush()
    expect(writes).toHaveLength(2)
  })

  it('flush() still drains after a quota-blocked save', () => {
    __setLocalWriteForTests(() => { throw new DOMException('NS_ERROR_DOM_QUOTA_REACHED', 'QuotaExceededError') })
    expect(() => save({ n: 7 })).not.toThrow()
    expect(() => flush()).not.toThrow()
    expect(writes).toEqual([{ n: 7 }])
    __setLocalWriteForTests()
  })

  it('a security denial degrades the same way and reports blocked until a write lands', () => {
    __setLocalWriteForTests(() => { throw new DOMException('denied', 'SecurityError') })
    expect(save({ n: 8 })).toBe(false)
    expect(isStorageBlocked()).toBe(true)
    __setLocalWriteForTests()
    expect(save({ n: 9 })).toBe(true)
    expect(isStorageBlocked()).toBe(false)
    flush()
  })
})

describe('load (web boot protocol)', () => {
  const bootArgs = (running, hasDataFlag) => ({
    running,
    hasData: () => hasDataFlag,
    overlay: x => ({ ...x, overlaid: true }),
  })

  it('swaps in a strictly fresher mirror, overlaid, without seeding anything', async () => {
    const read = vi.fn(async () => ({ _ts: 200, workouts: ['mirror'] }))
    __setSinksForTests([{ id: 'idb', read, write: x => writes.push(x) }])
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ _ts: 100 }))
    const out = await load(bootArgs({ _ts: 100 }, true))
    expect(out).toEqual({ _ts: 200, workouts: ['mirror'], overlaid: true })
    expect(writes).toEqual([])
  })

  it('swaps in a fresher localStorage copy over stale running state', async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ _ts: 300, workouts: ['newer'] }))
    const out = await load(bootArgs({ _ts: 100 }, true))
    expect(out).toEqual({ _ts: 300, workouts: ['newer'], overlaid: true })
  })

  it('keeps the running state on a tie and seeds the absent mirror with it, timestamp intact', async () => {
    const read = vi.fn(async () => null)
    const write = vi.fn()
    __setSinksForTests([{ id: 'idb', read, write }])
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ _ts: 100 }))
    const running = { _ts: 100, workouts: ['kept'] }
    const out = await load(bootArgs(running, true))
    expect(out).toBeNull()
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0][0]).toBe(running)
  })

  it('an older mirror neither swaps nor seeds — the mirror already exists', async () => {
    const read = vi.fn(async () => ({ _ts: 50 }))
    const write = vi.fn()
    __setSinksForTests([{ id: 'idb', read, write }])
    const running = { _ts: 100, workouts: ['kept'] }
    const out = await load(bootArgs(running, true))
    expect(out).toBeNull()
    expect(write).not.toHaveBeenCalled()
  })

  it('a fresh install swaps nothing and seeds nothing', async () => {
    const read = vi.fn(async () => null)
    const write = vi.fn()
    __setSinksForTests([{ id: 'idb', read, write }])
    const out = await load(bootArgs({ _ts: undefined }, false))
    expect(out).toBeNull()
    expect(write).not.toHaveBeenCalled()
  })

  it('an empty running profile adopts any stored copy that has data', async () => {
    const read = vi.fn(async () => ({ _ts: 5, workouts: ['recovered'] }))
    __setSinksForTests([{ id: 'idb', read, write: x => writes.push(x) }])
    const out = await load(bootArgs({ _ts: undefined }, false))
    expect(out).toEqual({ _ts: 5, workouts: ['recovered'], overlaid: true })
  })
})

describe('onStorageSync', () => {
  it('subscribes to window storage events and invokes callback for valid updates', () => {
    const callback = vi.fn()
    const unsubscribe = onStorageSync(callback)

    window.dispatchEvent(new StorageEvent('storage', { key: 'other_key', newValue: JSON.stringify({ a: 1 }) }))
    expect(callback).not.toHaveBeenCalled()

    window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_KEY, newValue: JSON.stringify({ _ts: 200, workouts: [] }) }))
    expect(callback).toHaveBeenCalledWith({ _ts: 200, workouts: [] })

    unsubscribe()
    window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_KEY, newValue: JSON.stringify({ _ts: 300 }) }))
    expect(callback).toHaveBeenCalledTimes(1)
  })
})


describe('mirror write failures', () => {
  beforeEach(() => { vi.useFakeTimers(); __setLocalWriteForTests(); __resetStorageBlockedForTests() })

  it('a rejected mirror write is reported, a later success clears it, and localStorage state is untouched', async () => {
    let fail = true
    __setSinksForTests([{ id: 'idb', read: async () => null, write: async () => { if (fail) throw new Error('boom') } }])
    save({ n: 1 }); flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(isMirrorFailing()).toBe(true)
    expect(isStorageBlocked()).toBe(false)
    fail = false
    save({ n: 2 }); flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(isMirrorFailing()).toBe(false)
    vi.useRealTimers()
  })

  it('a synchronously throwing mirror is reported too', () => {
    __setSinksForTests([{ id: 'idb', read: async () => null, write: () => { throw new Error('boom') } }])
    save({ n: 3 }); flush()
    expect(isMirrorFailing()).toBe(true)
    __setSinksForTests([])
    save({ n: 4 }); flush()
    __setSinksForTests()
    vi.useRealTimers()
  })
})

describe('requestPersistence', () => {
  it('asks the browser once and never throws', async () => {
    const persist = vi.fn(async () => true)
    expect(await requestPersistence({ persist })).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })
  it('is a no-op without the API, and swallows a throw or rejection', async () => {
    expect(await requestPersistence(undefined)).toBe(false)
    expect(await requestPersistence({})).toBe(false)
    expect(await requestPersistence({ persist: () => { throw new Error('x') } })).toBe(false)
    expect(await requestPersistence({ persist: async () => { throw new Error('x') } })).toBe(false)
  })
})

describe('persistOnFirstKeep', () => {
  beforeEach(() => { vi.useRealTimers(); localStorage.clear() })

  // A fake store: subscribe like zustand, and a change() that emits (state, prev).
  function fakeStore(S) {
    let listeners = []
    let state = { S }
    return {
      subscribe: fn => { listeners.push(fn); return () => { listeners = listeners.filter(l => l !== fn) } },
      change: next => { const prev = state; state = { S: next }; listeners.forEach(l => l(state, prev)) },
      listeners: () => listeners.length,
    }
  }
  const manager = (persisted = false) => ({ persist: vi.fn(async () => true), persisted: vi.fn(async () => persisted) })
  const settle = () => new Promise(r => setTimeout(r, 0))

  it('does not ask at boot or on a change that keeps nothing new', async () => {
    const m = manager()
    const store = fakeStore({ workouts: [{ id: 'w1' }], bodyweight: [] })
    persistOnFirstKeep(store.subscribe, m)
    store.change({ workouts: [{ id: 'w1' }], bodyweight: [], restSec: 120 })
    await settle()
    expect(m.persist).not.toHaveBeenCalled()
  })

  it('asks after the first finished Workout, then never again on this device', async () => {
    const m = manager()
    const store = fakeStore({ workouts: [], bodyweight: [] })
    persistOnFirstKeep(store.subscribe, m)
    store.change({ workouts: [{ id: 'w1' }], bodyweight: [] })
    await settle()
    expect(m.persist).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(PERSIST_ASKED_KEY)).toBeTruthy()
    expect(store.listeners()).toBe(0)

    const reload = fakeStore({ workouts: [{ id: 'w1' }], bodyweight: [] })
    persistOnFirstKeep(reload.subscribe, m)
    reload.change({ workouts: [{ id: 'w1' }, { id: 'w2' }], bodyweight: [] })
    await settle()
    expect(m.persist).toHaveBeenCalledTimes(1)
  })

  it('asks after the first Weigh-in', async () => {
    const m = manager()
    const store = fakeStore({ workouts: [], bodyweight: [] })
    persistOnFirstKeep(store.subscribe, m)
    store.change({ workouts: [], bodyweight: [{ d: '2026-11-19', w: 80 }] })
    await settle()
    expect(m.persist).toHaveBeenCalledTimes(1)
  })

  it('does not ask when storage is already persistent', async () => {
    const m = manager(true)
    const store = fakeStore({ workouts: [] })
    persistOnFirstKeep(store.subscribe, m)
    store.change({ workouts: [{ id: 'w1' }] })
    await settle()
    expect(m.persist).not.toHaveBeenCalled()
  })

  it('does nothing without the API', async () => {
    const store = fakeStore({ workouts: [] })
    persistOnFirstKeep(store.subscribe, undefined)
    expect(() => store.change({ workouts: [{ id: 'w1' }] })).not.toThrow()
    await settle()
  })
})

describe('mirror failure edge cases', () => {
  beforeEach(() => { vi.useRealTimers(); __resetMirrorFailuresForTests(); __setSinksForTests() })

  it('a failed boot seed is recorded, not an unhandled rejection', async () => {
    localStorage.clear()
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    __setSinksForTests([{ id: 'idb', read: async () => null, write: async () => { throw new Error('seed') } }])
    await load({ running: { _ts: 5, workouts: ['w'] }, hasData: () => true, overlay: x => x })
    await new Promise(r => setTimeout(r, 10))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
    expect(isMirrorFailing()).toBe(true)
    __setSinksForTests()
  })

  it('idbSave rejects when IndexedDB is unavailable so the drain counts it as failed', async () => {
    await expect(idbSave({ n: 1 })).rejects.toThrow()
  })
})
