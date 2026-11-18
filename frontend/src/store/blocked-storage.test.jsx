// @vitest-environment happy-dom
// Audit-fixes 02: blocked storage stays usable.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore, DEF } from './useStore.js'
import { __setSinksForTests, __setLocalWriteForTests, flush } from '../platform/storage.js'

vi.mock('../platform/sound.js', () => ({
  beep: vi.fn(),
  vibrate: vi.fn(),
  playSetComplete: vi.fn(),
  playTimerWarning: vi.fn(),
  playTimerComplete: vi.fn(),
  playWorkoutComplete: vi.fn(),
}))
vi.mock('../platform/mobile.js', () => ({
  MOBILE: false,
  nativeLoad: vi.fn(async () => null),
  nativeSave: vi.fn(async () => {}),
  syncReminder: vi.fn(async () => true),
  shareExport: vi.fn(async () => {}),
}))

const cloneDef = () => JSON.parse(JSON.stringify(DEF))

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  __setSinksForTests([{ id: 'fake', read: async () => null, write: () => {} }])
  __setLocalWriteForTests()
  useStore.getState().replaceState(cloneDef())
  useStore.setState({ storageBlocked: false })
  flush()
})

afterEach(() => {
  vi.restoreAllMocks()
  __setSinksForTests()
  __setLocalWriteForTests()
  flush()
})

function blockWrites(name) {
  __setLocalWriteForTests(() => { throw new DOMException('denied', name) })
}

describe('blocked storage stays usable in memory', () => {
  it('a SecurityError denial keeps update() working in memory with a visible blocked flag', () => {
    blockWrites('SecurityError')
    expect(() => useStore.getState().update(s => { s.displayName = 'Pb' })).not.toThrow()
    expect(useStore.getState().S.displayName).toBe('Pb')
    expect(useStore.getState().storageBlocked).toBe(true)
  })

  it('a quota denial keeps log actions working in memory across successive updates', () => {
    blockWrites('QuotaExceededError')
    expect(() => useStore.getState().update(s => { s.displayName = 'A' })).not.toThrow()
    expect(() => useStore.getState().update(s => { s.routines = [{ id: 'r1' }] })).not.toThrow()
    expect(useStore.getState().S.displayName).toBe('A')
    expect(useStore.getState().S.routines).toHaveLength(1)
    expect(useStore.getState().storageBlocked).toBe(true)
  })

  it('a real log action (begin/discard Active workout) works in memory while blocked', () => {
    blockWrites('SecurityError')
    expect(useStore.getState().act({ type: 'begin', routineId: null, bw: null }).ok).toBe(true)
    expect(useStore.getState().S.active?.id).toBeTruthy()
    expect(useStore.getState().storageBlocked).toBe(true)
    expect(useStore.getState().act({ type: 'discard' }).ok).toBe(true)
    expect(useStore.getState().S.active).toBeNull()
    expect(useStore.getState().storageBlocked).toBe(true)
  })

  it('a successful write after a denial clears the blocked flag', () => {
    blockWrites('SecurityError')
    useStore.getState().update(s => { s.displayName = 'Blocked' })
    expect(useStore.getState().storageBlocked).toBe(true)
    __setLocalWriteForTests()
    useStore.getState().update(s => { s.displayName = 'Back' })
    expect(useStore.getState().S.displayName).toBe('Back')
    expect(useStore.getState().storageBlocked).toBe(false)
  })
})

describe('blocked storage shows a visible notice', () => {
  let root
  let container

  afterEach(async () => {
    if (root) await act(async () => { root.unmount() })
    if (container) container.remove()
    root = null
    container = null
  })

  it('the app shell exposes the blocked state as an alert while training stays usable', async () => {
    blockWrites('SecurityError')
    useStore.getState().update(s => { s.displayName = 'Pb' })
    const { default: App } = await import('../App.jsx')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => { root.render(React.createElement(App)) })
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    expect(document.querySelector('#tabbar')).toBeTruthy()
    const alert = document.querySelector('[role="alert"]')
    expect(alert).toBeTruthy()
    expect(alert.textContent).toMatch(/persist/i)
  })
})
