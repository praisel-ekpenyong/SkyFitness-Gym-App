// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ExConfig, exConfigSheet } from './exercise-config.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'
import { useUI } from '../store/useUI.js'
import { buttonNamed, leafTexts, pick } from '../test/sheet-host.jsx'
import { fireEvent, within } from '@testing-library/react'
import { primaryAction } from '../test/catalogue-queries.js'

let container
let root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useStore.getState().replaceState(JSON.parse(JSON.stringify(DEF)))
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  if (container) container.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

describe('ExConfig and exConfigSheet onReplace support', () => {
  const sampleEx = {
    id: '0001',
    n: '3/4 sit-up',
    bp: 'waist',
    tg: 'abs',
    eq: 'body weight',
  }

  it('renders "Replace exercise" button when editing existing exercise with onReplace callback', async () => {
    const onReplace = vi.fn()
    const close = vi.fn()
    const onSave = vi.fn()

    await act(async () => {
      root.render(
        <ExConfig
          ex={sampleEx}
          existing={{ id: '0001', sets: 4, reps: 10, weight: 0, mode: 'reps' }}
          onSave={onSave}
          close={close}
          onReplace={onReplace}
        />
      )
    })

    const replaceBtn = within(container).queryByRole('button', { name: /Replace exercise/ })
    expect(replaceBtn).toBeTruthy()

    fireEvent.click(replaceBtn)

    expect(close).toHaveBeenCalledTimes(1)
    expect(onReplace).toHaveBeenCalledTimes(1)
  })

  it('does not render "Replace exercise" button when existing is null (adding an exercise)', async () => {
    const onReplace = vi.fn()

    await act(async () => {
      root.render(
        <ExConfig
          ex={sampleEx}
          existing={null}
          onSave={vi.fn()}
          close={vi.fn()}
          onReplace={onReplace}
        />
      )
    })

    const replaceBtn = within(container).queryByRole('button', { name: /Replace exercise/ })
    expect(replaceBtn).toBeNull()
  })

  it('does not render "Replace exercise" button when onReplace is not provided', async () => {
    await act(async () => {
      root.render(
        <ExConfig
          ex={sampleEx}
          existing={{ id: '0001', sets: 3, reps: 10, weight: 0, mode: 'reps' }}
          onSave={vi.fn()}
          close={vi.fn()}
        />
      )
    })

    const replaceBtn = within(container).queryByRole('button', { name: /Replace exercise/ })
    expect(replaceBtn).toBeNull()
  })

  it('pre-seeds sets and merges with exercise defaults when initial is provided without existing', async () => {
    let savedConfig = null
    const onSave = vi.fn(cfg => { savedConfig = cfg })
    const close = vi.fn()

    await act(async () => {
      root.render(
        <ExConfig
          ex={sampleEx}
          existing={null}
          initial={{ sets: 5 }}
          onSave={onSave}
          close={close}
        />
      )
    })

    const setsInput = within(container).getByLabelText('Sets')
    expect(setsInput.value).toBe('5')

    const saveBtn = primaryAction(container)
    fireEvent.click(saveBtn)

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(savedConfig.sets).toBe(5)
    expect(savedConfig.reps).toBe(10)
  })

  it('passes onReplace through exConfigSheet to ExConfig', async () => {
    const onReplace = vi.fn()
    exConfigSheet(sampleEx, { existing: { id: '0001', sets: 3, reps: 10 }, onSave: vi.fn(), onDelete: vi.fn(), onReplace })

    const sheets = useUI.getState().sheets
    expect(sheets.length).toBe(1)

    await act(async () => {
      root.render(sheets[0].render(() => useUI.getState().closeSheet(sheets[0].id)))
    })

    const replaceBtn = within(container).queryByRole('button', { name: /Replace exercise/ })
    expect(replaceBtn).toBeTruthy()

    fireEvent.click(replaceBtn)

    expect(onReplace).toHaveBeenCalledTimes(1)
    expect(useUI.getState().sheets.length).toBe(0)
  })

  it('renders actionLabel on primary button if provided to ExConfig', async () => {
    await act(async () => {
      root.render(
        <ExConfig
          ex={sampleEx}
          existing={null}
          actionLabel="Replace"
          onSave={vi.fn()}
          close={vi.fn()}
        />
      )
    })
    expect(within(container).getByRole('button', { name: 'Replace' })).toBeTruthy()
  })

  it('passes actionLabel through exConfigSheet to ExConfig', async () => {
    exConfigSheet(sampleEx, { onSave: vi.fn(), actionLabel: 'Custom Action' })
    const sheets = useUI.getState().sheets
    expect(sheets.length).toBe(1)
    await act(async () => {
      root.render(sheets[0].render(() => useUI.getState().closeSheet(sheets[0].id)))
    })
    expect(within(container).getByRole('button', { name: 'Custom Action' })).toBeTruthy()
  })
})

