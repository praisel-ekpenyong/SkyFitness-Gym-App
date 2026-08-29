// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ExerciseDetail, deleteCustomEx, ExercisePicker, CustomExForm, RecapSheet, recapSheet } from './sheets.jsx'
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

})

describe('ExercisePicker canonical muscle filtering and search', () => {
  it('renders all 19 canonical muscle filter chips plus Cardio in anatomical head-to-toe order', async () => {
    useStore.getState().update(s => {
      s.favorites = ['0001']
      s.routines = [{ id: 'r1', name: 'R1', emoji: '💪', ex: [{ id: '0025', sets: 3, reps: 10 }] }]
    })

    await act(async () => {
      root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />)
    })

    const firstChipsRow = container.querySelectorAll('.chips')[0]
    const chips = Array.from(firstChipsRow.querySelectorAll('button.chip')).map(c => c.textContent.trim())
    const expected = [
      'Favorites (1)', 'Chosen (1)', 'All',
      'Traps', 'Shoulders', 'Chest', 'Upper back', 'Lats', 'Serratus',
      'Biceps', 'Triceps', 'Forearms', 'Abs', 'Obliques', 'Lower back',
      'Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Hip flexors',
      'Calves', 'Shins', 'Cardio',
    ]
    expect(chips).toEqual(expected)
  })

  it('surfaces secondary compound movements with inline secondary badges when a muscle filter is selected', async () => {
    await act(async () => {
      root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />)
    })

    // Filter by Triceps
    const tricepsChip = Array.from(container.querySelectorAll('.chips button.chip'))
      .find(b => b.textContent.trim() === 'Triceps')
    expect(tricepsChip).toBeTruthy()

    await act(async () => {
      tricepsChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const items = Array.from(container.querySelectorAll('.list .item'))
    // Find bench press (which has chest as primary and triceps as secondary)
    const benchItem = items.find(it => it.textContent.toLowerCase().includes('bench press'))
    expect(benchItem).toBeTruthy()

    // Bench press should display the secondary badge: "Secondary: Triceps"
    const secondaryBadge = benchItem.querySelector('.ss .tag')
    expect(secondaryBadge).toBeTruthy()
    expect(secondaryBadge.textContent).toContain('Secondary: Triceps')
  })

  it('searches exercises matching primary and secondary muscle names in picker', async () => {
    await act(async () => {
      root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />)
    })

    const searchInput = container.querySelector('input.input')
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(searchInput, 'triceps')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const items = Array.from(container.querySelectorAll('.list .item'))
    expect(items.length).toBeGreaterThan(5)

    const benchItem = items.find(it => it.textContent.toLowerCase().includes('bench press'))
    expect(benchItem).toBeTruthy()
    expect(benchItem.querySelector('.ss .tag')?.textContent).toContain('Secondary: Triceps')
    expect(benchItem.querySelector('.ss')?.textContent.toLowerCase()).toContain('chest')
  })

  it('filters exercises by Cardio chip and allows equipment filtering within muscle filter', async () => {
    await act(async () => {
      root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />)
    })

    // Filter by Cardio
    const cardioChip = Array.from(container.querySelectorAll('.chips button.chip'))
      .find(b => b.textContent.trim() === 'Cardio')
    expect(cardioChip).toBeTruthy()

    await act(async () => {
      cardioChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    let items = Array.from(container.querySelectorAll('.list .item')).slice(1)
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(it => it.textContent.toLowerCase().includes('cardio'))).toBe(true)

    // Filter by Chest
    const chestChip = Array.from(container.querySelectorAll('.chips button.chip'))
      .find(b => b.textContent.trim() === 'Chest')
    expect(chestChip).toBeTruthy()

    await act(async () => {
      chestChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Filter by dumbbell equipment
    const eqChips = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip'))
    const dumbbellChip = eqChips.find(b => b.textContent.toLowerCase().includes('dumbbell'))
    expect(dumbbellChip).toBeTruthy()

    await act(async () => {
      dumbbellChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    items = Array.from(container.querySelectorAll('.list .item')).slice(1)
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(it => it.textContent.toLowerCase().includes('dumbbell'))).toBe(true)
  })

})

describe('ExerciseDetail primary and secondary muscle tags', () => {
  it('displays Primary and Secondary tags for compound movements', async () => {
    // 0025: Barbell bench press (tg: 'pectorals', sm: ['shoulders', 'triceps'], eq: 'barbell')
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

    const tags = Array.from(container.querySelectorAll('.row .tag'))
    const tagTexts = tags.map(t => t.textContent.trim())

    // Primary tag should have class 'tag acc' with 'Primary: Chest'
    const primaryTag = tags.find(t => t.classList.contains('acc'))
    expect(primaryTag).toBeTruthy()
    expect(primaryTag.textContent).toContain('Primary: Chest')

    // Equipment tag
    expect(tagTexts).toContain('barbell')

    // Secondary tags
    expect(tagTexts).toContain('Secondary: Shoulders')
    expect(tagTexts).toContain('Secondary: Triceps')
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

    const tags = Array.from(container.querySelectorAll('.row .tag'))
    const tagTexts = tags.map(t => t.textContent.trim())

    const primaryTag = tags.find(t => t.classList.contains('acc'))
    expect(primaryTag).toBeTruthy()
    expect(primaryTag.textContent).toContain('Cardio')
    expect(primaryTag.textContent).not.toContain('Primary: Cardio')
    expect(tagTexts.some(t => t.startsWith('Secondary:'))).toBe(false)
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

    const tags = Array.from(container.querySelectorAll('.row .tag'))
    const tagTexts = tags.map(t => t.textContent.trim())

    const primaryTag = tags.find(t => t.classList.contains('acc'))
    expect(primaryTag).toBeTruthy()
    expect(primaryTag.textContent).toContain('Primary: Biceps')
    expect(tagTexts).toContain('Secondary: Forearms')
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

    const tags = Array.from(container.querySelectorAll('.row .tag'))
    const tagTexts = tags.map(t => t.textContent.trim())

    const primaryTag = tags.find(t => t.classList.contains('acc'))
    expect(primaryTag).toBeTruthy()
    expect(primaryTag.textContent).toContain('Primary: Quads')
    expect(tagTexts).toContain('Secondary: Hamstrings')
    expect(tagTexts).toContain('Secondary: Glutes')
  })

  it('displays only Primary and Equipment tags for pure isolation exercises without secondaries', async () => {
    const isolationEx = {
      id: '0031',
      n: 'dumbbell bicep curl',
      bp: 'upper arms',
      tg: 'biceps',
      sm: [],
      eq: 'dumbbell',
    }

    await act(async () => {
      root.render(<ExerciseDetail ex={isolationEx} close={vi.fn()} />)
    })

    const tags = Array.from(container.querySelectorAll('.row .tag'))
    const tagTexts = tags.map(t => t.textContent.trim())

    const primaryTag = tags.find(t => t.classList.contains('acc'))
    expect(primaryTag).toBeTruthy()
    expect(primaryTag.textContent).toContain('Primary: Biceps')
    expect(tagTexts).toContain('dumbbell')
    expect(tagTexts.some(t => t.startsWith('Secondary:'))).toBe(false)
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

    const tags = Array.from(container.querySelectorAll('.row .tag'))
    const tagTexts = tags.map(t => t.textContent.trim())

    const primaryTag = tags.find(t => t.classList.contains('acc'))
    expect(primaryTag).toBeTruthy()
    expect(primaryTag.textContent).toContain('Cardio')
    expect(primaryTag.textContent).not.toContain('Primary:')
    expect(tagTexts).toContain('custom')
    expect(tagTexts.some(t => t.startsWith('Secondary:'))).toBe(false)
  })
})

describe('CustomExForm canonical muscle selection and editing', () => {
  it('renders all 19 canonical muscles plus Cardio in anatomical order for primary muscle selection and gates secondaries until primary is chosen', async () => {
    await act(async () => {
      root.render(<CustomExForm onDone={vi.fn()} close={vi.fn()} />)
    })

    const title = container.querySelector('h3')
    expect(title.textContent).toBe('Create your own exercise')

    // Initially only 1 row of chips (primary), no secondary chips row
    expect(container.querySelectorAll('.chips').length).toBe(1)

    const primaryChipContainer = container.querySelectorAll('.chips')[0]
    const primaryChips = Array.from(primaryChipContainer.querySelectorAll('button.chip')).map(c => c.textContent.trim())
    const expected = [
      'Traps', 'Shoulders', 'Chest', 'Upper back', 'Lats', 'Serratus',
      'Biceps', 'Triceps', 'Forearms', 'Abs', 'Obliques', 'Lower back',
      'Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Hip flexors',
      'Calves', 'Shins', 'Cardio',
    ]
    expect(primaryChips).toEqual(expected)
  })

  it('allows selecting a primary muscle and multiple secondary muscles, deriving bp', async () => {
    const onDone = vi.fn()
    const close = vi.fn()

    await act(async () => {
      root.render(<CustomExForm onDone={onDone} close={close} />)
    })

    // Name
    const nameInput = container.querySelector('input.input')
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(nameInput, 'Incline Hammer Curl')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Select Primary muscle: Biceps
    const primaryChips = Array.from(container.querySelectorAll('.chips')[0].querySelectorAll('button.chip'))
    const bicepsPrimary = primaryChips.find(c => c.textContent.trim() === 'Biceps')
    expect(bicepsPrimary).toBeTruthy()

    await act(async () => {
      bicepsPrimary.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(bicepsPrimary.classList.contains('on')).toBe(true)

    // Secondary chips row should now exist and NOT contain Biceps
    const chipRows = container.querySelectorAll('.chips')
    expect(chipRows.length).toBe(2)
    const secondaryChips = Array.from(chipRows[1].querySelectorAll('button.chip'))
    expect(secondaryChips.map(c => c.textContent.trim())).not.toContain('Biceps')
    expect(secondaryChips.length).toBe(18)

    // Select Secondary muscles: Forearms and Upper back
    const forearmsSec = secondaryChips.find(c => c.textContent.trim() === 'Forearms')
    expect(forearmsSec).toBeTruthy()
    await act(async () => {
      forearmsSec.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const secondaryChipsAfter = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip'))
    const upperBackSec = secondaryChipsAfter.find(c => c.textContent.trim() === 'Upper back')
    expect(upperBackSec).toBeTruthy()
    await act(async () => {
      upperBackSec.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Description
    const descInput = container.querySelector('textarea.input')
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      nativeSetter.call(descInput, 'Strict form, palms facing each other')
      descInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Save
    const saveBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Create exercise'))
    expect(saveBtn).toBeTruthy()

    await act(async () => {
      saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Assert custom exercise is created in store
    const state = useStore.getState().S
    expect(state.customEx.length).toBe(1)
    const created = state.customEx[0]
    expect(created.n).toBe('Incline Hammer Curl')
    expect(created.tg).toBe('biceps')
    expect(created.sm).toEqual(['forearm', 'upper-back'])
    expect(created.bp).toBe('upper arms') // derived from biceps
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

    const primaryChips = () => Array.from(container.querySelectorAll('.chips')[0].querySelectorAll('button.chip'))
    const chestPrimary = primaryChips().find(c => c.textContent.trim() === 'Chest')
    await act(async () => {
      chestPrimary.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Select secondary: Shoulders and Triceps
    let secondaryChips = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip'))
    const shouldersSec = secondaryChips.find(c => c.textContent.trim() === 'Shoulders')
    await act(async () => {
      shouldersSec.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const secondaryChipsAfter = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip'))
    const tricepsSec = secondaryChipsAfter.find(c => c.textContent.trim() === 'Triceps')
    await act(async () => {
      tricepsSec.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Now change primary to Shoulders
    const shouldersPrimary = primaryChips().find(c => c.textContent.trim() === 'Shoulders')
    await act(async () => {
      shouldersPrimary.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Secondary row should now have Triceps selected, but not Shoulders
    secondaryChips = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip'))
    const tricepsSecAfter = secondaryChips.find(c => c.textContent.trim() === 'Triceps')
    expect(tricepsSecAfter?.classList.contains('on')).toBe(true)
    expect(secondaryChips.some(c => c.textContent.trim() === 'Shoulders')).toBe(false)
  })

  it('selecting Cardio hides secondary muscle chips and clears existing secondaries', async () => {
    const onDone = vi.fn()
    const close = vi.fn()

    await act(async () => {
      root.render(<CustomExForm onDone={onDone} close={close} />)
    })

    const primaryChips = () => Array.from(container.querySelectorAll('.chips')[0].querySelectorAll('button.chip'))
    const chestPrimary = primaryChips().find(c => c.textContent.trim() === 'Chest')
    await act(async () => {
      chestPrimary.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Select secondary Triceps
    const tricepsSec = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip')).find(c => c.textContent.trim() === 'Triceps')
    await act(async () => {
      tricepsSec.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Now select Cardio as primary
    const cardioPrimary = primaryChips().find(c => c.textContent.trim() === 'Cardio')
    await act(async () => {
      cardioPrimary.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Only 1 chips row should exist (primary), no secondary chips
    expect(container.querySelectorAll('.chips').length).toBe(1)
    // Cardio helper text is visible
    expect(container.textContent).toContain('Cardio exercises log time + speed')

    // Name and save
    const nameInput = container.querySelector('input.input')
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(nameInput, 'Rowing Machine Sprint')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const saveBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Create exercise'))
    await act(async () => {
      saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

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

    expect(container.querySelector('h3')?.textContent).toBe('Edit custom exercise')
    expect(container.querySelector('input.input')?.value).toBe('My Custom Deadlift')
    expect(container.querySelector('textarea.input')?.value).toBe('Neutral grip handles')

    // Primary 'Lower back' should be active
    const lowerBackPrimary = Array.from(container.querySelectorAll('.chips')[0].querySelectorAll('button.chip'))
      .find(c => c.textContent.trim() === 'Lower back')
    expect(lowerBackPrimary?.classList.contains('on')).toBe(true)

    // Secondary 'Glutes' and 'Hamstrings' should be active
    const secChips = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip'))
    const glutesSec = secChips.find(c => c.textContent.trim() === 'Glutes')
    const hamstringsSec = secChips.find(c => c.textContent.trim() === 'Hamstrings')
    expect(glutesSec?.classList.contains('on')).toBe(true)
    expect(hamstringsSec?.classList.contains('on')).toBe(true)

    // Toggle off Hamstrings
    await act(async () => {
      hamstringsSec.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Toggle on Quads
    const secChipsAfter = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip'))
    const quadsSec = secChipsAfter.find(c => c.textContent.trim() === 'Quads')
    await act(async () => {
      quadsSec.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const saveBtn = container.querySelector('button.btn.primary')
    expect(saveBtn).toBeTruthy()
    await act(async () => {
      saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const updated = useStore.getState().S.customEx.find(c => c.id === 'c-test-99')
    expect(updated.tg).toBe('lower-back')
    expect(updated.sm).toEqual(['gluteal', 'quadriceps'])
    expect(updated.bp).toBe('back')
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

    // Chest primary chip should be selected via bodypart fallback
    const chestPrimary = Array.from(container.querySelectorAll('.chips')[0].querySelectorAll('button.chip'))
      .find(c => c.textContent.trim() === 'Chest')
    expect(chestPrimary?.classList.contains('on')).toBe(true)

    // Secondary chips should all be unselected
    const secChips = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip'))
    expect(secChips.some(c => c.classList.contains('on'))).toBe(false)
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

    // Primary 'Quads' should be selected via bodypart fallback
    const quadsPrimary = Array.from(container.querySelectorAll('.chips')[0].querySelectorAll('button.chip'))
      .find(c => c.textContent.trim() === 'Quads')
    expect(quadsPrimary?.classList.contains('on')).toBe(true)

    // Secondary 'Hamstrings' and 'Glutes' should be active via bodypart fallback
    const secChips = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip'))
    const hamstringsSec = secChips.find(c => c.textContent.trim() === 'Hamstrings')
    const glutesSec = secChips.find(c => c.textContent.trim() === 'Glutes')
    expect(hamstringsSec?.classList.contains('on')).toBe(true)
    expect(glutesSec?.classList.contains('on')).toBe(true)

    // Modify secondaries: deselect Glutes, select Adductors
    await act(async () => {
      glutesSec.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const secChipsAfter = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip'))
    const adductorsSec = secChipsAfter.find(c => c.textContent.trim() === 'Adductors')
    await act(async () => {
      adductorsSec.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const saveBtn = container.querySelector('button.btn.primary')
    await act(async () => {
      saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

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

    const nameInput = container.querySelector('input.input')
    const saveBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Create exercise'))

    // 1. Missing name
    await act(async () => {
      saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useUI.getState().toastMsg).toBe('Give it a name')
    expect(useStore.getState().S.customEx.length).toBe(1)

    // 2. Missing primary muscle
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(nameInput, 'New Move')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
      saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useUI.getState().toastMsg).toBe('Pick a primary muscle')
    expect(useStore.getState().S.customEx.length).toBe(1)

    // 3. Duplicate name
    const bicepsPrimary = Array.from(container.querySelectorAll('.chips')[0].querySelectorAll('button.chip'))
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

describe('RecapSheet', () => {
  it('renders headline numbers, deltas, and records for a month', async () => {
    useStore.getState().update(s => {
      s.workouts = [
        {
          id: 'w-jan',
          d: '2026-01-15',
          start: 1000,
          end: 1000 + 40 * 60000,
          entries: [{ id: '0025', sets: [{ w: 100, r: 5, done: true }] }],
          prs: ['0025'],
        },
        {
          id: 'w-feb',
          d: '2026-02-15',
          start: 2000,
          end: 2000 + 50 * 60000,
          entries: [{ id: '0025', sets: [{ w: 110, r: 5, done: true }] }],
          prs: ['0025'],
        },
      ]
    })

    const close = vi.fn()
    await act(async () => {
      root.render(<RecapSheet start="2026-02-01" close={close} />)
    })

    // Header with month title
    const header = container.querySelector('h3')
    expect(header?.textContent).toContain('February 2026')

    // Headline numbers
    const headlineSection = container.querySelectorAll('.sect-b')[0]
    const rows = Array.from(headlineSection.querySelectorAll('.lrow'))
    expect(rows.length).toBe(4)
    expect(rows[0].textContent).toContain('Workouts')
    expect(rows[0].textContent).toContain('1')
    expect(rows[1].textContent).toContain('Time trained')
    expect(rows[1].textContent).toContain('50 min')
    expect(rows[2].textContent).toContain('Volume')
    expect(rows[2].textContent).toContain('550 kg')
    expect(rows[3].textContent).toContain('Sets')
    expect(rows[3].textContent).toContain('1')

    // Records section should list the PR and Estimated 1RM record
    expect(container.textContent).toContain('Personal records')
    expect(container.textContent).toContain('Estimated 1RM records')

    // Month navigation: click previous month
    const prevBtn = container.querySelector('button[aria-label="Previous month"]')
    expect(prevBtn).toBeTruthy()
    await act(async () => {
      prevBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('h3')?.textContent).toContain('January 2026')

    // View calendar button
    const calBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('View calendar'))
    expect(calBtn).toBeTruthy()
    await act(async () => {
      calBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(close).toHaveBeenCalledTimes(1)
    expect(useUI.getState().sheets.length).toBe(1)
  })

  it('renders empty month message when no workouts exist', async () => {
    await act(async () => {
      root.render(<RecapSheet start="2026-05-01" close={vi.fn()} />)
    })

    expect(container.textContent).toContain('No workouts in May 2026')
  })
})



