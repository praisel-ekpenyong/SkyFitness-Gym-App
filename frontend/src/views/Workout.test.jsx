import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Workout from './Workout.jsx'
import { ExerciseNoteSheet } from '../sheets/session.jsx'

import { act as actOn } from '../lib/active-workout.js'
import { runEffects } from '../store/effects.js'

const mocks = vi.hoisted(() => {
  const state = {
    S: null,
    startRest: vi.fn(),
    stopRest: vi.fn(),
    workoutCompleteSheet: vi.fn(),
    exerciseNoteSheet: vi.fn(),
  }
  state.storeSnapshot = () => ({
    S: state.S,
    update: mut => mut(state.S),
    act: command => {
      const res = actOn(state.S, command)
      runEffects(res.effects, state.S)
      return res
    },
  })
  state.uiSnapshot = () => ({
    work: null,
    startRest: state.startRest,
    stopRest: state.stopRest,
    startWork: vi.fn(),
    toast: vi.fn(),
  })
  return state
})

vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector(mocks.storeSnapshot())
  useStore.getState = mocks.storeSnapshot
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const useUI = selector => selector ? selector(mocks.uiSnapshot()) : mocks.uiSnapshot()
  useUI.getState = mocks.uiSnapshot
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../sheets.jsx', () => ({
  startFlow: vi.fn(),
  exercisePicker: vi.fn(),
  exConfigSheet: vi.fn(),
  exerciseDetailSheet: vi.fn(),
  finishWorkout: vi.fn(),
  workoutCompleteSheet: mocks.workoutCompleteSheet,
  confirmSheet: vi.fn(),
  exerciseNoteSheet: mocks.exerciseNoteSheet,
}))
vi.mock('../components/Media.jsx', () => ({ default: () => null }))

let dom
let root
let container

function exercise(id, sets, extra = {}) {
  return {
    id,
    target: { mode: 'reps', reps: 5, weight: 60, bodyweight: false },
    sets: sets.map(done => ({ w: 60, r: 5, done })),
    ...extra,
  }
}

function workout(entries, cur = 0) {
  return {
    unit: 'kg', restSec: 90, sound: false, effort: 'none', gifSize: 'full',
    workouts: [], exWeights: {}, routines: [],
    active: { id: 'active', name: 'Test workout', start: Date.now(), cur, entries },
  }
}

function installDom() {
  const parsed = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>')
  dom = parsed.window
  globalThis.window = dom
  globalThis.document = dom.document
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.navigator })
  for (const key of ['HTMLElement', 'Node', 'Element', 'Event', 'Blob']) globalThis[key] = dom[key]
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.getElementById('root')
  root = createRoot(container)
}

async function mount(entries, cur = 0) {
  mocks.S = workout(entries, cur)
  installDom()
  await act(async () => { root.render(React.createElement(Workout)) })
}

