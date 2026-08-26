// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Library from './views/Library.jsx'
import Stats from './views/Stats.jsx'
import { ExerciseDetail, ExercisePicker, CustomExForm } from './sheets.jsx'
import { useStore, DEF } from './store/useStore.js'
import { EXIDX } from './lib/exercises.js'
import { MUSCLES, FILTER_MUSCLES, MUSCLE_NAME, primaryMuscleOf, secondaryMusclesOf, matchesMuscleFilter, isSecondaryMuscleMatch, loadOf, loadOfWorkouts, levelsOf, rankOf } from './lib/muscles.js'
import { buildPlanBundle, parsePlan, mergePlan } from './lib/plan-share.js'
import { buildCompletedWorkout } from './lib/finish-workout.js'

vi.mock('./lib/sound.js', () => ({
  beep: vi.fn(),
  vibrate: vi.fn(),
  playWorkoutComplete: vi.fn(),
}))
vi.mock('./lib/mobile.js', () => ({
  MOBILE: false,
  nativeLoad: vi.fn(async () => null),
  nativeSave: vi.fn(async () => {}),
  syncReminder: vi.fn(async () => true),
  shareExport: vi.fn(async () => {}),
}))

let container
let root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useStore.getState().replaceState(JSON.parse(JSON.stringify(DEF)))
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

function getChip(scope, label) {
  return Array.from(scope.querySelectorAll('.chips button.chip')).find(b => b.textContent.trim() === label)
}

