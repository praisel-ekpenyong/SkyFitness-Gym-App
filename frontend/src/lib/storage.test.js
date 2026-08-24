// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pickNewest, backupDue, BACKUP_NAG_MS, LOCAL_KEY, loadLocal, save, flush, load, registerSink, __setSinksForTests } from './storage.js'

// In-memory stand-ins for the two storages: each side arrives at boot as
// { ts, state } (a parsed snapshot plus its save timestamp) or null.
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
    // same rule when the mirror is the unstamped one: nothing anywhere wins over nothing
    expect(pickNewest(null, { ts: undefined, state: { workouts: ['w2'] } })).toBeNull()
  })

  it('prefers the localStorage copy on a timestamp tie rather than swapping for nothing', () => {
    const local = copy(100, ['w1'])
    const mirror = copy(100, ['w2'])
    expect(pickNewest(local, mirror)).toBe(local.state)
  })
})

// The nag threshold: two weeks without a backup. Long enough not to pester a daily user,
// short enough that a lost phone never takes more than that window of history with it.
// Restated literally (not imported) so these tests stay an independent check — but pinned
// to the export so the two cannot silently drift apart.
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
    expect(backupDue(1_000_000, 1_000_000)).toBe(false)      // exported this very second
  })

  it('disappears after a fresh export — the timestamp moves up, the nag goes away', () => {
    const before = 1_000_000 - WEEKS - 1
    expect(backupDue(before, 1_000_000)).toBe(true)
    const after = 1_000_000                                  // doExport stamps now
    expect(backupDue(after, 1_000_000)).toBe(false)
  })

  it('survives a lastExport stamp from the future without throwing or flipping out', () => {
    // clock skew / restored profile: not overdue by any honest reading
    expect(backupDue(2_000_000, 1_000_000)).toBe(false)
  })
})

// --- the write protocol ----------------------------------------------------
// Runs against happy-dom's real localStorage; mirrors are injectable fakes, so every
// branch of the protocol is observable without a browser.

let writes
let sink

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  writes = []
  sink = { id: 'fake', read: async () => null, write: x => writes.push(x) }
  __setSinksForTests([sink])
})

describe('save / flush', () => {
  it('stamps the snapshot and lands it in localStorage synchronously', () => {
    vi.setSystemTime(1_234_567_890)
    const snapshot = { workouts: ['w1'] }
    save(snapshot)
    expect(snapshot._ts).toBe(1_234_567_890)
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY))).toEqual({ workouts: ['w1'], _ts: 1_234_567_890 })
    expect(loadLocal()).toEqual(snapshot)
  })

  it('drains the mirrors once, on the trailing edge, with the newest snapshot', () => {
    save({ n: 1 })
    vi.advanceTimersByTime(300)
    save({ n: 2 })
    expect(writes).toEqual([])
    vi.advanceTimersByTime(800)
    expect(writes).toEqual([{ n: 2, _ts: expect.any(Number) }])
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
    __setSinksForTests()          // back to the real default (IndexedDB write no-ops here)
    const extra = { id: 'extra', read: async () => null, write: x => writes.push(x) }
    registerSink(extra)
    save({ n: 4 })
    flush()
    expect(writes).toEqual([{ n: 4, _ts: expect.any(Number) }])
  })
})

describe('load (web boot protocol)', () => {
  // The mobile branch compiles away under vitest (MOBILE folds to false), so these walk
  // the web protocol: race localStorage vs the first non-native sink, swap on a strictly
  // fresher winner, seed an absent mirror otherwise.
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