describe('ExConfig notes and cues', () => {
  const sampleEx = {
    id: '0001',
    n: '3/4 sit-up',
    bp: 'waist',
    tg: 'abs',
    eq: 'body weight',
  }

  const cardioEx = {
    id: 'c1',
    n: 'Treadmill',
    bp: 'cardio',
    tg: 'cardio',
    eq: 'machine',
  }

  const setTextAreaValue = (textarea, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
  }

  it('renders TextArea for notes with 0/500 counter when notes is empty', async () => {
    await act(async () => {
      root.render(
        <ExConfig
          ex={sampleEx}
          existing={null}
          onSave={vi.fn()}
          close={vi.fn()}
        />
      )
    })

    const textarea = within(container).getByRole('textbox', { name: 'Notes and cues' })
    expect(textarea).toBeTruthy()
    expect(textarea.placeholder).toBe('Notes, cues, or machine setup…')
    expect(textarea.value).toBe('')
    expect(textarea.getAttribute('maxlength')).toBe('500')

    const counter = within(container).getByText(/\/500$/)
    expect(counter).toBeTruthy()
    expect(counter.textContent).toBe('0/500')
  })

  it('prefills notes from existing config and displays character counter', async () => {
    await act(async () => {
      root.render(
        <ExConfig
          ex={sampleEx}
          existing={{ id: '0001', sets: 3, reps: 10, notes: 'Seat height 5, pin 3' }}
          onSave={vi.fn()}
          close={vi.fn()}
        />
      )
    })

    const textarea = within(container).getByRole('textbox', { name: 'Notes and cues' })
    expect(textarea).toBeTruthy()
    expect(textarea.value).toBe('Seat height 5, pin 3')

    const counter = within(container).getByText(/\/500$/)
    expect(counter.textContent).toBe('20/500')
  })

  it('prefills notes from initial config when existing is null', async () => {
    await act(async () => {
      root.render(
        <ExConfig
          ex={sampleEx}
          existing={null}
          initial={{ sets: 4, notes: 'Focus on slow negative' }}
          onSave={vi.fn()}
          close={vi.fn()}
        />
      )
    })

    const textarea = within(container).getByRole('textbox', { name: 'Notes and cues' })
    expect(textarea.value).toBe('Focus on slow negative')

    const counter = within(container).getByText(/\/500$/)
    expect(counter.textContent).toBe('22/500')
  })

  it('updates state and counter on typing in TextArea', async () => {
    await act(async () => {
      root.render(
        <ExConfig
          ex={sampleEx}
          existing={null}
          onSave={vi.fn()}
          close={vi.fn()}
        />
      )
    })

    const textarea = within(container).getByRole('textbox', { name: 'Notes and cues' })
    await act(async () => {
      setTextAreaValue(textarea, 'Keep back flat')
    })

    const counter = within(container).getByText(/\/500$/)
    expect(counter.textContent).toBe('14/500')
  })

  it('passes trimmed notes to onSave for reps mode', async () => {
    let saved = null
    const onSave = vi.fn(cfg => { saved = cfg })

    await act(async () => {
      root.render(
        <ExConfig
          ex={sampleEx}
          existing={null}
          onSave={onSave}
          close={vi.fn()}
        />
      )
    })

    const textarea = within(container).getByRole('textbox', { name: 'Notes and cues' })
    await act(async () => {
      setTextAreaValue(textarea, '   Pause at peak contraction   ')
    })

    const saveBtn = primaryAction(container)
    fireEvent.click(saveBtn)

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(saved.notes).toBe('Pause at peak contraction')
  })

  it('passes trimmed notes to onSave for cardio mode', async () => {
    let saved = null
    const onSave = vi.fn(cfg => { saved = cfg })

    await act(async () => {
      root.render(
        <ExConfig
          ex={cardioEx}
          existing={null}
          onSave={onSave}
          close={vi.fn()}
        />
      )
    })

    const textarea = within(container).getByRole('textbox', { name: 'Notes and cues' })
    await act(async () => {
      setTextAreaValue(textarea, '  Incline 3.0  ')
    })

    const saveBtn = primaryAction(container)
    fireEvent.click(saveBtn)

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(saved.notes).toBe('Incline 3.0')
  })

  it('passes trimmed notes to onSave for time mode', async () => {
    let saved = null
    const onSave = vi.fn(cfg => { saved = cfg })

    await act(async () => {
      root.render(
        <ExConfig
          ex={sampleEx}
          existing={null}
          onSave={onSave}
          close={vi.fn()}
        />
      )
    })

    const segButtons = within(container).getAllByRole('radio')
    const timeBtn = segButtons.find(b => b.textContent.includes('Time'))
    fireEvent.click(timeBtn)

    const textarea = within(container).getByRole('textbox', { name: 'Notes and cues' })
    await act(async () => {
      setTextAreaValue(textarea, 'Hold steady')
    })

    const saveBtn = primaryAction(container)
    fireEvent.click(saveBtn)

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(saved.mode).toBe('time')
    expect(saved.notes).toBe('Hold steady')
  })

  it('omits notes property when notes is empty or whitespace only', async () => {
    let saved = null
    const onSave = vi.fn(cfg => { saved = cfg })

    await act(async () => {
      root.render(
        <ExConfig
          ex={sampleEx}
          existing={{ id: '0001', sets: 3, reps: 10, notes: 'old note' }}
          onSave={onSave}
          close={vi.fn()}
        />
      )
    })

    const textarea = within(container).getByRole('textbox', { name: 'Notes and cues' })
    await act(async () => {
      setTextAreaValue(textarea, '     ')
    })

    const saveBtn = primaryAction(container)
    fireEvent.click(saveBtn)

    expect(onSave).toHaveBeenCalledTimes(1)
    expect('notes' in saved).toBe(false)
  })

  it('respects 500-character ceiling by truncating notes exceeding 500 chars', async () => {
    let saved = null
    const onSave = vi.fn(cfg => { saved = cfg })

    await act(async () => {
      root.render(
        <ExConfig
          ex={sampleEx}
          existing={null}
          onSave={onSave}
          close={vi.fn()}
        />
      )
    })

    const longNote = 'A'.repeat(550)
    const textarea = within(container).getByRole('textbox', { name: 'Notes and cues' })
    await act(async () => {
      setTextAreaValue(textarea, longNote)
    })

    const saveBtn = primaryAction(container)
    fireEvent.click(saveBtn)

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(saved.notes.length).toBe(500)
    expect(saved.notes).toBe('A'.repeat(500))
  })
})