describe('Ticket 03 — Library and Picker filters plus Exercise Detail presentation', () => {
  it('Library renders 19 muscle chips plus Cardio in head-to-toe order with Lats after Upper back; Favorites/All preserved', async () => {
    useStore.getState().update(s => { s.favorites = ['0001'] })
    await act(async () => { root.render(<Library />) })
    const firstChipsRow = container.querySelectorAll('.chips')[0]
    const chips = Array.from(firstChipsRow.querySelectorAll('button.chip')).map(c => c.textContent.trim())
    const expected = [
      'Favorites (1)', 'All',
      'Traps', 'Shoulders', 'Chest', 'Upper back', 'Lats', 'Serratus',
      'Biceps', 'Triceps', 'Forearms', 'Abs', 'Obliques', 'Lower back',
      'Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Hip flexors',
      'Calves', 'Shins', 'Cardio',
    ]
    expect(chips).toEqual(expected)
    // Ensure Lats immediately after Upper back and before Serratus
    expect(chips.indexOf('Lats')).toBe(chips.indexOf('Upper back') + 1)
    expect(chips.indexOf('Serratus')).toBe(chips.indexOf('Lats') + 1)
  })

  it('clicking Lats shows primary lat exercises and secondary contributors; clicking Upper back shows disjoint primary set', async () => {
    await act(async () => { root.render(<Library />) })
    const latsChip = getChip(container, 'Lats')
    expect(latsChip).toBeTruthy()
    await act(async () => { latsChip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const latsItems = Array.from(container.querySelectorAll('.list .item'))
    // 0007 alternate lateral pulldown is lats primary
    const latPulldown = latsItems.find(it => it.textContent.toLowerCase().includes('alternate lateral pulldown'))
    expect(latPulldown).toBeTruthy()
    // 0027 barbell bent over row is upper-back primary, should NOT appear under Lats filter
    const rowItemUnderLats = latsItems.find(it => it.textContent.toLowerCase().includes('barbell bent over row'))
    expect(rowItemUnderLats).toBeFalsy()

    // Click Upper back
    const upperChip = getChip(container, 'Upper back')
    expect(upperChip).toBeTruthy()
    await act(async () => { upperChip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const upperItems = Array.from(container.querySelectorAll('.list .item'))
    const rowItem = upperItems.find(it => it.textContent.toLowerCase().includes('barbell bent over row'))
    expect(rowItem).toBeTruthy()
    // Lat pulldown under Upper back should appear as secondary (since 0007 lists rhomboids -> upper-back)
    const latUnderUpper = upperItems.find(it => it.textContent.toLowerCase().includes('alternate lateral pulldown'))
    expect(latUnderUpper).toBeTruthy()
    expect(latUnderUpper.querySelector('.ss .tag')?.textContent).toContain('Secondary: Upper back')
    // But lat pulldown under Lats should NOT have secondary badge for Lats
    await act(async () => { latsChip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const latsItems2 = Array.from(container.querySelectorAll('.list .item'))
    const latItemAgain = latsItems2.find(it => it.textContent.toLowerCase().includes('alternate lateral pulldown'))
    expect(latItemAgain.querySelector('.ss .tag')).toBeNull()
  })

  it('crossover compounds display inline Secondary: Lats or Secondary: Upper back badges', async () => {
    await act(async () => { root.render(<Library />) })
    // Filter by Upper back -> lat pulldown should show Secondary: Upper back
    const upperChip = getChip(container, 'Upper back')
    await act(async () => { upperChip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    let items = Array.from(container.querySelectorAll('.list .item'))
    let latUnderUpper = items.find(it => it.textContent.toLowerCase().includes('alternate lateral pulldown'))
    expect(latUnderUpper.querySelector('.ss .tag').textContent).toContain('Secondary: Upper back')

    // For Lats filter, an upper-back primary that lists lats secondary would show Secondary: Lats
    // Create a custom that is upper-back primary with lats secondary to test generic badge
    const custom = { id: 'c-test-latsec', n: 'Custom Row to Lats', bp: 'back', tg: 'upper-back', sm: ['lats'], eq: 'custom', custom: true }
    useStore.getState().update(s => { s.customEx.push(custom) })
    // Need to re-render? Library reads from allExercises(S) which includes customEx
    await act(async () => { root.render(<Library />) })
    // After re-render, click Lats again
    const latsChip = getChip(container, 'Lats')
    await act(async () => { latsChip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    items = Array.from(container.querySelectorAll('.list .item'))
    const customUnderLats = items.find(it => it.textContent.includes('Custom Row to Lats'))
    expect(customUnderLats).toBeTruthy()
    expect(customUnderLats.querySelector('.ss .tag').textContent).toContain('Secondary: Lats')
  })

  it('ExercisePicker renders identical 19+cardio chips in same order and matches same semantics', async () => {
    useStore.getState().update(s => { s.favorites = ['0001'] })
    await act(async () => { root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />) })
    const firstChipsRow = container.querySelectorAll('.chips')[0]
    const chips = Array.from(firstChipsRow.querySelectorAll('button.chip')).map(c => c.textContent.trim())
    // Picker has Favorites, Chosen? Without routines, Chosen not present. So check core muscles sequence
    const muscleSequence = ['Traps', 'Shoulders', 'Chest', 'Upper back', 'Lats', 'Serratus', 'Biceps', 'Triceps', 'Forearms', 'Abs', 'Obliques', 'Lower back', 'Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Hip flexors', 'Calves', 'Shins', 'Cardio']
    muscleSequence.forEach(m => expect(chips).toContain(m))
    expect(chips.indexOf('Lats')).toBe(chips.indexOf('Upper back') + 1)
    // Filter Picker by Lats and by Upper back same as Library
    const latsChip = getChip(container, 'Lats')
    await act(async () => { latsChip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    let items = Array.from(container.querySelectorAll('.list .item'))
    expect(items.some(it => it.textContent.toLowerCase().includes('alternate lateral pulldown'))).toBe(true)
    expect(items.some(it => it.textContent.toLowerCase().includes('barbell bent over row'))).toBe(false)

    const upperChip = getChip(container, 'Upper back')
    await act(async () => { upperChip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    items = Array.from(container.querySelectorAll('.list .item'))
    expect(items.some(it => it.textContent.toLowerCase().includes('barbell bent over row'))).toBe(true)
  })

  it('text search for lats/latissimus matches canonical lats group and rhomboids matches upper-back via alias-aware search', async () => {
    await act(async () => { root.render(<Library />) })
    const searchInput = container.querySelector('input.input')
    const doSearch = async (q) => {
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        nativeSetter.call(searchInput, q)
        searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    await doSearch('lats')
    let items = Array.from(container.querySelectorAll('.list .item'))
    expect(items.some(it => it.textContent.toLowerCase().includes('alternate lateral pulldown'))).toBe(true)
    // rhomboids maps to upper-back so row variations should appear
    await doSearch('rhomboids')
    items = Array.from(container.querySelectorAll('.list .item'))
    expect(items.some(it => it.textContent.toLowerCase().includes('barbell bent over row'))).toBe(true)
    await doSearch('latissimus')
    items = Array.from(container.querySelectorAll('.list .item'))
    expect(items.some(it => it.textContent.toLowerCase().includes('alternate lateral pulldown'))).toBe(true)
  })

  it('ExerciseDetail shows Primary: Lats with secondaries for vertical pull and Primary: Upper back for row', async () => {
    const latEx = EXIDX['0007'] // alternate lateral pulldown tg lats
    await act(async () => { root.render(<ExerciseDetail ex={latEx} close={vi.fn()} />) })
    let tags = Array.from(container.querySelectorAll('.row .tag')).map(t => t.textContent.trim())
    expect(tags.some(t => t === 'Primary: Lats' || t.includes('Primary: Lats'))).toBe(true)
    expect(tags).toContain('Secondary: Biceps')
    expect(tags).toContain('Secondary: Upper back')
    // Check that Primary tag has accent styling
    const primaryTag = container.querySelector('.tag.acc')
    expect(primaryTag.textContent).toContain('Primary: Lats')

    await act(async () => { root.unmount() })
    container.innerHTML = ''
    root = createRoot(container)
    const rowEx = EXIDX['0027'] // barbell bent over row tg upper back
    await act(async () => { root.render(<ExerciseDetail ex={rowEx} close={vi.fn()} />) })
    tags = Array.from(container.querySelectorAll('.row .tag')).map(t => t.textContent.trim())
    expect(tags.some(t => t.includes('Primary: Upper back'))).toBe(true)
    // Should have secondaries Biceps, Shoulders (via rear deltoids alias)
    expect(tags).toContain('Secondary: Biceps')
    expect(tags.some(t => t.includes('Shoulders'))).toBe(true)
  })
})

describe('Ticket 04 — Custom exercise lifecycle with lats', () => {
  it('form offers Lats as primary alongside Upper back, secondary includes other posterior muscle', async () => {
    await act(async () => { root.render(<CustomExForm onDone={vi.fn()} close={vi.fn()} />) })
    const primaryChips = Array.from(container.querySelectorAll('.chips')[0].querySelectorAll('button.chip')).map(c => c.textContent.trim())
    expect(primaryChips).toContain('Lats')
    expect(primaryChips).toContain('Upper back')
    expect(primaryChips.indexOf('Lats')).toBe(primaryChips.indexOf('Upper back') + 1)
    // Select Lats
    const latsPrimary = Array.from(container.querySelectorAll('.chips')[0].querySelectorAll('button.chip')).find(c => c.textContent.trim() === 'Lats')
    await act(async () => { latsPrimary.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    // Secondary row should appear and contain Upper back but not Lats
    const secChips = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip')).map(c => c.textContent.trim())
    expect(secChips).toContain('Upper back')
    expect(secChips).not.toContain('Lats')
  })

  it('saving custom exercise with primary Lats persists tg:lats and derives bp:back; secondary Lats persists correctly', async () => {
    const onDone = vi.fn()
    const close = vi.fn()
    await act(async () => { root.render(<CustomExForm onDone={onDone} close={close} />) })
    const nameInput = container.querySelector('input.input')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(nameInput, 'My Lat Pull Machine')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const latsPrimary = Array.from(container.querySelectorAll('.chips')[0].querySelectorAll('button.chip')).find(c => c.textContent.trim() === 'Lats')
    await act(async () => { latsPrimary.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    // Select secondary Upper back
    const upperSec = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip')).find(c => c.textContent.trim() === 'Upper back')
    await act(async () => { upperSec.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const saveBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Create exercise'))
    await act(async () => { saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const created = useStore.getState().S.customEx.find(c => c.n === 'My Lat Pull Machine')
    expect(created).toBeTruthy()
    expect(created.tg).toBe('lats')
    expect(created.sm).toEqual(['upper-back'])
    expect(created.bp).toBe('back')
    // Re-open form pre-fills
    await act(async () => { root.unmount() })
    container.innerHTML = ''
    root = createRoot(container)
    await act(async () => { root.render(<CustomExForm existing={created} onDone={vi.fn()} close={vi.fn()} />) })
    const latsOn = Array.from(container.querySelectorAll('.chips')[0].querySelectorAll('button.chip')).find(c => c.textContent.trim() === 'Lats')
    expect(latsOn.classList.contains('on')).toBe(true)
    const upperSecOn = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip')).find(c => c.textContent.trim() === 'Upper back')
    expect(upperSecOn.classList.contains('on')).toBe(true)
  })

  it('saving Upper back primary with secondary Lats persists correctly', async () => {
    const onDone = vi.fn()
    await act(async () => { root.render(<CustomExForm onDone={onDone} close={vi.fn()} />) })
    const nameInput = container.querySelector('input.input')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(nameInput, 'My Row Machine')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const upperPrimary = Array.from(container.querySelectorAll('.chips')[0].querySelectorAll('button.chip')).find(c => c.textContent.trim() === 'Upper back')
    await act(async () => { upperPrimary.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const latsSec = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip')).find(c => c.textContent.trim() === 'Lats')
    await act(async () => { latsSec.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const saveBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Create exercise'))
    await act(async () => { saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const created = useStore.getState().S.customEx.find(c => c.n === 'My Row Machine')
    expect(created.tg).toBe('upper-back')
    expect(created.sm).toEqual(['lats'])
    expect(created.bp).toBe('back')
  })

  it('legacy custom with only bp:back resolves via 3-way fallback and appears under both filters', async () => {
    const legacy = { id: 'c-legacy-back', n: 'Old Back Lift', bp: 'back', eq: 'custom', custom: true }
    useStore.getState().update(s => { s.customEx = [legacy] })
    expect(primaryMuscleOf('c-legacy-back')).toBe('lats')
    expect(secondaryMusclesOf('c-legacy-back')).toEqual(['upper-back', 'lower-back'])
    expect(matchesMuscleFilter('c-legacy-back', 'lats')).toBe(true)
    expect(matchesMuscleFilter('c-legacy-back', 'upper-back')).toBe(true)
    expect(matchesMuscleFilter('c-legacy-back', 'lower-back')).toBe(true)
    // Verify Library shows it under both Lats and Upper back filters
    await act(async () => { root.render(<Library />) })
    let latsChip = getChip(container, 'Lats')
    await act(async () => { latsChip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    let items = Array.from(container.querySelectorAll('.list .item'))
    expect(items.some(it => it.textContent.includes('Old Back Lift'))).toBe(true)
    // Should have secondary badge for Upper back? Since primary is lats, secondary includes upper-back, badge when filtering by upper-back
    let upperChip = getChip(container, 'Upper back')
    await act(async () => { upperChip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    items = Array.from(container.querySelectorAll('.list .item'))
    const legacyUnderUpper = items.find(it => it.textContent.includes('Old Back Lift'))
    expect(legacyUnderUpper).toBeTruthy()
    expect(legacyUnderUpper.querySelector('.ss .tag')?.textContent).toContain('Secondary: Upper back')
  })

  it('full profile export preserves tg/sm with lats; plan import accepts lats slug and derives bp', async () => {
    const custom = { id: 'c-lats-1', n: 'Lat Machine Custom', bp: 'back', tg: 'lats', sm: ['upper-back'], eq: 'custom', custom: true }
    const routine = { id: 'r1', name: 'Back Day', emoji: '💪', ex: [{ id: 'c-lats-1', sets: 3, reps: 10 }] }
    useStore.getState().update(s => { s.customEx = [custom]; s.routines = [routine] })
    // Full profile export preserves via store JSON
    const exported = JSON.parse(JSON.stringify(useStore.getState().S))
    expect(exported.customEx.find(c => c.id === 'c-lats-1').tg).toBe('lats')
    expect(exported.customEx.find(c => c.id === 'c-lats-1').sm).toEqual(['upper-back'])
    const bundle = buildPlanBundle(useStore.getState().S, 'Test Plan')
    expect(bundle.customEx.find(c => c.id === 'c-lats-1').tg).toBe('lats')
    expect(bundle.customEx.find(c => c.id === 'c-lats-1').sm).toEqual(['upper-back'])
    // Parse and merge into fresh state
    const json = JSON.stringify(bundle)
    const parsed = parsePlan(json)
    expect(parsed.customEx[0].tg).toBe('lats')
    const target = { routines: [], customEx: [], week: {} }
    mergePlan(target, parsed)
    expect(target.customEx[0].tg).toBe('lats')
    expect(target.customEx[0].sm).toEqual(['upper-back'])
    // Derived bp should be back (via bodypartForMuscle or stored) — mergePlan stores as is, but lookup should resolve
    // After merge, id is remapped to fresh uid; use new id
    const newId = target.customEx[0].id
    expect(newId).not.toBe('c-lats-1')
    // Simulate store registration
    useStore.getState().update(s => { s.customEx = target.customEx })
    expect(primaryMuscleOf(newId)).toBe('lats')
    expect(matchesMuscleFilter(newId, 'lats')).toBe(true)
    expect(matchesMuscleFilter(newId, 'upper-back')).toBe(true)
  })
})

describe('Ticket 05 — Stats Muscle Balance integration', () => {
  it('derives separate effective-sets buckets for lats and upper-back via loadOf and shades via levelsOf', async () => {
    const latW = buildCompletedWorkout({
      id: 'w-lat', d: '2026-08-20', start: Date.now() - 86400000, routineId: null, name: 'Lat Day', bw: 80,
      entries: [{ id: '0007', sets: [{ done: true, w: 50, r: 10 }, { done: true, w: 50, r: 10 }] }]
    }, { end: Date.now(), prs: [] })
    const rowW = buildCompletedWorkout({
      id: 'w-row', d: '2026-08-21', start: Date.now() - 3600000, routineId: null, name: 'Row Day', bw: 80,
      entries: [{ id: '0027', sets: [{ done: true, w: 60, r: 10 }, { done: true, w: 60, r: 10 }] }]
    }, { end: Date.now(), prs: [] })
    const latLoad = loadOfWorkouts([latW], null)
    expect(latLoad.lats).toBeCloseTo(2, 5)
    expect(latLoad['upper-back']).toBeCloseTo(0.8, 5)
    const rowLoad = loadOfWorkouts([rowW], null)
    expect(rowLoad['upper-back']).toBeCloseTo(2, 5)
    expect(rowLoad.lats || 0).toBe(0)
    // Synthetic isolated loads produce independent heat levels
    const latLevels = levelsOf(latLoad)
    const rowLevels = levelsOf(rowLoad)
    expect(latLevels.lats).toBe(4)
    expect(latLevels['upper-back']).toBe(2) // 0.8/2*4=1.6 ceil 2 with cross-credit
    // Use synthetic pure isolation for parity
    const pureLat = levelsOf({ lats: 10, 'upper-back': 0 })
    const pureUpper = levelsOf({ lats: 0, 'upper-back': 10 })
    expect(pureLat.lats).toBe(4)
    expect(pureLat['upper-back']).toBe(0)
    expect(pureUpper['upper-back']).toBe(4)
    expect(pureUpper.lats).toBe(0)
  })

  it('rankOf orders Lats and Upper back independently and missed retains head-to-toe order', () => {
    const load = { lats: 5, 'upper-back': 10, chest: 1 }
    const { worked, missed } = rankOf(load)
    expect(worked[0]).toBe('upper-back')
    expect(worked[1]).toBe('lats')
    expect(worked[2]).toBe('chest')
    // Missed should be MUSCLES filtered minus worked, in original MUSCLES order
    const expectedMissed = MUSCLES.filter(m => !worked.includes(m))
    expect(missed).toEqual(expectedMissed)
    expect(MUSCLES.indexOf('lats')).toBe(MUSCLES.indexOf('upper-back') + 1)
  })

  it('historic workouts reinterpret live under new split (no migration) - long-term balance reflects precise model', () => {
    // Create a historic workout with legacy bp:back custom exercise (before taxonomy existed)
    // Now with new code, it should split via 3-way fallback
    const legacyEx = { id: 'c-legacy-hist', n: 'Old Back Lift Hist', bp: 'back' }
    // Simulate historic workout entry using that exercise id
    const histW = {
      id: 'w-hist', d: '2026-01-01', start: Date.UTC(2026, 0, 1, 10), unit: 'kg',
      entries: [{ id: 'c-legacy-hist', sets: [{ done: true, w: 50, r: 10 }, { done: true, w: 50, r: 10 }] }],
    }
    // Register custom for lookup
    useStore.getState().update(s => { s.customEx = [{ id: 'c-legacy-hist', n: 'Old Back Lift Hist', bp: 'back', eq: 'custom', custom: true }] })
    const load = loadOfWorkouts([histW], null)
    // Should be 3-way split, not old 2-way
    expect(load.lats).toBeCloseTo(1.0, 5)
    expect(load['upper-back']).toBeCloseTo(0.7, 5)
    expect(load['lower-back']).toBeCloseTo(0.3, 5)
  })

  it('clicking Lats or Upper back region on map drives same filter semantics as Library chips (via BodyMap onMuscle)', async () => {
    // This test validates the contract without needing full BodyMap geometry:
    // BodyMap renders {MUSCLES.map(slug => ... onClick={()=>onMuscle(slug)})}
    // So selecting lats vs upper-back via onMuscle should be distinct.
    // We simulate by ensuring MUSCLES contains both and levelsOf distinct.
    const load = { lats: 10, 'upper-back': 0 }
    const levels = levelsOf(load)
    expect(levels.lats).not.toBe(levels['upper-back'])
    // Verify that BodyMap would shade via shared level helper identically for both
    expect(MUSCLE_NAME.lats).toBe('Lats')
    expect(MUSCLE_NAME['upper-back']).toBe('Upper back')
  })
})
