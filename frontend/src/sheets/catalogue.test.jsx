// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ExerciseDetail, deleteCustomEx, ExercisePicker, CustomExForm, ExConfig, exConfigSheet } from './catalogue.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'
import { isoOf } from '../lib/dates.js'
import { useUI } from '../store/useUI.js'
import { buttonNamed, leafTexts, pick } from '../test/sheet-host.jsx'
import { fireEvent, within } from '@testing-library/react'
import { allChips, chipNamed, chipRow, chipRows, isOn, primaryAction, typeInto } from '../test/catalogue-queries.js'
import { tilesIn } from '../test/library-queries.js'

// Literal labels a lifter sees, in the order the chips must appear. Independent of the
// taxonomy module so a mistake there cannot move both the sheet and its expectation.
const FILTER_CHIP_LABELS = [
  'Traps', 'Shoulders', 'Front delts', 'Side delts', 'Rear delts', 'Chest', 'Upper back',
  'Lats', 'Serratus', 'Biceps', 'Triceps', 'Forearms', 'Abs', 'Obliques', 'Lower back',
  'Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Hip flexors', 'Calves', 'Shins', 'Cardio',
]
const PICKABLE_CHIP_LABELS = FILTER_CHIP_LABELS.filter(label => label !== 'Shoulders')

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


describe('ExerciseDetail sheet favorite starring', () => {
  const sampleEx = {
    id: '0001',
    n: '3/4 sit-up',
    bp: 'waist',
    tg: 'abs',
    eq: 'body weight',
    img: '0001-2gPfomN.jpg',
    gif: '0001-2gPfomN.gif'
  }

  it('renders title header with interactive star button and toggles favorite state', async () => {
    await act(async () => {
      root.render(<ExerciseDetail ex={sampleEx} close={vi.fn()} />)
    })

    const title = within(container).getByRole('heading', { level: 3 })
    expect(title).toBeTruthy()
    expect(title.textContent).toBe('3/4 sit-up')

    const starBtn = within(container).getByRole('button', { name: /favorites$/ })
    expect(starBtn).toBeTruthy()
    expect(starBtn.getAttribute('aria-label')).toBe('Add to favorites')
    expect(useStore.getState().S.favorites).toEqual([])

    fireEvent.click(starBtn)

    expect(useStore.getState().S.favorites).toEqual(['0001'])
    expect(starBtn.getAttribute('aria-label')).toBe('Remove from favorites')

    fireEvent.click(starBtn)

    expect(useStore.getState().S.favorites).toEqual([])
    expect(starBtn.getAttribute('aria-label')).toBe('Add to favorites')
  })

  it('initializes filled star if exercise is already favorited', async () => {
    useStore.getState().update(s => {
      s.favorites = ['0001', '0002']
    })

    await act(async () => {
      root.render(<ExerciseDetail ex={sampleEx} close={vi.fn()} />)
    })

    const starBtn = within(container).getByRole('button', { name: /favorites$/ })
    expect(starBtn).toBeTruthy()
    expect(starBtn.getAttribute('aria-label')).toBe('Remove from favorites')
  })
})

