import { describe, it, expect, beforeEach, vi } from 'vitest'

const plugin = vi.hoisted(() => ({
  permission: 'granted',
  scheduled: [],
  cancels: 0,
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    cancel: async () => { plugin.cancels++ },
    checkPermissions: async () => ({ display: plugin.permission }),
    requestPermissions: async () => ({ display: plugin.permission }),
    schedule: async ({ notifications }) => { plugin.scheduled.push(notifications) },
  },
}))

import { syncReminder, __resetReminderForTests } from './mobile.js'

const profile = (reminder, week = { 1: 'r1', 4: 'r1' }) => ({
  reminder,
  week,
  routines: [{ id: 'r1', name: 'Push' }],
})

beforeEach(() => {
  __resetReminderForTests()
  plugin.permission = 'granted'
  plugin.scheduled = []
  plugin.cancels = 0
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
