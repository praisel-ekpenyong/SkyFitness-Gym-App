// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __setSinksForTests } from '../platform/storage.js'

const { useStore } = await import('./useStore.js')
const { DEF } = await import('../lib/profile/index.js')

const hide = () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
  document.dispatchEvent(new Event('visibilitychange'))
}

let writes

beforeEach(() => {
  vi.useFakeTimers()
  writes = []
  __setSinksForTests([{ id: 'fake', read: async () => null, write: x => writes.push(x) }])
  useStore.setState({ S: { ...DEF } })
})

afterEach(() => {
  delete document.visibilityState
  __setSinksForTests()
  vi.useRealTimers()
})

describe('hiding the app', () => {
  it('writes the pending Profile to the mirror without waiting for the debounce', () => {
    useStore.getState().update(s => { s.restSec = 120 })
    expect(writes).toEqual([])
    hide()
    expect(writes).toHaveLength(1)
    expect(writes[0].restSec).toBe(120)
  })
})