const bench = { id: '0025', n: 'barbell bench press', bp: 'chest', tg: 'pectorals', eq: 'barbell' }
const pushUp = { id: '0662', n: 'push-up', bp: 'chest', tg: 'pectorals', eq: 'body weight' }
const steps = { id: '3672', n: 'back and forth step', bp: 'cardio', tg: 'cardio', eq: 'body weight' }

describe('ExConfig Rest duration', () => {
  const restRow = () => within(container).getByRole('button', { name: /^Rest duration/ })
  const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const saveBtn = () => primaryAction(container)

  let mounts = 0
  async function renderConfig(ex, existing) {
    const onSave = vi.fn()
    await act(async () => { root.render(<ExConfig key={mounts++} ex={ex} existing={existing} onSave={onSave} close={vi.fn()} />) })
    return onSave
  }

  async function pick(label) {
    fireEvent.click(restRow())
    const sheet = useUI.getState().sheets.at(-1)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const sheetRoot = createRoot(host)
    await act(async () => { sheetRoot.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))) })
    const options = within(host).getAllByRole('button')
    const labels = options.map(o => o.textContent)
    const option = within(host).getByRole('button', { name: label })
    fireEvent.click(option)
    await act(async () => { sheetRoot.unmount() })
    host.remove()
    return labels
  }

  it('reads Default, naming the Profile\'s Rest duration, when the exercise has none of its own', async () => {
    useStore.getState().update(s => { s.restSec = 120 })
    await renderConfig(bench, { id: '0025', sets: 3, reps: 8, weight: 60 })
    expect(within(restRow()).getByText('Default (120s)')).toBeTruthy()
  })

  it('offers Default and the Settings durations, and saves the one picked', async () => {
    const onSave = await renderConfig(bench, { id: '0025', sets: 3, reps: 8, weight: 60 })
    expect(await pick('180s')).toEqual(['Default (90s)', '60s', '90s', '120s', '150s', '180s'])
    expect(within(restRow()).getByText('180s')).toBeTruthy()
    fireEvent.click(saveBtn())
    expect(onSave.mock.calls[0][0]).toMatchObject({ sets: 3, reps: 8, rest: 180 })
  })

  it('stores nothing for Default', async () => {
    const onSave = await renderConfig(bench, { id: '0025', sets: 3, reps: 8, weight: 60, rest: 150 })
    expect(within(restRow()).getByText('150s')).toBeTruthy()
    await pick('Default (90s)')
    fireEvent.click(saveBtn())
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('rest')
  })

  it('keeps a picked duration that equals the Profile\'s, so it does not follow a later Settings change', async () => {
    const picked = await renderConfig(bench, { id: '0025', sets: 3, reps: 8, weight: 60 })
    await pick('90s')
    fireEvent.click(saveBtn())
    expect(picked.mock.calls[0][0].rest).toBe(90)

    const kept = await renderConfig(bench, { id: '0025', sets: 3, reps: 8, weight: 60, rest: 90 })
    expect(within(restRow()).getByText('90s')).toBeTruthy()
    fireEvent.click(saveBtn())
    expect(kept.mock.calls[0][0].rest).toBe(90)
  })

  it('shows a Rest duration from a plan file that is not on the list, and keeps it', async () => {
    const onSave = await renderConfig(bench, { id: '0025', sets: 3, reps: 8, weight: 60, rest: 75 })
    expect(within(restRow()).getByText('75s')).toBeTruthy()
    fireEvent.click(saveBtn())
    expect(onSave.mock.calls[0][0].rest).toBe(75)
  })

  it('has a Rest duration for timed and cardio exercises too', async () => {
    const timed = await renderConfig(bench, { id: '0025', sets: 3, mode: 'time', sec: 45 })
    await pick('60s')
    fireEvent.click(saveBtn())
    expect(timed.mock.calls[0][0]).toMatchObject({ mode: 'time', rest: 60 })

    const cardio = await renderConfig(steps, null)
    await pick('120s')
    fireEvent.click(saveBtn())
    expect(cardio.mock.calls[0][0]).toMatchObject({ min: 20, rest: 120 })
  })
})

