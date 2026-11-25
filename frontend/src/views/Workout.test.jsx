// @vitest-environment happy-dom
import { act } from 'react'
import { fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { resetViewTestState, renderWorkoutApp, cleanupViewTest } from '../test/view-harness.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let view

function exercise(id, sets, extra = {}) {
  return {
    id,
    target: { mode: 'reps', reps: 5, weight: 60, bodyweight: false },
    sets: sets.map(done => ({ w: 60, r: 5, done })),
    ...extra,
  }
}

const screen = () => within(view.container)
const dialog = () => screen().getByRole('dialog')
const openSheets = () => useUI.getState().sheets
const activeEntry = () => useStore.getState().S.active.entries[0]

function typeInto(textbox, value) {
  fireEvent.change(textbox, { target: { value } })
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

describe('header and finish button share one progress reading', () => {
  it('an unticked warm-up neither stalls the button nor fakes an unchecked set', () => {
    view = renderWorkoutApp([{
      id: '0025',
      target: { mode: 'reps', reps: 5, weight: 100, bodyweight: false },
      sets: [
        { w: 40, r: 5, done: false, phase: 'warmup' },
        { w: 100, r: 8, done: true },
        { w: 100, r: 8, done: true },
      ],
    }])

    expect(screen().getByText(/2\/2 sets/)).toBeTruthy()

    const finish = screen().getByRole('button', { name: 'Finish' })
    expect(finish.classList.contains('done'), 'Finish is emphasised once every work set is ticked').toBe(true)

    fireEvent.click(finish)
    expect(useStore.getState().S.active).toBeFalsy()
    expect(useStore.getState().S.workouts).toHaveLength(1)
  })
})

describe('workout screen hierarchy', () => {
  it('carries progress in the segments and the header count, with no "Exercise N / M" line', () => {
    view = renderWorkoutApp([exercise('0025', [false, false]), exercise('0047', [false])])

    expect(view.container.textContent).not.toMatch(/Exercise \d+ \/ \d+/)
    const segments = screen().getAllByRole('button', { name: /^Go to / })
    expect(segments).toHaveLength(2)
    expect(segments[0].getAttribute('aria-current')).toBe('step')
    expect(segments[1].getAttribute('aria-current')).toBeNull()
    expect(screen().getByText(/0\/3 sets/)).toBeTruthy()
  })

  it('offers Note, Replace and Details as keys named for what they do, each with a word', () => {
    view = renderWorkoutApp([exercise('0025', [false])])

    for (const [name, word] of [['Add note', 'Note'], ['Replace exercise', 'Replace'], ['Details', 'Details']]) {
      expect(screen().getByRole('button', { name }).textContent.trim(), name).toBe(word)
    }
  })

  it('offers Finish once, in the header, neutral while sets remain; the footer keeps Discard only', () => {
    view = renderWorkoutApp([exercise('0025', [true, false]), exercise('0047', [false])])

    const finishes = screen().getAllByRole('button', { name: /finish/i })
    expect(finishes).toHaveLength(1)
    expect(within(screen().getByRole('banner')).getByRole('button', { name: 'Finish' })).toBe(finishes[0])
    expect(finishes[0].classList.contains('done'), 'not yet emphasised').toBe(false)
    expect(view.container.textContent).not.toContain('Finish workout early')
    expect(screen().getByRole('button', { name: 'Discard workout' })).toBeTruthy()
  })
})

describe('Workout exercise notes and note sheet', () => {
  it('shows the note above the set table as a button that edits it, in place of the add-note key', () => {
    view = renderWorkoutApp([exercise('0025', [false], { notes: 'Seat height 5, pin 8' })])

    expect(screen().getByRole('button', { name: 'Edit note' }).textContent).toContain('Seat height 5, pin 8')
    expect(screen().queryByRole('button', { name: 'Add note' })).toBeNull()
  })

  it('offers a labelled Note key when there is no note, and no note callout', () => {
    view = renderWorkoutApp([exercise('0025', [false])])

    expect(screen().queryByRole('button', { name: 'Edit note' })).toBeNull()
    expect(screen().getByRole('button', { name: 'Add note' }).textContent).toBe('Note')
  })

  it('tapping the note, or pressing Enter or Space on it, opens the note sheet for that exercise', () => {
    view = renderWorkoutApp([exercise('0025', [false], { notes: 'Focus on chest squeeze' })])
    const callout = screen().getByRole('button', { name: 'Edit note' })

    for (const open of [() => fireEvent.click(callout), () => fireEvent.keyDown(callout, { key: 'Enter' }), () => fireEvent.keyDown(callout, { key: ' ' })]) {
      expect(openSheets()).toHaveLength(0)
      open()
      expect(openSheets()).toHaveLength(1)
      expect(within(dialog()).getByRole('heading').textContent).toContain('Note ·')
      expect(within(dialog()).getByRole('textbox', { name: 'Exercise note' }).value).toBe('Focus on chest squeeze')
      act(() => useUI.getState().closeSheet(openSheets()[0].id))
    }
  })

  it('tapping Note when the note is empty opens an empty note sheet', () => {
    view = renderWorkoutApp([exercise('0025', [false])])

    fireEvent.click(screen().getByRole('button', { name: 'Add note' }))
    expect(within(dialog()).getByRole('heading').textContent).toContain('Note ·')
    expect(within(dialog()).getByRole('textbox', { name: 'Exercise note' }).value).toBe('')
  })

  it('the note sheet edits and saves the note onto the active entry, then closes', () => {
    view = renderWorkoutApp([exercise('0025', [false], { notes: 'Old cue' })])
    fireEvent.click(screen().getByRole('button', { name: 'Edit note' }))

    const textbox = within(dialog()).getByRole('textbox', { name: 'Exercise note' })
    expect(textbox.getAttribute('placeholder')).toBe('Notes, cues, or machine setup…')
    expect(textbox.getAttribute('maxlength')).toBe('500')

    typeInto(textbox, 'Seat height 6, pin 9')
    expect(within(dialog()).getByText('20/500')).toBeTruthy()

    fireEvent.click(within(dialog()).getByRole('button', { name: /Save note/ }))
    expect(activeEntry().notes).toBe('Seat height 6, pin 9')
    expect(openSheets()).toHaveLength(0)
  })

  it('the note sheet clears the note off the active entry, then closes', () => {
    view = renderWorkoutApp([exercise('0025', [false], { notes: 'Temporary cue to clear' })])
    fireEvent.click(screen().getByRole('button', { name: 'Edit note' }))

    fireEvent.click(within(dialog()).getByRole('button', { name: /Clear note/ }))
    expect(activeEntry().notes).toBeUndefined()
    expect(openSheets()).toHaveLength(0)
  })
})
