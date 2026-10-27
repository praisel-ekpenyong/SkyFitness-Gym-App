// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entry, renderWorkout, resetViewTestState, cleanupViewTest } from '../test/view-harness.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let view

function headerClock() {
  return view.container.querySelector('.hdr .sub')?.textContent.trim()
}

beforeEach(() => {
  vi.useFakeTimers()
  resetViewTestState()
  view = null
})

afterEach(() => {
  cleanupViewTest(view)
  view = null
})

describe('elapsed clock', () => {
  it('floors the elapsed time instead of rounding it', () => {
    view = renderWorkout([entry('1001')], { start: Date.now() - 500 })

    expect(headerClock()).toMatch(/^0:00\b/)

    act(() => vi.advanceTimersByTime(1000))

    expect(headerClock()).toMatch(/^0:01\b/)
  })
})
