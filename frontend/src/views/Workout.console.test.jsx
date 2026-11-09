// @vitest-environment happy-dom
// The set ladder's one open console: which set it opens on, how it moves, and what it draws.
import { act } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanupViewTest, entry, renderWorkout, resetViewTestState } from '../test/view-harness.jsx'
import { useStore } from '../store/useStore.js'

vi.mock('../sheets.jsx', () => ({
  startFlow: vi.fn(), exercisePicker: vi.fn(), exConfigSheet: vi.fn(), exerciseDetailSheet: vi.fn(),
  topWeightSheet: vi.fn(), finishWorkout: vi.fn(), workoutCompleteSheet: vi.fn(), confirmSheet: vi.fn(), exerciseNoteSheet: vi.fn(),
}))

const BENCH = '0025'   // barbell bench press
const CURL = '0294'    // dumbbell work: its load does not go on a straight bar
const sets = (n, w = 60) => Array.from({ length: n }, () => ({ w, r: 8, done: false }))

let view
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  resetViewTestState()
})
afterEach(() => { cleanupViewTest(view); view = null })

const rows = () => [...view.container.querySelectorAll('.setrow')]
const openIndex = () => rows().findIndex(r => r.classList.contains('cur'))
const click = el => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

describe('the open set', () => {
  it('opens on the first set not yet logged, as a console with a log key', () => {
    view = renderWorkout([entry(BENCH, [{ w: 60, r: 8, done: true }, ...sets(2)])])
    expect(openIndex()).toBe(1)
    expect(rows()[1].textContent).toContain('Log set')
    expect(rows()[2].textContent).not.toContain('Log set')
  })

  it('moves to the next set when this one is logged', () => {
    view = renderWorkout([entry(BENCH, sets(3))])
    click(rows()[0].querySelector('[role="checkbox"]'))
    expect(openIndex()).toBe(1)
    expect(useStore.getState().S.active.entries[0].sets[0].done).toBe(true)
  })

  it('opens a tapped set to fix it, and folds it again from its own header', () => {
    view = renderWorkout([entry(BENCH, [{ w: 60, r: 8, done: true }, ...sets(1)])])
    click(rows()[0])
    expect(openIndex()).toBe(0)
    expect(rows()[0].textContent).toContain('Logged')
    click(rows()[0].querySelector('button.n'))
    expect(openIndex()).toBe(-1)
  })

  it('leaves every set folded once they are all logged', () => {
    view = renderWorkout([entry(BENCH, [{ w: 60, r: 8, done: true }])])
    expect(openIndex()).toBe(-1)
  })

  it('keeps a fold typeable and steppable, so no set is locked once it folds', () => {
    view = renderWorkout([entry(BENCH, sets(2))])
    const folded = rows()[1]
    expect(folded.querySelector('input[aria-label="Set 2 Weight (kg)"]')).toBeTruthy()
    expect(folded.querySelector('button[aria-label="Increase Set 2 Weight (kg)"]')).toBeTruthy()
  })

  it('folds a superset partner until its turn comes round', () => {
    view = renderWorkout([
      { ...entry(BENCH, sets(1)), sg: 'a' },
      { ...entry(CURL, sets(1)), sg: 'a' },
    ])
    expect(rows().filter(r => r.classList.contains('cur'))).toHaveLength(1)
    expect(openIndex()).toBe(0)
  })
})

describe('moving to the next exercise', () => {
  const SQUAT = '0043'   // barbell full squat
  // The page moves one frame after the switch, so the sheet that triggered it has restored its
  // own scroll first. A frame queued after the switch runs after the page's.
  const nextFrame = () => act(() => new Promise(resolve => requestAnimationFrame(() => resolve())))

  it('starts a single exercise at the top of the page when it follows a superset', async () => {
    view = renderWorkout([
      { ...entry(BENCH, sets(1)), sg: 'a' },
      { ...entry(CURL, sets(1)), sg: 'a' },
      entry(SQUAT, sets(2)),
    ])
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    act(() => { useStore.getState().setActiveIndex(2) })
    await nextFrame()
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
    scrollTo.mockRestore()
  })
})

describe('the barbell', () => {
  it('draws the open set of a barbell lift, with its reading in words', () => {
    view = renderWorkout([entry(BENCH, sets(2, 100))])
    const bar = view.container.querySelectorAll('.bbell')
    expect(bar).toHaveLength(1)
    expect(bar[0].getAttribute('aria-label')).toBe('20 kg bar + 25 + 15 per side')
    expect(rows()[0].querySelector('.bbell')).toBeTruthy()
  })

  it('follows the load as it is stepped', () => {
    view = renderWorkout([entry(BENCH, sets(1, 100))])
    click(view.container.querySelector('button[aria-label="Increase Set 1 Weight (kg)"]'))
    expect(view.container.querySelector('.bbell').getAttribute('aria-label')).toBe('20 kg bar + 25 + 15 + 1.25 per side')
  })

  it('draws nothing for a load that does not go on a straight bar', () => {
    view = renderWorkout([entry(CURL, sets(2, 14))])
    expect(view.container.querySelector('.bbell')).toBeNull()
  })

  it('draws nothing before there is a load to draw', () => {
    view = renderWorkout([entry(BENCH, sets(1, 0))])
    expect(view.container.querySelector('.bbell')).toBeNull()
  })
})