async function unmount() {
  if (!root) return
  await act(async () => { root.unmount() })
  root = null
  container = null
  dom = null
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(async () => {
  await unmount()
})

describe('header and finish button share one progress reading', () => {
  it('an unticked warm-up neither stalls the button nor fakes an unchecked set', async () => {
    await mount([{
      id: '0025',
      target: { mode: 'reps', reps: 5, weight: 100, bodyweight: false },
      sets: [
        { w: 40, r: 5, done: false, phase: 'warmup' },
        { w: 100, r: 8, done: true },
        { w: 100, r: 8, done: true },
      ],
    }])

    expect(container.querySelector('.hdr .sub')?.textContent).toContain('2/2 sets')

    const finish = container.querySelector('.wk-hdr button[aria-label="Finish"]')
    expect(finish).toBeTruthy()
    expect(finish.classList.contains('done')).toBe(true)
    expect(finish.classList.contains('go')).toBe(false)

    await act(async () => { finish.dispatchEvent(new dom.Event('click', { bubbles: true })) })
    const { finishWorkout } = await import('../sheets.jsx')
    expect(finishWorkout).toHaveBeenCalledOnce()
  })
})

describe('workout screen hierarchy', () => {
  it('carries progress in the segments and the header count, with no "Exercise N / M" line', async () => {
    await mount([exercise('0025', [false, false]), exercise('0047', [false])])

    expect(container.textContent).not.toMatch(/Exercise \d+ \/ \d+/)
    const segs = [...container.querySelectorAll('.lad-s')]
    expect(segs.length).toBe(2)
    expect(segs[0].getAttribute('aria-label')).toMatch(/^Go to /)
    expect(segs[0].getAttribute('aria-current')).toBe('step')
    expect(container.querySelector('.hdr .sub')?.textContent).toContain('0/3 sets')
  })

  it('draws Note, Replace and Details as small keys with an icon and a word', async () => {
    await mount([exercise('0025', [false])])

    for (const [name, word] of [['Add note', 'Note'], ['Replace exercise', 'Replace'], ['Details', 'Details']]) {
      const key = container.querySelector(`button[aria-label="${name}"]`)
      expect(key, name).toBeTruthy()
      expect(key.classList.contains('btn'), name).toBe(true)
      expect(key.classList.contains('xs'), name).toBe(true)
      expect(key.querySelector('svg.icn'), name).toBeTruthy()
      expect(key.textContent.trim(), name).toBe(word)
    }
  })

  it('offers Finish once, in the header, neutral while sets remain; the footer keeps Discard only', async () => {
    await mount([exercise('0025', [true, false]), exercise('0047', [false])])

    const finishes = [...container.querySelectorAll('button')].filter(b => /finish/i.test(b.getAttribute('aria-label') || b.textContent))
    expect(finishes.length).toBe(1)
    expect(finishes[0].closest('.wk-hdr')).toBeTruthy()
    expect(finishes[0].classList.contains('done')).toBe(false)
    expect(finishes[0].classList.contains('go')).toBe(false)
    expect(container.textContent).not.toContain('Finish workout early')
    expect(container.querySelector('button.wk-discard')?.textContent).toBe('Discard workout')
  })
})

describe('Workout exercise notes and note sheet', () => {
  it('renders note callout above set table when entry.notes is present', async () => {
    await mount([exercise('0025', [false], { notes: 'Seat height 5, pin 8' })])

    const callout = container.querySelector('.exnote')
    expect(callout).not.toBeNull()
    expect(callout.textContent).toContain('Seat height 5, pin 8')
    expect(callout.getAttribute('role')).toBe('button')
    expect(callout.getAttribute('aria-label')).toBe('Edit note')

    const headerBtn = container.querySelector('button[aria-label="Add note"]')
    expect(headerBtn).toBeNull()
  })

  it('renders a labelled add note button in header when entry.notes is empty, without note callout', async () => {
    await mount([exercise('0025', [false])])

    expect(container.querySelector('.exnote')).toBeNull()

    const headerBtn = container.querySelector('button[aria-label="Add note"]')
    expect(headerBtn).not.toBeNull()
    expect(headerBtn.textContent).toBe('Note')
  })

  it('tapping note callout opens exerciseNoteSheet', async () => {
    await mount([exercise('0025', [false], { notes: 'Focus on chest squeeze' })])

    const callout = container.querySelector('.exnote')
    await act(async () => {
      callout.dispatchEvent(new dom.Event('click', { bubbles: true }))
    })
    expect(mocks.exerciseNoteSheet).toHaveBeenCalledWith(0)

    mocks.exerciseNoteSheet.mockClear()

    const enterEv = new dom.Event('keydown', { bubbles: true })
    enterEv.key = 'Enter'
    await act(async () => {
      callout.dispatchEvent(enterEv)
    })
    expect(mocks.exerciseNoteSheet).toHaveBeenCalledWith(0)

    mocks.exerciseNoteSheet.mockClear()

    const spaceEv = new dom.Event('keydown', { bubbles: true })
    spaceEv.key = ' '
    await act(async () => {
      callout.dispatchEvent(spaceEv)
    })
    expect(mocks.exerciseNoteSheet).toHaveBeenCalledWith(0)
  })

  it('tapping header note button when note is empty opens exerciseNoteSheet', async () => {
    await mount([exercise('0025', [false])])

    const headerBtn = container.querySelector('button[aria-label="Add note"]')
    await act(async () => {
      headerBtn.dispatchEvent(new dom.Event('click', { bubbles: true }))
    })
    expect(mocks.exerciseNoteSheet).toHaveBeenCalledWith(0)
  })

  it('ExerciseNoteSheet edits and saves note, updating active entry in store', async () => {
    await mount([exercise('0025', [false], { notes: 'Old cue' })])
    const close = vi.fn()

    await act(async () => {
      root.render(React.createElement(ExerciseNoteSheet, { entryIdx: 0, close }))
    })

    expect(container.querySelector('h3')?.textContent).toContain('Note ·')

    const textarea = container.querySelector('textarea')
    expect(textarea).not.toBeNull()
    expect(textarea.value).toBe('Old cue')
    expect(textarea.getAttribute('aria-label')).toBe('Exercise note')
    expect(textarea.getAttribute('placeholder')).toBe('Notes, cues, or machine setup…')
    expect(textarea.getAttribute('maxLength') || textarea.getAttribute('maxlength')).toBe('500')

    await act(async () => {
      const reactPropsKey = Object.keys(textarea).find(k => k.startsWith('__reactProps$'))
      if (reactPropsKey && textarea[reactPropsKey]?.onChange) {
        textarea[reactPropsKey].onChange({ target: { value: 'Seat height 6, pin 9' } })
      } else {
        textarea.value = 'Seat height 6, pin 9'
        textarea.dispatchEvent(new dom.Event('input', { bubbles: true }))
        textarea.dispatchEvent(new dom.Event('change', { bubbles: true }))
      }
    })

    expect(container.textContent).toContain('20/500')

    const saveBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Save note'))
    expect(saveBtn).not.toBeNull()
    await act(async () => {
      saveBtn.dispatchEvent(new dom.Event('click', { bubbles: true }))
    })

    expect(mocks.S.active.entries[0].notes).toBe('Seat height 6, pin 9')
    expect(close).toHaveBeenCalledOnce()
  })

  it('ExerciseNoteSheet clears note, removing it from active entry in store', async () => {
    await mount([exercise('0025', [false], { notes: 'Temporary cue to clear' })])
    const close = vi.fn()

    await act(async () => {
      root.render(React.createElement(ExerciseNoteSheet, { entryIdx: 0, close }))
    })

    const clearBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Clear note'))
    expect(clearBtn).not.toBeNull()

    await act(async () => {
      clearBtn.dispatchEvent(new dom.Event('click', { bubbles: true }))
    })

    expect(mocks.S.active.entries[0].notes).toBeUndefined()
    expect(close).toHaveBeenCalledOnce()
  })
})

