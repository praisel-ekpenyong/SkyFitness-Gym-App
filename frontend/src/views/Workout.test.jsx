// @vitest-environment happy-dom
import { act } from 'react'
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

const click = el => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const press = (el, key) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })) })
const byLabel = label => view.container.querySelector(`button[aria-label="${label}"]`)
const noteButton = name => [...view.container.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.includes(name))
const openSheets = () => useUI.getState().sheets
const activeEntry = () => useStore.getState().S.active.entries[0]

function typeInto(textarea, value) {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  act(() => {
    setValue.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
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

    expect(view.container.querySelector('.hdr .sub')?.textContent).toContain('2/2 sets')

    const finish = view.container.querySelector('.wk-hdr button[aria-label="Finish"]')
    expect(finish).toBeTruthy()
    expect(finish.classList.contains('done')).toBe(true)
    expect(finish.classList.contains('go')).toBe(false)

    click(finish)
    expect(useStore.getState().S.active).toBeFalsy()
    expect(useStore.getState().S.workouts).toHaveLength(1)
  })
})

describe('workout screen hierarchy', () => {
  it('carries progress in the segments and the header count, with no "Exercise N / M" line', () => {
    view = renderWorkoutApp([exercise('0025', [false, false]), exercise('0047', [false])])

    expect(view.container.textContent).not.toMatch(/Exercise \d+ \/ \d+/)
    const segs = [...view.container.querySelectorAll('.lad-s')]
    expect(segs.length).toBe(2)
    expect(segs[0].getAttribute('aria-label')).toMatch(/^Go to /)
    expect(segs[0].getAttribute('aria-current')).toBe('step')
    expect(view.container.querySelector('.hdr .sub')?.textContent).toContain('0/3 sets')
  })

  it('draws Note, Replace and Details as small keys with an icon and a word', () => {
    view = renderWorkoutApp([exercise('0025', [false])])

    for (const [name, word] of [['Add note', 'Note'], ['Replace exercise', 'Replace'], ['Details', 'Details']]) {
      const key = byLabel(name)
      expect(key, name).toBeTruthy()
      expect(key.classList.contains('btn'), name).toBe(true)
      expect(key.classList.contains('xs'), name).toBe(true)
      expect(key.querySelector('svg.icn'), name).toBeTruthy()
      expect(key.textContent.trim(), name).toBe(word)
    }
  })

  it('offers Finish once, in the header, neutral while sets remain; the footer keeps Discard only', () => {
    view = renderWorkoutApp([exercise('0025', [true, false]), exercise('0047', [false])])

    const finishes = [...view.container.querySelectorAll('button')].filter(b => /finish/i.test(b.getAttribute('aria-label') || b.textContent))
    expect(finishes.length).toBe(1)
    expect(finishes[0].closest('.wk-hdr')).toBeTruthy()
    expect(finishes[0].classList.contains('done')).toBe(false)
    expect(finishes[0].classList.contains('go')).toBe(false)
    expect(view.container.textContent).not.toContain('Finish workout early')
    expect(view.container.querySelector('button.wk-discard')?.textContent).toBe('Discard workout')
    expect(view.container.querySelector('button.wk-discard')?.hasAttribute('aria-label')).toBe(false)
  })
})

describe('Workout exercise notes and note sheet', () => {
  it('renders note callout above set table when entry.notes is present', () => {
    view = renderWorkoutApp([exercise('0025', [false], { notes: 'Seat height 5, pin 8' })])

    const callout = view.container.querySelector('.exnote')
    expect(callout).not.toBeNull()
    expect(callout.textContent).toContain('Seat height 5, pin 8')
    expect(callout.getAttribute('role')).toBe('button')
    expect(callout.getAttribute('aria-label')).toBe('Edit note')
    expect(byLabel('Add note')).toBeNull()
  })

  it('renders a labelled add note button in header when entry.notes is empty, without note callout', () => {
    view = renderWorkoutApp([exercise('0025', [false])])

    expect(view.container.querySelector('.exnote')).toBeNull()
    expect(byLabel('Add note')?.textContent).toBe('Note')
  })

  it('tapping the note callout, or pressing Enter or Space on it, opens the note sheet for that exercise', () => {
    view = renderWorkoutApp([exercise('0025', [false], { notes: 'Focus on chest squeeze' })])
    const callout = view.container.querySelector('.exnote')

    for (const open of [() => click(callout), () => press(callout, 'Enter'), () => press(callout, ' ')]) {
      expect(openSheets()).toHaveLength(0)
      open()
      expect(openSheets()).toHaveLength(1)
      expect(view.container.querySelector('[role="dialog"] h3')?.textContent).toContain('Note ·')
      expect(view.container.querySelector('[role="dialog"] textarea').value).toBe('Focus on chest squeeze')
      act(() => useUI.getState().closeSheet(openSheets()[0].id))
    }
  })

  it('tapping the header note button when the note is empty opens an empty note sheet', () => {
    view = renderWorkoutApp([exercise('0025', [false])])

    click(byLabel('Add note'))
    expect(view.container.querySelector('[role="dialog"] h3')?.textContent).toContain('Note ·')
    expect(view.container.querySelector('[role="dialog"] textarea').value).toBe('')
  })

  it('the note sheet edits and saves the note onto the active entry, then closes', () => {
    view = renderWorkoutApp([exercise('0025', [false], { notes: 'Old cue' })])
    click(view.container.querySelector('.exnote'))

    const textarea = view.container.querySelector('[role="dialog"] textarea')
    expect(textarea.getAttribute('aria-label')).toBe('Exercise note')
    expect(textarea.getAttribute('placeholder')).toBe('Notes, cues, or machine setup…')
    expect(textarea.getAttribute('maxlength')).toBe('500')

    typeInto(textarea, 'Seat height 6, pin 9')
    expect(view.container.querySelector('[role="dialog"]').textContent).toContain('20/500')

    click(noteButton('Save note'))
    expect(activeEntry().notes).toBe('Seat height 6, pin 9')
    expect(openSheets()).toHaveLength(0)
  })

  it('the note sheet clears the note off the active entry, then closes', () => {
    view = renderWorkoutApp([exercise('0025', [false], { notes: 'Temporary cue to clear' })])
    click(view.container.querySelector('.exnote'))

    click(noteButton('Clear note'))
    expect(activeEntry().notes).toBeUndefined()
    expect(openSheets()).toHaveLength(0)
  })
})
