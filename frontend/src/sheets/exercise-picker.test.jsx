// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ExercisePicker } from './exercise-picker.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'
import { useUI } from '../store/useUI.js'
import { fireEvent, within } from '@testing-library/react'
import { allChips, chipRow, typeInto, FILTER_CHIP_LABELS } from '../test/catalogue-queries.js'
import { tilesIn } from '../test/library-queries.js'

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
