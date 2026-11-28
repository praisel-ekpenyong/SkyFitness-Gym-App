// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { deleteCustomEx, CustomExForm } from './custom-exercise.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'
import { useUI } from '../store/useUI.js'
import { fireEvent, within } from '@testing-library/react'
import { chipRow, chipRows, isOn, primaryAction, typeInto, PICKABLE_CHIP_LABELS } from '../test/catalogue-queries.js'

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

describe('deleteCustomEx cascading deletion', () => {
  it('removes custom exercise ID from favorites, customEx, and routines, leaving legacy exWeights alone', async () => {
    const customEx = {
      id: 'c123',
      n: 'My Custom Curl',
      bp: 'arms',
      tg: '',
      eq: 'custom',
      custom: true
    }

    useStore.getState().update(s => {
      s.customEx = [customEx]
      s.favorites = ['0001', 'c123', '0002']
      s.exWeights = { c123: 25, '0001': 50 }
      s.routines = [
        { id: 'r1', name: 'Arm Day', emoji: '💪', ex: [{ id: 'c123', sets: 3, reps: 10 }, { id: '0001', sets: 3, reps: 10 }] }
      ]
    })

    const afterDelete = vi.fn()
    deleteCustomEx(customEx, afterDelete)

    const sheets = useUI.getState().sheets
    expect(sheets.length).toBe(1)
    expect(sheets[0].kind).toBe('center')

    const renderConfirm = sheets[0].render
    let confirmContainer = document.createElement('div')
    document.body.appendChild(confirmContainer)
    const confirmRoot = createRoot(confirmContainer)

    await act(async () => {
      confirmRoot.render(renderConfirm(() => useUI.getState().closeSheet(sheets[0].id)))
    })

    const confirmBtn = within(confirmContainer).getByRole('button', { name: 'Delete' })
    expect(confirmBtn).toBeTruthy()
    expect(confirmBtn.textContent).toBe('Delete')

    fireEvent.click(confirmBtn)

    const state = useStore.getState().S
    expect(state.customEx.find(e => e.id === 'c123')).toBeUndefined()
    expect(state.favorites).toEqual(['0001', '0002'])
    expect(state.exWeights).toEqual({ c123: 25, '0001': 50 })
    expect(state.routines[0].ex).toEqual([{ id: '0001', sets: 3, reps: 10 }])
    expect(afterDelete).toHaveBeenCalledTimes(1)

    await act(async () => {
      confirmRoot.unmount()
    })
    confirmContainer.remove()
  })
})

