// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ExerciseDetail, deleteCustomEx, ExercisePicker } from './sheets.jsx'
import { useStore, DEF } from './store/useStore.js'
import { useUI } from './store/useUI.js'

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

    // Header title and star button
    const title = container.querySelector('h3')
    expect(title).toBeTruthy()
    expect(title.textContent).toBe('3/4 sit-up')

    const starBtn = container.querySelector('.row.between button.iconbtn')
    expect(starBtn).toBeTruthy()
    expect(starBtn.getAttribute('aria-label')).toBe('Add to favorites')
    expect(starBtn.classList.contains('on-ss')).toBe(false)
    expect(starBtn.querySelector('svg.icn')).toBeTruthy()
    expect(starBtn.querySelector('path').getAttribute('fill')).toBeNull()
    expect(useStore.getState().S.favorites).toEqual([])

    // Click star button to add to favorites
    await act(async () => {
      starBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(useStore.getState().S.favorites).toEqual(['0001'])
    expect(starBtn.getAttribute('aria-label')).toBe('Remove from favorites')
    expect(starBtn.classList.contains('on-ss')).toBe(true)
    expect(starBtn.querySelector('svg.icn path').getAttribute('fill')).toBe('currentColor')

    // Click star button again to remove from favorites
    await act(async () => {
      starBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(useStore.getState().S.favorites).toEqual([])
    expect(starBtn.getAttribute('aria-label')).toBe('Add to favorites')
    expect(starBtn.classList.contains('on-ss')).toBe(false)
    expect(starBtn.querySelector('svg.icn path').getAttribute('fill')).toBeNull()
  })

  it('initializes filled star if exercise is already favorited', async () => {
    useStore.getState().update(s => {
      s.favorites = ['0001', '0002']
    })

    await act(async () => {
      root.render(<ExerciseDetail ex={sampleEx} close={vi.fn()} />)
    })

    const starBtn = container.querySelector('.row.between button.iconbtn')
    expect(starBtn).toBeTruthy()
    expect(starBtn.getAttribute('aria-label')).toBe('Remove from favorites')
    expect(starBtn.classList.contains('on-ss')).toBe(true)
    expect(starBtn.querySelector('svg.icn path').getAttribute('fill')).toBe('currentColor')
  })
})