describe('ExerciseDetail strength line', () => {
  const DAY = 24 * 60 * 60 * 1000
  const isoAgo = ageDays => isoOf(new Date(Date.now() - ageDays * DAY))
  const bench = { id: '0025', n: 'Bench press', bp: 'chest', tg: 'pectorals', eq: 'barbell', img: '', gif: '' }
  const cable = { id: '0001', n: '3/4 sit-up', bp: 'waist', tg: 'abs', eq: 'body weight', img: '', gif: '' }

  it('shows the strength level under Best for a graded lift', async () => {
    useStore.getState().update(s => {
      s.sex = 'male'
      s.bodyweight = [{ d: isoAgo(5), w: 80 }]
      s.workouts = [{ id: 'w1', d: isoAgo(10), start: Date.now() - 10 * DAY, entries: [{ id: '0025', sets: [{ done: true, w: 80, r: 1 }] }], bw: 80 }]
    })

    await act(async () => {
      root.render(<ExerciseDetail ex={bench} close={vi.fn()} />)
    })

    expect(container.textContent).toContain('Strength Intermediate · Peak Intermediate')
  })

  it('shows no strength line for an ungraded exercise', async () => {
    useStore.getState().update(s => {
      s.sex = 'male'
      s.bodyweight = [{ d: isoAgo(5), w: 80 }]
    })

    await act(async () => {
      root.render(<ExerciseDetail ex={cable} close={vi.fn()} />)
    })

    expect(within(container).queryByText(/^Strength /)).toBeNull()
  })
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

describe('ExercisePicker favorites integration', () => {
  it('places Favorites chip first (ahead of Chosen and All) when favorites exist', async () => {
    useStore.getState().update(s => {
      s.favorites = ['0001', '0002']
      s.routines = [
        { id: 'r1', name: 'R1', emoji: '💪', ex: [{ id: '0003', sets: 3, reps: 10 }] }
      ]
    })

    await act(async () => {
      root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />)
    })

    const chipButtons = allChips(container)
    expect(chipButtons.length).toBeGreaterThan(3)

    expect(chipButtons[0].textContent).toContain('Favorites (2)')

    expect(chipButtons[1].textContent).toContain('Chosen (1)')

    expect(chipButtons[2].textContent).toBe('All')
  })

  it('hides Favorites chip when favorites is empty', async () => {
    useStore.getState().update(s => {
      s.favorites = []
      s.routines = [
        { id: 'r1', name: 'R1', emoji: '💪', ex: [{ id: '0003', sets: 3, reps: 10 }] }
      ]
    })

    await act(async () => {
      root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />)
    })

    const chipButtons = allChips(container)
    const chipTexts = chipButtons.map(b => b.textContent)
    expect(chipTexts.some(t => t.includes('Favorites'))).toBe(false)
    expect(chipButtons[0].textContent).toContain('Chosen (1)')
    expect(chipButtons[1].textContent).toBe('All')
  })

  it('renders in-row star buttons on picker rows and toggles favorite without picking exercise', async () => {
    useStore.getState().update(s => {
      s.favorites = ['0001']
    })

    const onPick = vi.fn()
    await act(async () => {
      root.render(<ExercisePicker onPick={onPick} close={vi.fn()} />)
    })

    const exerciseItems = tilesIn(container)
    expect(exerciseItems.length).toBeGreaterThan(2)

    const firstStarBtn = within(exerciseItems[0]).getByRole('button', { name: /favorites$/ })
    expect(firstStarBtn).toBeTruthy()
    expect(firstStarBtn.getAttribute('aria-label')).toBe('Remove from favorites')

    const secondStarBtn = within(exerciseItems[1]).getByRole('button', { name: /favorites$/ })
    expect(secondStarBtn).toBeTruthy()
    expect(secondStarBtn.getAttribute('aria-label')).toBe('Add to favorites')

    fireEvent.click(secondStarBtn)

    expect(useStore.getState().S.favorites).toEqual(['0001', '0002'])
    expect(onPick).not.toHaveBeenCalled()
    expect(secondStarBtn.getAttribute('aria-label')).toBe('Remove from favorites')

    fireEvent.click(firstStarBtn)

    expect(useStore.getState().S.favorites).toEqual(['0002'])
    expect(onPick).not.toHaveBeenCalled()
    expect(firstStarBtn.getAttribute('aria-label')).toBe('Add to favorites')

    fireEvent.click(exerciseItems[0])

    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: '0001', n: '3/4 sit-up' }))
  })

  it('renders an empty state message when favorites filter is active with no matching items', async () => {
    useStore.getState().update(s => {
      s.favorites = ['0001']
    })

    await act(async () => {
      root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />)
    })

    const favChip = allChips(container)
      .find(b => b.textContent.includes('Favorites'))

    fireEvent.click(favChip)

    const starBtn = within(tilesIn(container)[0]).getByRole('button', { name: /favorites$/ })
    expect(starBtn).toBeTruthy()

    fireEvent.click(starBtn)

    const emptyState = within(container).getByText(/No favorites yet/)
    expect(emptyState).toBeTruthy()
    expect(emptyState.textContent).toContain('No favorites yet')
  })

})