describe('ExConfig round trip: pick, save to the routine, change the Setting, read the entry', () => {
  const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const switchOf = name => within(container).getByRole('switch', { name })
  const stepperValue = label => within(container).getByLabelText(label).value
  const stepUp = async label => { fireEvent.click(buttonNamed(container, `Increase ${label}`)) }
  const stepDown = async label => { fireEvent.click(buttonNamed(container, `Decrease ${label}`)) }
  const entry = () => useStore.getState().S.routines[0].ex[0]
  const routine = () => useStore.getState().S.routines[0]

  let mounts = 0
  async function openEntry(ex, stored) {
    useStore.getState().update(s => { s.routines = [{ ...s.routines.find(r => r.id === 'r-rt'), id: 'r-rt', name: 'Push', emoji: '💪', ex: [{ id: ex.id, ...stored }] }] })
    const onSave = cfg => useStore.getState().actRoutine({ type: 'replaceExercise', routineId: 'r-rt', index: 0, exId: ex.id, target: cfg })
    await act(async () => { root.render(<ExConfig key={mounts++} ex={ex} existing={entry()} routine={routine()} onSave={onSave} close={vi.fn()} />) })
  }
  const save = async () => { fireEvent.click(buttonNamed(container, 'Save')) }

  describe('Bodyweight switch: stores only a difference from the catalogue', () => {
    it('stores nothing for a body-weight exercise saved as body weight', async () => {
      await openEntry(pushUp, { sets: 3, reps: 12, weight: 0, mode: 'reps' })
      await save()
      expect(entry()).not.toHaveProperty('bodyweight')
    })

    it('stores false when a body-weight exercise is switched off, and nothing once it is switched back', async () => {
      await openEntry(pushUp, { sets: 3, reps: 12, weight: 0, mode: 'reps' })
      fireEvent.click(switchOf('Bodyweight'))
      await save()
      expect(entry().bodyweight).toBe(false)

      await openEntry(pushUp, entry())
      fireEvent.click(switchOf('Bodyweight'))
      await save()
      expect(entry()).not.toHaveProperty('bodyweight')
    })

    it('stores true when a loaded exercise is switched on, and nothing once it is switched back', async () => {
      await openEntry(bench, { sets: 3, reps: 8, weight: 60, mode: 'reps' })
      await save()
      expect(entry()).not.toHaveProperty('bodyweight')

      fireEvent.click(switchOf('Bodyweight'))
      await save()
      expect(entry().bodyweight).toBe(true)

      await openEntry(bench, entry())
      fireEvent.click(switchOf('Bodyweight'))
      await save()
      expect(entry()).not.toHaveProperty('bodyweight')
    })
  })

  describe('Progression rule: Default is "Follow the routine"', () => {
    const follow = 'Follow the routine (Linear progression)'

    it('keeps a picked rule that equals the routine\'s, so a later routine change does not move it', async () => {
      await openEntry(bench, { sets: 3, reps: 8, weight: 60, mode: 'reps' })
      expect(leafTexts(buttonNamed(container, 'Rule'))).toContain(follow)
      await pick(container, 'Rule', 'Linear progression')
      await save()
      useStore.getState().actRoutine({ type: 'setProgression', routineId: 'r-rt', prog: 'double' })
      expect(entry().prog).toBe('linear')
    })

    it('stores nothing for Follow the routine, so the entry takes up a later routine change', async () => {
      await openEntry(bench, { sets: 3, reps: 8, weight: 60, mode: 'reps', prog: 'greyskull' })
      await pick(container, 'Rule', follow)
      await save()
      expect(entry()).not.toHaveProperty('prog')
      useStore.getState().actRoutine({ type: 'setProgression', routineId: 'r-rt', prog: 'double' })
      await openEntry(bench, entry())
      expect(leafTexts(buttonNamed(container, 'Rule'))).toContain('Follow the routine (Double progression)')
    })
  })

  describe('Progression step: follows the weight unit until stepped', () => {
    it('stores nothing untouched, so the step follows a later unit change', async () => {
      await openEntry(bench, { sets: 3, reps: 8, weight: 60, mode: 'reps' })
      expect(stepperValue('Step (kg)')).toBe('2.5')
      await save()
      expect(entry()).not.toHaveProperty('inc')
      useStore.getState().update(s => { s.unit = 'lb' })
      await openEntry(bench, entry())
      expect(stepperValue('Step (lb)')).toBe('5')
    })

    it('keeps a step stepped back to the unit\'s, so a later unit change does not move it', async () => {
      await openEntry(bench, { sets: 3, reps: 8, weight: 60, mode: 'reps' })
      await stepUp('Step (kg)')
      await stepDown('Step (kg)')
      await save()
      expect(entry().inc).toBe(2.5)
      useStore.getState().update(s => { s.unit = 'lb' })
      await openEntry(bench, entry())
      expect(stepperValue('Step (lb)')).toBe('2.5')
    })
  })

  describe('Progression step in seconds: a timed hold steps by 5 s until stepped', () => {
    const hold = { sets: 3, sec: 45, weight: 0, mode: 'time', prog: 'time' }

    it('stores nothing untouched', async () => {
      await openEntry(bench, hold)
      expect(stepperValue('Step (seconds)')).toBe('5')
      await save()
      expect(entry()).not.toHaveProperty('inc')
    })

    it('stores the step picked, the shown one included', async () => {
      await openEntry(bench, hold)
      await stepUp('Step (seconds)')
      await save()
      expect(entry()).toMatchObject({ mode: 'time', inc: 10 })

      await openEntry(bench, entry())
      await stepDown('Step (seconds)')
      await save()
      expect(entry()).toMatchObject({ mode: 'time', inc: 5 })
    })
  })

  describe('Rest: follows the Setting until a duration is picked', () => {
    it('stores a picked duration that equals the Setting, so a later Setting change does not move it', async () => {
      useStore.getState().update(s => { s.restSec = 90 })
      await openEntry(bench, { sets: 3, reps: 8, weight: 60 })
      await pick(container, 'Rest duration', '90s')
      await save()
      expect(entry().rest).toBe(90)

      useStore.getState().update(s => { s.restSec = 120 })
      await openEntry(bench, entry())
      expect(leafTexts(buttonNamed(container, 'Rest duration'))).toContain('90s')
    })

    it('stores nothing for Default, so the entry follows a later Setting change', async () => {
      useStore.getState().update(s => { s.restSec = 90 })
      await openEntry(bench, { sets: 3, reps: 8, weight: 60, rest: 120 })
      await pick(container, 'Rest duration', 'Default (90s)')
      await save()
      expect(entry()).not.toHaveProperty('rest')

      useStore.getState().update(s => { s.restSec = 120 })
      await openEntry(bench, entry())
      expect(leafTexts(buttonNamed(container, 'Rest duration'))).toContain('Default (120s)')
    })
  })

  describe('controls that follow no Setting store what is picked', () => {
    it('Reps per side stores side when on and nothing when off', async () => {
      await openEntry(bench, { sets: 3, reps: 8, weight: 20, mode: 'reps' })
      fireEvent.click(switchOf('Reps per side'))
      await save()
      expect(entry()).toMatchObject({ side: true, reps: 8 })

      await openEntry(bench, entry())
      fireEvent.click(switchOf('Reps per side'))
      await save()
      expect(entry()).not.toHaveProperty('side')
    })

    it('Log mode stores the mode picked, the shown one included', async () => {
      await openEntry(bench, { sets: 3, reps: 8, weight: 60 })
      fireEvent.click(within(container).getByRole('radio', { checked: true }))
      await save()
      expect(entry().mode).toBe('reps')

      await openEntry(bench, entry())
      fireEvent.click(within(container).getAllByRole('radio').find(b => b.textContent === 'Time'))
      await save()
      expect(entry()).toMatchObject({ mode: 'time', sec: 45 })
      expect(entry()).not.toHaveProperty('reps')
    })

    it.each([
      ['Sets', bench, { sets: 3, reps: 8, weight: 60, mode: 'reps' }, { sets: 4 }],
      ['Reps', bench, { sets: 3, reps: 8, weight: 60, mode: 'reps' }, { reps: 9 }],
      ['Weight (kg)', bench, { sets: 3, reps: 8, weight: 60, mode: 'reps' }, { weight: 62.5 }],
      ['Seconds', bench, { sets: 3, sec: 45, weight: 0, mode: 'time' }, { sec: 50 }],
      ['Weight (kg)', bench, { sets: 3, sec: 45, weight: 0, mode: 'time' }, { mode: 'time', weight: 2.5 }],
      ['Intervals', steps, { sets: 1, min: 20, speed: 8 }, { sets: 2 }],
      ['Minutes', steps, { sets: 1, min: 20, speed: 8 }, { min: 21 }],
      ['Speed (km/h)', steps, { sets: 1, min: 20, speed: 8 }, { speed: 8.5 }],
      ['Added (kg)', pushUp, { sets: 3, reps: 12, weight: 0, mode: 'reps' }, { weight: 2.5 }],
      ['Top of the range', pushUp, { sets: 3, reps: 12, weight: 0, mode: 'reps', repsMax: 15 }, { repsMax: 16 }],
      ['Reps from', bench, { sets: 3, reps: 10, weight: 60, mode: 'reps', prog: 'double' }, { repsMin: 9 }],
    ])('%s stores the stepped value', async (label, ex, stored, expected) => {
      await openEntry(ex, stored)
      await stepUp(label)
      await save()
      expect(entry()).toMatchObject(expected)
    })

    // A zero the lifter can see is saved as shown where it is a real value (speed), and as the
    // nearest valid value, 1, where it is not. It never becomes a default they did not see.
    it.each([
      ['Speed (km/h)', steps, { sets: 1, min: 20, speed: 8 }, { speed: 0 }],
      ['Intervals', steps, { sets: 2, min: 20, speed: 8 }, { sets: 1 }],
      ['Minutes', steps, { sets: 1, min: 20, speed: 8 }, { min: 1 }],
      ['Sets', bench, { sets: 3, reps: 8, weight: 60, mode: 'reps' }, { sets: 1 }],
      ['Reps', bench, { sets: 3, reps: 8, weight: 60, mode: 'reps' }, { reps: 1 }],
      ['Seconds', bench, { sets: 3, sec: 45, weight: 0, mode: 'time' }, { sec: 1 }],
    ])('%s typed as 0 is saved as shown, or as 1 where 0 is not valid', async (label, ex, stored, expected) => {
      await openEntry(ex, stored)
      fireEvent.change(within(container).getByLabelText(label), { target: { value: '0' } })
      await save()
      expect(entry()).toMatchObject(expected)
    })

    it('a cardio Target with no speed saves the default speed', async () => {
      await openEntry(steps, { sets: 1, min: 20 })
      await save()
      expect(entry()).toMatchObject({ min: 20, speed: 8 })
    })
  })
})