describe('CustomExForm canonical muscle selection and editing', () => {
  it('renders every pickable muscle with literal labels in a fixed order and gates secondaries until primary is chosen', async () => {
    await act(async () => {
      root.render(<CustomExForm onDone={vi.fn()} close={vi.fn()} />)
    })

    const title = within(container).getByRole('heading', { level: 3 })
    expect(title.textContent).toBe('Create your own exercise')

    expect(chipRows(container).length).toBe(1)

    const primaryChips = chipRow(container, 0).map(c => c.textContent.trim())
    expect(primaryChips.filter(c => PICKABLE_CHIP_LABELS.includes(c))).toEqual(PICKABLE_CHIP_LABELS)
  })

  it('allows selecting a primary muscle and multiple secondary muscles, deriving bp', async () => {
    const onDone = vi.fn()
    const close = vi.fn()

    await act(async () => {
      root.render(<CustomExForm onDone={onDone} close={close} />)
    })

    const nameInput = within(container).getByRole('textbox', { name: 'Exercise name' })
    typeInto(nameInput, 'Incline Hammer Curl')

    const primaryChips = chipRow(container, 0)
    const bicepsPrimary = primaryChips.find(c => c.textContent.trim() === 'Biceps')
    expect(bicepsPrimary).toBeTruthy()

    fireEvent.click(bicepsPrimary)
    expect(isOn(bicepsPrimary)).toBe(true)

    expect(chipRows(container)).toHaveLength(2)
    const secondaryChips = chipRow(container, 1)
    expect(secondaryChips.map(c => c.textContent.trim())).not.toContain('Biceps')
    expect(secondaryChips.length).toBe(20)

    const forearmsSec = secondaryChips.find(c => c.textContent.trim() === 'Forearms')
    expect(forearmsSec).toBeTruthy()
    fireEvent.click(forearmsSec)

    const secondaryChipsAfter = chipRow(container, 1)
    const upperBackSec = secondaryChipsAfter.find(c => c.textContent.trim() === 'Upper back')
    expect(upperBackSec).toBeTruthy()
    fireEvent.click(upperBackSec)

    const descInput = within(container).getByRole('textbox', { name: 'Description' })
    typeInto(descInput, 'Strict form, palms facing each other')

    const saveBtn = within(container).getByRole('button', { name: /Create exercise/ })
    expect(saveBtn).toBeTruthy()

    fireEvent.click(saveBtn)

    const state = useStore.getState().S
    expect(state.customEx.length).toBe(1)
    const created = state.customEx[0]
    expect(created.n).toBe('Incline Hammer Curl')
    expect(created.tg).toBe('biceps')
    expect(created.sm).toEqual(['forearm', 'upper-back'])
    expect(created.bp).toBe('upper arms')
    expect(created.desc).toBe('Strict form, palms facing each other')
    expect(created.eq).toBe('custom')
    expect(created.custom).toBe(true)

    expect(close).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('switching primary muscle removes it from secondary muscles if previously selected', async () => {
    await act(async () => {
      root.render(<CustomExForm onDone={vi.fn()} close={vi.fn()} />)
    })

    const primaryChips = () => chipRow(container, 0)
    const chestPrimary = primaryChips().find(c => c.textContent.trim() === 'Chest')
    fireEvent.click(chestPrimary)

    let secondaryChips = chipRow(container, 1)
    const shouldersSec = secondaryChips.find(c => c.textContent.trim() === 'Side delts')
    fireEvent.click(shouldersSec)

    const secondaryChipsAfter = chipRow(container, 1)
    const tricepsSec = secondaryChipsAfter.find(c => c.textContent.trim() === 'Triceps')
    fireEvent.click(tricepsSec)

    const shouldersPrimary = primaryChips().find(c => c.textContent.trim() === 'Side delts')
    fireEvent.click(shouldersPrimary)

    secondaryChips = chipRow(container, 1)
    const tricepsSecAfter = secondaryChips.find(c => c.textContent.trim() === 'Triceps')
    expect(isOn(tricepsSecAfter)).toBe(true)
    expect(secondaryChips.some(c => c.textContent.trim() === 'Side delts')).toBe(false)
  })

  it('selecting Cardio hides secondary muscle chips and clears existing secondaries', async () => {
    const onDone = vi.fn()
    const close = vi.fn()

    await act(async () => {
      root.render(<CustomExForm onDone={onDone} close={close} />)
    })

    const primaryChips = () => chipRow(container, 0)
    const chestPrimary = primaryChips().find(c => c.textContent.trim() === 'Chest')
    fireEvent.click(chestPrimary)

    const tricepsSec = chipRow(container, 1).find(c => c.textContent.trim() === 'Triceps')
    fireEvent.click(tricepsSec)

    const cardioPrimary = primaryChips().find(c => c.textContent.trim() === 'Cardio')
    fireEvent.click(cardioPrimary)

    expect(chipRows(container).length).toBe(1)
    expect(container.textContent).toContain('Cardio exercises log time and speed')

    const nameInput = within(container).getByRole('textbox', { name: 'Exercise name' })
    typeInto(nameInput, 'Rowing Machine Sprint')

    const saveBtn = within(container).getByRole('button', { name: /Create exercise/ })
    fireEvent.click(saveBtn)

    const state = useStore.getState().S
    const created = state.customEx.find(c => c.n === 'Rowing Machine Sprint')
    expect(created).toBeTruthy()
    expect(created.tg).toBe('cardio')
    expect(created.sm).toEqual([])
    expect(created.bp).toBe('cardio')
  })

  it('pre-fills primary and secondary muscles when editing an existing custom exercise', async () => {
    const existing = {
      id: 'c-test-99',
      n: 'My Custom Deadlift',
      bp: 'back',
      tg: 'lower-back',
      sm: ['gluteal', 'hamstring'],
      desc: 'Neutral grip handles',
      eq: 'custom',
      custom: true,
    }

    useStore.getState().update(s => {
      s.customEx = [existing]
    })

    await act(async () => {
      root.render(<CustomExForm existing={existing} onDone={vi.fn()} close={vi.fn()} />)
    })

    expect(within(container).getByRole('heading', { level: 3 })?.textContent).toBe('Edit custom exercise')
    expect(within(container).getByRole('textbox', { name: 'Exercise name' })?.value).toBe('My Custom Deadlift')
    expect(within(container).getByRole('textbox', { name: 'Description' })?.value).toBe('Neutral grip handles')

    const lowerBackPrimary = chipRow(container, 0)
      .find(c => c.textContent.trim() === 'Lower back')
    expect(isOn(lowerBackPrimary)).toBe(true)

    const secChips = chipRow(container, 1)
    const glutesSec = secChips.find(c => c.textContent.trim() === 'Glutes')
    const hamstringsSec = secChips.find(c => c.textContent.trim() === 'Hamstrings')
    expect(isOn(glutesSec)).toBe(true)
    expect(isOn(hamstringsSec)).toBe(true)

    fireEvent.click(hamstringsSec)

    const secChipsAfter = chipRow(container, 1)
    const quadsSec = secChipsAfter.find(c => c.textContent.trim() === 'Quads')
    fireEvent.click(quadsSec)

    const saveBtn = primaryAction(container)
    expect(saveBtn).toBeTruthy()
    fireEvent.click(saveBtn)

    const updated = useStore.getState().S.customEx.find(c => c.id === 'c-test-99')
    expect(updated.tg).toBe('lower-back')
    expect(updated.sm).toEqual(['gluteal', 'quadriceps'])
    expect(updated.bp).toBe('back')
  })

  it('keeps a legacy plain Shoulders custom exercise as stored when only its name changes', async () => {
    const legacy = { id: 'c-legacy-sh', n: 'Old press', bp: 'shoulders', tg: 'Shoulders', sm: ['triceps', 'deltoids'], desc: '', eq: 'custom', custom: true }
    useStore.getState().update(s => { s.customEx = [{ ...legacy, sm: [...legacy.sm] }] })

    await act(async () => {
      root.render(<CustomExForm existing={legacy} onDone={vi.fn()} close={vi.fn()} />)
    })
    const nameInput = within(container).getByRole('textbox', { name: 'Exercise name' })
    typeInto(nameInput, 'Old overhead press')
    fireEvent.click(primaryAction(container))

    const updated = useStore.getState().S.customEx.find(c => c.id === 'c-legacy-sh')
    expect(updated.n).toBe('Old overhead press')
    expect(updated.tg).toBe('Shoulders')
    expect(updated.sm).toEqual(['triceps', 'deltoids'])
  })

  it('saves the picked heads once the lifter changes a legacy Shoulders exercise\'s muscles', async () => {
    const legacy = { id: 'c-legacy-sh2', n: 'Old raise', bp: 'shoulders', tg: 'shoulders', sm: [], desc: '', eq: 'custom', custom: true }
    useStore.getState().update(s => { s.customEx = [{ ...legacy, sm: [] }] })

    await act(async () => {
      root.render(<CustomExForm existing={legacy} onDone={vi.fn()} close={vi.fn()} />)
    })
    const sideDelts = chipRow(container, 0)
      .find(c => c.textContent.trim() === 'Side delts')
    fireEvent.click(sideDelts)
    fireEvent.click(primaryAction(container))

    const updated = useStore.getState().S.customEx.find(c => c.id === 'c-legacy-sh2')
    expect(updated.tg).toBe('side-delts')
  })

  it('keeps a bodypart-only legacy custom exercise reading from its bodypart when saved untouched', async () => {
    const legacy = { id: 'c-legacy-bp', n: 'Old leg machine', bp: 'upper legs', desc: '', eq: 'custom', custom: true }
    useStore.getState().update(s => { s.customEx = [{ ...legacy }] })

    await act(async () => {
      root.render(<CustomExForm existing={legacy} onDone={vi.fn()} close={vi.fn()} />)
    })
    fireEvent.click(primaryAction(container))

    const updated = useStore.getState().S.customEx.find(c => c.id === 'c-legacy-bp')
    expect(updated.tg).toBeUndefined()
    expect(updated.bp).toBe('upper legs')
  })

  it('pre-fills primary muscle from bodypart fallback when editing legacy custom exercise without explicit tg/sm', async () => {
    const legacyEx = {
      id: 'c-legacy-1',
      n: 'Old School Pushup',
      bp: 'chest',
      desc: '',
      eq: 'custom',
      custom: true,
    }

    useStore.getState().update(s => {
      s.customEx = [legacyEx]
    })

    await act(async () => {
      root.render(<CustomExForm existing={legacyEx} onDone={vi.fn()} close={vi.fn()} />)
    })

    const chestPrimary = chipRow(container, 0)
      .find(c => c.textContent.trim() === 'Chest')
    expect(isOn(chestPrimary)).toBe(true)

    const secChips = chipRow(container, 1)
    expect(secChips.some(c => isOn(c))).toBe(false)
  })

  it('pre-fills primary and secondary muscles from multi-muscle bodypart fallback when editing legacy custom exercise', async () => {
    const legacyLegEx = {
      id: 'c-legacy-legs-2',
      n: 'Old Leg Extension',
      bp: 'upper legs',
      desc: 'Machine seat position 3',
      eq: 'custom',
      custom: true,
    }

    useStore.getState().update(s => {
      s.customEx = [legacyLegEx]
    })

    await act(async () => {
      root.render(<CustomExForm existing={legacyLegEx} onDone={vi.fn()} close={vi.fn()} />)
    })

    const quadsPrimary = chipRow(container, 0)
      .find(c => c.textContent.trim() === 'Quads')
    expect(isOn(quadsPrimary)).toBe(true)

    const secChips = chipRow(container, 1)
    const hamstringsSec = secChips.find(c => c.textContent.trim() === 'Hamstrings')
    const glutesSec = secChips.find(c => c.textContent.trim() === 'Glutes')
    expect(isOn(hamstringsSec)).toBe(true)
    expect(isOn(glutesSec)).toBe(true)

    fireEvent.click(glutesSec)

    const secChipsAfter = chipRow(container, 1)
    const adductorsSec = secChipsAfter.find(c => c.textContent.trim() === 'Adductors')
    fireEvent.click(adductorsSec)

    const saveBtn = primaryAction(container)
    fireEvent.click(saveBtn)

    const updated = useStore.getState().S.customEx.find(c => c.id === 'c-legacy-legs-2')
    expect(updated.tg).toBe('quadriceps')
    expect(updated.sm).toEqual(['hamstring', 'adductors'])
    expect(updated.bp).toBe('upper legs')
  })

  it('validates input and prevents saving when name or primary muscle is missing, or name is duplicate', async () => {
    useStore.getState().update(s => {
      s.customEx = [{ id: 'c-existing', n: 'Existing Move', bp: 'chest', tg: 'chest', sm: [], custom: true }]
    })

    await act(async () => {
      root.render(<CustomExForm onDone={vi.fn()} close={vi.fn()} />)
    })

    const nameInput = within(container).getByRole('textbox', { name: 'Exercise name' })
    const saveBtn = within(container).getByRole('button', { name: /Create exercise/ })

    fireEvent.click(saveBtn)
    expect(useUI.getState().toastMsg).toBe('Give it a name')
    expect(useStore.getState().S.customEx.length).toBe(1)

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(nameInput, 'New Move')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
      saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useUI.getState().toastMsg).toBe('Pick a primary muscle')
    expect(useStore.getState().S.customEx.length).toBe(1)

    const bicepsPrimary = chipRow(container, 0)
      .find(c => c.textContent.trim() === 'Biceps')
    await act(async () => {
      bicepsPrimary.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(nameInput, 'Existing Move')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
      saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useUI.getState().toastMsg).toBe('“Existing Move” already exists')
    expect(useStore.getState().S.customEx.length).toBe(1)
  })
})