describe('ExercisePicker own-first order', () => {
  it('sorts a favorite and a used exercise above "3/4 Sit-Up" when there is no search', async () => {
    useStore.getState().update(s => {
      s.favorites = ['0025']
      s.workouts = [{ id: 'w1', d: '2026-03-01', start: 1, end: 2, entries: [{ id: '0047', sets: [{ w: 0, r: 10, done: true }] }] }]
    })
    await act(async () => { root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />) })

    const names = tilesIn(container).map(el => el.getAttribute('aria-label'))
    const sitUp = names.findIndex(n => n.toLowerCase() === '3/4 sit-up')
    expect(sitUp).toBeGreaterThan(-1)
    expect(names.slice(0, 2)).toEqual(['barbell bench press', 'barbell incline bench press'])
    expect(sitUp).toBe(2)
  })
})

describe('ExercisePicker canonical muscle filtering and search', () => {
  it('renders Favorites, Chosen and All, then muscle filter chips with literal labels in a fixed order', async () => {
    useStore.getState().update(s => {
      s.favorites = ['0001']
      s.routines = [{ id: 'r1', name: 'R1', emoji: '💪', ex: [{ id: '0025', sets: 3, reps: 10 }] }]
    })

    await act(async () => {
      root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />)
    })

    const chips = chipRow(container, 0).map(c => c.textContent.trim())
    expect(chips.slice(0, 3)).toEqual(['Favorites (1)', 'Chosen (1)', 'All'])
    expect(chips.filter(c => FILTER_CHIP_LABELS.includes(c))).toEqual(FILTER_CHIP_LABELS)
  })

  it('surfaces secondary compound movements with inline secondary badges when a muscle filter is selected', async () => {
    await act(async () => {
      root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />)
    })

    const tricepsChip = allChips(container)
      .find(b => b.textContent.trim() === 'Triceps')
    expect(tricepsChip).toBeTruthy()

    fireEvent.click(tricepsChip)

    const items = tilesIn(container)
    const benchItem = items.find(it => it.textContent.toLowerCase().includes('bench press'))
    expect(benchItem).toBeTruthy()

    expect(within(benchItem).getByText(/Secondary: Triceps/)).toBeTruthy()
  })

  it('searches exercises matching primary and secondary muscle names in picker', async () => {
    await act(async () => {
      root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />)
    })

    const searchInput = within(container).getByRole('textbox', { name: 'Search exercises' })
    typeInto(searchInput, 'triceps')

    const items = tilesIn(container)
    expect(items.length).toBeGreaterThan(5)

    const showMore = within(container).getByRole('button', { name: /Show more/ })
    if (showMore) {
      fireEvent.click(showMore)
    }

    const allItems = tilesIn(container)
    const benchItem = allItems.find(it => it.textContent.toLowerCase().includes('bench press'))
    expect(benchItem).toBeTruthy()
    expect(within(benchItem).getByText(/Secondary: Triceps/)).toBeTruthy()
    expect(benchItem.textContent.toLowerCase()).toContain('chest')
  })

  it('filters exercises by Cardio chip and allows equipment filtering within muscle filter', async () => {
    await act(async () => {
      root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />)
    })

    const cardioChip = allChips(container)
      .find(b => b.textContent.trim() === 'Cardio')
    expect(cardioChip).toBeTruthy()

    fireEvent.click(cardioChip)

    let items = tilesIn(container)
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(it => it.textContent.toLowerCase().includes('cardio'))).toBe(true)

    const chestChip = allChips(container)
      .find(b => b.textContent.trim() === 'Chest')
    expect(chestChip).toBeTruthy()

    fireEvent.click(chestChip)

    const eqChips = chipRow(container, 1)
    const dumbbellChip = eqChips.find(b => b.textContent.toLowerCase().includes('dumbbell'))
    expect(dumbbellChip).toBeTruthy()

    fireEvent.click(dumbbellChip)

    items = tilesIn(container)
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(it => it.textContent.toLowerCase().includes('dumbbell'))).toBe(true)
  })

})