describe('Remove from routine confirms', () => {
  const sampleEx = { id: '0001', n: '3/4 sit-up', bp: 'waist', tg: 'abs', eq: 'body weight' }

  it('leaves the routine in place until the danger confirm, then removes and closes', async () => {
    const onDelete = vi.fn()
    const close = vi.fn()
    await act(async () => {
      root.render(<ExConfig ex={sampleEx} existing={{ id: '0001', sets: 3, reps: 10 }} onSave={vi.fn()} onDelete={onDelete} close={close} />)
    })

    const remove = within(container).getByRole('button', { name: 'Remove from routine' })
    fireEvent.click(remove)
    expect(onDelete).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()

    const confirm = useUI.getState().sheets.at(-1)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const confirmRoot = createRoot(host)
    await act(async () => { confirmRoot.render(confirm.render(vi.fn())) })
    expect(host.textContent).toContain('Remove 3/4 sit-up?')
    expect(host.textContent).toContain('This removes the exercise from the routine.')
    const cancel = within(host).getByRole('button', { name: 'Cancel' })
    fireEvent.click(cancel)
    expect(onDelete).not.toHaveBeenCalled()

    const ok = within(host).getByRole('button', { name: 'Remove' })
    fireEvent.click(ok)
    expect(close).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledOnce()
    await act(async () => { confirmRoot.unmount() })
    host.remove()
  })
})
