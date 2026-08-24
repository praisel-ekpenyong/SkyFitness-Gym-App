import { describe, it, expect } from 'vitest'
import { pickNewest, backupDue, BACKUP_NAG_MS } from './storage.js'

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