describe('ExerciseDetail primary and secondary muscle tags', () => {
  it('displays Primary and Secondary tags for compound movements', async () => {
    const benchEx = {
      id: '0025',
      n: 'barbell bench press',
      bp: 'chest',
      tg: 'pectorals',
      sm: ['shoulders', 'triceps'],
      eq: 'barbell',
    }

    await act(async () => {
      root.render(<ExerciseDetail ex={benchEx} close={vi.fn()} />)
    })
    expect(within(container).getByText('Primary: Chest')).toBeTruthy()

    expect(within(container).getByText('Barbell')).toBeTruthy()

    expect(within(container).getByText('Secondary: Front delts')).toBeTruthy()
    expect(within(container).getByText('Secondary: Triceps')).toBeTruthy()
  })

  it('displays Cardio for cardio exercises without secondary tags', async () => {
    const cardioEx = {
      id: '1160',
      n: 'stationary bike walk',
      bp: 'cardio',
      tg: 'cardiovascular system',
      eq: 'leverage machine',
    }

    await act(async () => {
      root.render(<ExerciseDetail ex={cardioEx} close={vi.fn()} />)
    })
    expect(within(container).getByText('Cardio')).toBeTruthy()
    expect(within(container).queryByText(/^Primary:/)).toBeNull()
    expect(within(container).queryByText(/^Secondary:/)).toBeNull()
  })

  it('displays Primary and Secondary tags for custom exercises', async () => {
    const customEx = {
      id: 'c-101',
      n: 'Hammer Preacher Curl',
      bp: 'upper arms',
      tg: 'biceps',
      sm: ['forearm'],
      eq: 'custom',
      custom: true,
    }

    await act(async () => {
      root.render(<ExerciseDetail ex={customEx} close={vi.fn()} />)
    })
    expect(within(container).getByText('Primary: Biceps')).toBeTruthy()
    expect(within(container).getByText('Secondary: Forearms')).toBeTruthy()
  })

  it('displays Primary and Secondary tags for legacy custom exercises via bodypart fallbacks', async () => {
    const legacyEx = {
      id: 'c-legacy-legs',
      n: 'Old Squat Variation',
      bp: 'upper legs',
      eq: 'custom',
      custom: true,
    }

    await act(async () => {
      root.render(<ExerciseDetail ex={legacyEx} close={vi.fn()} />)
    })
    expect(within(container).getByText('Primary: Quads')).toBeTruthy()
    expect(within(container).getByText('Secondary: Hamstrings')).toBeTruthy()
    expect(within(container).getByText('Secondary: Glutes')).toBeTruthy()
  })

  it('displays only Primary and Equipment tags for pure isolation exercises without secondaries', async () => {
    const isolationEx = {
      id: 'c-curl',
      n: 'dumbbell bicep curl',
      bp: 'upper arms',
      tg: 'biceps',
      sm: [],
      eq: 'dumbbell',
    }

    await act(async () => {
      root.render(<ExerciseDetail ex={isolationEx} close={vi.fn()} />)
    })
    expect(within(container).getByText('Primary: Biceps')).toBeTruthy()
    expect(within(container).getByText('Dumbbell')).toBeTruthy()
    expect(within(container).queryByText(/^Secondary:/)).toBeNull()
  })

  it('displays dedicated Cardio tag and equipment for custom cardio exercises', async () => {
    const customCardio = {
      id: 'c-treadmill',
      n: 'Sprint Intervals',
      bp: 'cardio',
      tg: 'cardio',
      sm: [],
      eq: 'custom',
      custom: true,
    }

    await act(async () => {
      root.render(<ExerciseDetail ex={customCardio} close={vi.fn()} />)
    })
    expect(within(container).getByText('Cardio')).toBeTruthy()
    expect(within(container).queryByText(/^Primary:/)).toBeNull()
    expect(within(container).getByText('Custom')).toBeTruthy()
    expect(within(container).queryByText(/^Secondary:/)).toBeNull()
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
