// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store/useStore.js'
import { entry, resetViewTestState, renderWorkout, cleanupViewTest } from '../test/view-harness.jsx'

vi.mock('../platform/sound.js', () => ({
  beep: vi.fn(),
  vibrate: vi.fn(),
  playSetComplete: vi.fn(),
  playTimerWarning: vi.fn(),
  playTimerComplete: vi.fn(),
  playWorkoutComplete: vi.fn(),
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let view

const field = scale => document.querySelector(`input[aria-label="Set 1 ${scale}"]`)
const set1 = () => useStore.getState().S.active.entries[0].sets[0]
const stored = scale => set1()[scale.toLowerCase()]

function typeKeys(el, text) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const steps = text ? [...text].map((_, i) => text.slice(0, i + 1)) : ['']
  for (const value of steps) {
    act(() => {
      set.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
}

function leave(el) {
  act(() => { el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
}

function renderRated(scale) {
  view = renderWorkout([entry('0025', [{ w: 60, r: 8, done: false }])])
  act(() => useStore.getState().update(s => { s.effort = scale.toLowerCase() }))
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

describe('Typed RPE below the scale', () => {
  it('is raised to 6 when the lifter leaves the field', () => {
    renderRated('RPE')
    typeKeys(field('RPE'), '3')
    expect(stored('RPE')).toBe(3)
    leave(field('RPE'))
    expect(stored('RPE')).toBe(6)
    expect(field('RPE').value).toBe('6')
  })

  it('is not raised mid-typing, so 10 and 8.5 survive their first keystrokes', () => {
    renderRated('RPE')
    typeKeys(field('RPE'), '10')
    leave(field('RPE'))
    expect(stored('RPE')).toBe(10)
    typeKeys(field('RPE'), '8.5')
    leave(field('RPE'))
    expect(stored('RPE')).toBe(8.5)
  })

  it('stays unrated when the field is cleared', () => {
    renderRated('RPE')
    typeKeys(field('RPE'), '8')
    typeKeys(field('RPE'), '')
    leave(field('RPE'))
    expect('rpe' in set1()).toBe(false)
  })
})