describe('deleteCustomEx cascading deletion', () => {
  it('removes custom exercise ID from favorites, customEx, routines, and exWeights', async () => {
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

    // A confirm dialog should have opened in useUI sheets
    const sheets = useUI.getState().sheets
    expect(sheets.length).toBe(1)
    expect(sheets[0].kind).toBe('center')

    // Mount the confirm sheet dialog to trigger onConfirm
    const renderConfirm = sheets[0].render
    let confirmContainer = document.createElement('div')
    document.body.appendChild(confirmContainer)
    const confirmRoot = createRoot(confirmContainer)

    await act(async () => {
      confirmRoot.render(renderConfirm(() => useUI.getState().closeSheet(sheets[0].id)))
    })

    const confirmBtn = confirmContainer.querySelector('button.btn.danger')
    expect(confirmBtn).toBeTruthy()
    expect(confirmBtn.textContent).toBe('Delete')

    await act(async () => {
      confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Verify state after deletion
    const state = useStore.getState().S
    expect(state.customEx.find(e => e.id === 'c123')).toBeUndefined()
    expect(state.favorites).toEqual(['0001', '0002'])
    expect(state.exWeights['c123']).toBeUndefined()
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

    const chipButtons = Array.from(container.querySelectorAll('.chips button.chip'))
    expect(chipButtons.length).toBeGreaterThan(3)

    // 1st: Favorites (2)
    expect(chipButtons[0].textContent).toContain('Favorites (2)')
    expect(chipButtons[0].querySelector('svg')).toBeTruthy()

    // 2nd: Chosen (1)
    expect(chipButtons[1].textContent).toContain('Chosen (1)')
    expect(chipButtons[1].querySelector('svg')).toBeTruthy()

    // 3rd: All
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

    const chipButtons = Array.from(container.querySelectorAll('.chips button.chip'))
    const chipTexts = chipButtons.map(b => b.textContent)
    expect(chipTexts.some(t => t.includes('Favorites'))).toBe(false)
    expect(chipButtons[0].textContent).toContain('Chosen (1)')
    expect(chipButtons[1].textContent).toBe('All')
  })

  it('filters list to only favorited exercises when Favorites chip is selected', async () => {
    useStore.getState().update(s => {
      s.favorites = ['0001', '0002']
    })

    await act(async () => {
      root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />)
    })

    const favChip = Array.from(container.querySelectorAll('.chips button.chip'))
      .find(b => b.textContent.includes('Favorites'))
    expect(favChip).toBeTruthy()

    await act(async () => {
      favChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Assert that the list contains only 2 exercises corresponding to favorites
    const itemTitles = Array.from(container.querySelectorAll('.list .item .tt')).slice(1).map(el => el.textContent)
    expect(itemTitles).toEqual(['3/4 sit-up', '45° side bend'])
  })

  it('renders in-row star buttons on picker rows and toggles favorite without picking exercise', async () => {
    useStore.getState().update(s => {
      s.favorites = ['0001']
    })

    const onPick = vi.fn()
    await act(async () => {
      root.render(<ExercisePicker onPick={onPick} close={vi.fn()} />)
    })

    // Items in the list (skipping the "Create your own exercise" item at index 0)
    const exerciseItems = Array.from(container.querySelectorAll('.list .item')).slice(1)
    expect(exerciseItems.length).toBeGreaterThan(2)

    // First exercise (0001 - 3/4 sit-up) should be starred
    const firstStarBtn = exerciseItems[0].querySelector('button.iconbtn')
    expect(firstStarBtn).toBeTruthy()
    expect(firstStarBtn.getAttribute('aria-label')).toBe('Remove from favorites')
    expect(firstStarBtn.classList.contains('on-ss')).toBe(true)

    // Second exercise (0002 - 45° side bend) should NOT be starred
    const secondStarBtn = exerciseItems[1].querySelector('button.iconbtn')
    expect(secondStarBtn).toBeTruthy()
    expect(secondStarBtn.getAttribute('aria-label')).toBe('Add to favorites')
    expect(secondStarBtn.classList.contains('on-ss')).toBe(false)

    // Click star button on second exercise to add it to favorites
    await act(async () => {
      secondStarBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(useStore.getState().S.favorites).toEqual(['0001', '0002'])
    expect(onPick).not.toHaveBeenCalled()
    expect(secondStarBtn.getAttribute('aria-label')).toBe('Remove from favorites')
    expect(secondStarBtn.classList.contains('on-ss')).toBe(true)

    // Click star button on first exercise to remove it from favorites
    await act(async () => {
      firstStarBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(useStore.getState().S.favorites).toEqual(['0002'])
    expect(onPick).not.toHaveBeenCalled()
    expect(firstStarBtn.getAttribute('aria-label')).toBe('Add to favorites')
    expect(firstStarBtn.classList.contains('on-ss')).toBe(false)

    // Clicking the item row outside the star button triggers onPick
    await act(async () => {
      exerciseItems[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

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

    const favChip = Array.from(container.querySelectorAll('.chips button.chip'))
      .find(b => b.textContent.includes('Favorites'))

    await act(async () => {
      favChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Now unstar 0001 so favorites becomes empty while activeBp is favorites
    const starBtn = container.querySelector('.list .item button.iconbtn')
    expect(starBtn).toBeTruthy()

    await act(async () => {
      starBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const emptyState = container.querySelector('.list .empty')
    expect(emptyState).toBeTruthy()
    expect(emptyState.textContent).toContain('No favorites yet')
  })

  it('allows searching and equipment filtering within favorites', async () => {
    // 0001 is 'body weight', 0025 is 'barbell'
    useStore.getState().update(s => {
      s.favorites = ['0001', '0025']
    })

    await act(async () => {
      root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />)
    })

    const favChip = Array.from(container.querySelectorAll('.chips button.chip'))
      .find(b => b.textContent.includes('Favorites'))
    expect(favChip).toBeTruthy()

    await act(async () => {
      favChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Both favorites initially visible (skipping Create your own exercise)
    let items = Array.from(container.querySelectorAll('.list .item .tt')).slice(1).map(el => el.textContent)
    expect(items).toEqual(['3/4 sit-up', 'barbell bench press'])

    // Filter by barbell equipment
    const eqChips = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip'))
    const barbellChip = eqChips.find(b => b.textContent.toLowerCase().includes('barbell'))
    expect(barbellChip).toBeTruthy()

    await act(async () => {
      barbellChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    items = Array.from(container.querySelectorAll('.list .item .tt')).slice(1).map(el => el.textContent)
    expect(items).toEqual(['barbell bench press'])

    // Search query within favorites
    const searchInput = container.querySelector('.search input')
    await act(async () => {
      // Clear equipment first by clicking 'Any equipment'
      const anyEqChip = eqChips.find(b => b.textContent.toLowerCase().includes('any equipment'))
      anyEqChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeInputValueSetter.call(searchInput, 'sit-up')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    items = Array.from(container.querySelectorAll('.list .item .tt')).slice(1).map(el => el.textContent)
    expect(items).toEqual(['3/4 sit-up'])

    // Click the clear button on the SearchField
    const clearBtn = container.querySelector('.searchf button.clear')
    expect(clearBtn).toBeTruthy()
    await act(async () => {
      clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(searchInput.value).toBe('')
    items = Array.from(container.querySelectorAll('.list .item .tt')).slice(1).map(el => el.textContent)
    expect(items).toEqual(['3/4 sit-up', 'barbell bench press'])
  })
})

