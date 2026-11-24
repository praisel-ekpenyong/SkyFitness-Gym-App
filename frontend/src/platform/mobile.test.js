// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const plugin = vi.hoisted(() => ({
  permission: 'granted',
  scheduled: [],
  cancels: 0,
  scheduleError: null,
}))

const fs = vi.hoisted(() => ({
  writeError: null,
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    cancel: async () => { plugin.cancels++ },
    checkPermissions: async () => ({ display: plugin.permission }),
    requestPermissions: async () => ({ display: plugin.permission }),
    schedule: async ({ notifications }) => {
      if (plugin.scheduleError) throw plugin.scheduleError
      plugin.scheduled.push(notifications)
    },
  },
}))

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: async () => {
      if (fs.writeError) throw fs.writeError
    },
  },
  Directory: { Data: 'DATA', Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}))

import { nativeSave, nativeSink, syncReminder, __resetReminderForTests } from './mobile.js'
import {
  save, flush, loadLocal, isMirrorFailing,
  __setSinksForTests, __resetMirrorFailuresForTests,
} from './storage.js'

const profile = (reminder, week = { 1: 'r1', 4: 'r1' }) => ({
  reminder,
  week,
  routines: [{ id: 'r1', name: 'Push' }],
})

beforeEach(() => {
  localStorage.clear()
  __resetReminderForTests()
  __resetMirrorFailuresForTests()
  __setSinksForTests()
  plugin.permission = 'granted'
  plugin.scheduled = []
  plugin.cancels = 0
  plugin.scheduleError = null
  fs.writeError = null
})

afterEach(() => {
  __setSinksForTests()
  __resetMirrorFailuresForTests()
})

describe('syncReminder', () => {
  it('schedules one weekly reminder per planned weekday', async () => {
    expect(await syncReminder(profile({ on: true, time: '07:30' }))).toBe(true)
    expect(plugin.scheduled).toHaveLength(1)
    expect(plugin.scheduled[0].map(n => n.schedule.on)).toEqual([
      { weekday: 2, hour: 7, minute: 30 },
      { weekday: 5, hour: 7, minute: 30 },
    ])
  })

  it('does not reschedule when a save leaves the reminder unchanged', async () => {
    const S = profile({ on: true, time: '07:30' })
    await syncReminder(S)
    await syncReminder({ ...S, workouts: [{ id: 'w1' }] })
    await syncReminder(S)
    expect(plugin.scheduled).toHaveLength(1)
    expect(plugin.cancels).toBe(1)
  })

  it('reschedules when the time or the week schedule changes', async () => {
    await syncReminder(profile({ on: true, time: '07:30' }))
    await syncReminder(profile({ on: true, time: '18:00' }))
    await syncReminder(profile({ on: true, time: '18:00' }, { 3: 'r1' }))
    expect(plugin.scheduled).toHaveLength(3)
    expect(plugin.scheduled[2].map(n => n.schedule.on.weekday)).toEqual([4])
  })

  it('cancels once when the reminder is switched off, then leaves it alone', async () => {
    await syncReminder(profile({ on: true, time: '07:30' }))
    await syncReminder(profile({ on: false, time: '07:30' }))
    await syncReminder(profile({ on: false, time: '07:30' }))
    expect(plugin.cancels).toBe(2)
    expect(plugin.scheduled).toHaveLength(1)
  })

  it('tries again on the next save when permission was missing', async () => {
    plugin.permission = 'denied'
    const S = profile({ on: true, time: '07:30' })
    expect(await syncReminder(S)).toBe(false)
    plugin.permission = 'granted'
    expect(await syncReminder(S)).toBe(true)
    expect(plugin.scheduled).toHaveLength(1)
  })

  it('always runs when the lifter switches it on, so permission can be asked', async () => {
    const S = profile({ on: true, time: '07:30' })
    await syncReminder(S)
    await syncReminder(S, true)
    expect(plugin.scheduled).toHaveLength(2)
  })
})

describe('nativeSave / nativeSink', () => {
  async function drainNative(state, expectedFailing) {
    __setSinksForTests([nativeSink])
    save(state)
    flush()
    await vi.waitFor(() => expect(isMirrorFailing()).toBe(expectedFailing), { timeout: 200 })
  }

  it('nativeSave rejects when writing the native file fails', async () => {
    fs.writeError = new Error('disk full')
    await expect(nativeSave(profile({ on: false }))).rejects.toThrow('disk full')
  })

  it('reports a failing mirror when the native file write fails, and clears on a later success', async () => {
    fs.writeError = new Error('disk full')
    await drainNative({ ...profile({ on: false }), _ts: 1 }, true)
    expect(loadLocal()).toEqual({ ...profile({ on: false }), _ts: 1 })

    fs.writeError = null
    await drainNative({ ...profile({ on: false }), _ts: 2 }, false)
  })

  it('schedules workout reminders before the native sink write settles', async () => {
    await nativeSink.write(profile({ on: true, time: '07:30' }))
    expect(plugin.scheduled).toHaveLength(1)
  })

  it('keeps the mirror healthy when reminder scheduling fails', async () => {
    fs.writeError = new Error('disk full')
    await drainNative({ ...profile({ on: false }), _ts: 1 }, true)

    fs.writeError = null
    plugin.scheduleError = new Error('notifications unavailable')
    await drainNative({ ...profile({ on: true, time: '08:00' }), _ts: 2 }, false)
  })

  it('still updates workout reminders when writing the native file fails', async () => {
    fs.writeError = new Error('disk full')
    await expect(nativeSink.write(profile({ on: true, time: '07:30' }))).rejects.toThrow('disk full')
    expect(plugin.scheduled).toHaveLength(1)
  })
})
