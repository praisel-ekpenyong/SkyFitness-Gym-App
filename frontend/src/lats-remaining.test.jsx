// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Library from './views/Library.jsx'
import { ExerciseDetail, ExercisePicker, CustomExForm } from './sheets/catalogue.jsx'
import { useStore } from './store/useStore.js'
import { DEF } from './lib/profile/index.js'
import { EXIDX } from './lib/exercises.js'
import { MUSCLES, primaryMuscleOf, secondaryMusclesOf, matchesMuscleFilter, loadOfWorkouts, levelsOf, rankOf } from './lib/muscles.js'
import { buildPlanBundle, parsePlan, mergePlan } from './lib/plan-share.js'
import { act as actOn } from './lib/active-workout.js'

const logged = active => actOn({ unit: 'kg', routines: [], workouts: [], active }, { type: 'finish' }).result.workout

vi.mock('./platform/sound.js', () => ({
  beep: vi.fn(),
  vibrate: vi.fn(),
  playWorkoutComplete: vi.fn(),
}))
vi.mock('./platform/mobile.js', () => ({
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

const HEAD_TO_TOE_DISPLAY = ['Traps', 'Shoulders', 'Front delts', 'Side delts', 'Rear delts', 'Chest', 'Upper back', 'Lats', 'Serratus', 'Biceps', 'Triceps', 'Forearms', 'Abs', 'Obliques', 'Lower back', 'Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Hip flexors', 'Calves', 'Shins', 'Cardio']
const EXPECTED_LIBRARY_CHIPS = ['Favorites (1)', 'All', ...HEAD_TO_TOE_DISPLAY]

function expectIsolatedLatsLevels() {
  const pureLat = levelsOf({ lats: 10, 'upper-back': 0 })
  const pureUpper = levelsOf({ lats: 0, 'upper-back': 10 })
  expect(pureLat.lats).toBe(4)
  expect(pureLat['upper-back']).toBe(0)
  expect(pureUpper['upper-back']).toBe(4)
  expect(pureUpper.lats).toBe(0)
}

describe('Ticket 03 — Library and Picker filters plus Exercise Detail presentation', () => {
  it('Library renders 21 muscle chips plus Shoulders and Cardio in head-to-toe order with Lats after Upper back; Favorites/All preserved', async () => {
    useStore.getState().update(s => { s.favorites = ['0001'] })
    await act(async () => { root.render(<Library />) })
    const firstChipsRow = container.querySelectorAll('.chips')[0]
    const chips = Array.from(firstChipsRow.querySelectorAll('button.chip')).map(c => c.textContent.trim())
    expect(chips).toEqual(EXPECTED_LIBRARY_CHIPS)
    expect(chips.indexOf('Lats')).toBe(chips.indexOf('Upper back') + 1)
    expect(chips.indexOf('Serratus')).toBe(chips.indexOf('Lats') + 1)
  })

  it('clicking Lats shows primary lat exercises and secondary contributors; clicking Upper back shows disjoint primary set', async () => {
    await act(async () => { root.render(<Library />) })
    const latsChip = getChip(container, 'Lats')
    expect(latsChip).toBeTruthy()
    await act(async () => { latsChip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const latsItems = Array.from(container.querySelectorAll('.list .item'))
    const latPulldown = latsItems.find(it => it.textContent.toLowerCase().includes('alternate lateral pulldown'))
    expect(latPulldown).toBeTruthy()
    const rowItemUnderLats = latsItems.find(it => it.textContent.toLowerCase().includes('barbell bent over row'))
    expect(rowItemUnderLats).toBeTruthy()

    const upperChip = getChip(container, 'Upper back')
    expect(upperChip).toBeTruthy()
    await act(async () => { upperChip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const upperItems = Array.from(container.querySelectorAll('.list .item'))
    const rowItem = upperItems.find(it => it.textContent.toLowerCase().includes('barbell bent over row'))
    expect(rowItem).toBeTruthy()
    const latUnderUpper = upperItems.find(it => it.textContent.toLowerCase().includes('alternate lateral pulldown'))
    expect(latUnderUpper).toBeTruthy()
    expect(latUnderUpper.querySelector('.ss .tag')?.textContent).toContain('Secondary: Upper back')
    await act(async () => { latsChip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const latsItems2 = Array.from(container.querySelectorAll('.list .item'))
    const latItemAgain = latsItems2.find(it => it.textContent.toLowerCase().includes('alternate lateral pulldown'))
    expect(latItemAgain.querySelector('.ss .tag')).toBeNull()
  })

  it('crossover compounds display inline Secondary: Lats or Secondary: Upper back badges', async () => {
    await act(async () => { root.render(<Library />) })
    const upperChip = getChip(container, 'Upper back')
    await act(async () => { upperChip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    let items = Array.from(container.querySelectorAll('.list .item'))
    let latUnderUpper = items.find(it => it.textContent.toLowerCase().includes('alternate lateral pulldown'))
    expect(latUnderUpper.querySelector('.ss .tag').textContent).toContain('Secondary: Upper back')

    const custom = { id: 'c-test-latsec', n: 'Custom Row to Lats', bp: 'back', tg: 'upper-back', sm: ['lats'], eq: 'custom', custom: true }
    useStore.getState().update(s => { s.customEx.push(custom) })
    await act(async () => { root.render(<Library />) })
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
    HEAD_TO_TOE_DISPLAY.forEach(m => expect(chips).toContain(m))
    expect(chips.indexOf('Lats')).toBe(chips.indexOf('Upper back') + 1)
    const latsChip = getChip(container, 'Lats')
    await act(async () => { latsChip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    let items = Array.from(container.querySelectorAll('.list .item'))
    expect(items.some(it => it.textContent.toLowerCase().includes('alternate lateral pulldown'))).toBe(true)
    expect(items.some(it => it.textContent.toLowerCase().includes('barbell bent over row'))).toBe(true)

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
    await doSearch('rhomboids')
    items = Array.from(container.querySelectorAll('.list .item'))
    expect(items.some(it => it.textContent.toLowerCase().includes('barbell bent over row'))).toBe(true)
    await doSearch('latissimus')
    items = Array.from(container.querySelectorAll('.list .item'))
    expect(items.some(it => it.textContent.toLowerCase().includes('alternate lateral pulldown'))).toBe(true)
  })

  it('ExerciseDetail shows Primary: Lats with secondaries for vertical pull and Primary: Upper back for row', async () => {
    const latEx = EXIDX['0007']
    await act(async () => { root.render(<ExerciseDetail ex={latEx} close={vi.fn()} />) })
    let tags = Array.from(container.querySelectorAll('.row .tag')).map(t => t.textContent.trim())
    expect(tags.some(t => t === 'Primary: Lats' || t.includes('Primary: Lats'))).toBe(true)
    expect(tags).toContain('Secondary: Biceps')
    expect(tags).toContain('Secondary: Upper back')
    const primaryTag = container.querySelector('.tag.strong')
    expect(primaryTag.textContent).toContain('Primary: Lats')

    await act(async () => { root.unmount() })
    container.innerHTML = ''
    root = createRoot(container)
    const rowEx = EXIDX['0027']
    await act(async () => { root.render(<ExerciseDetail ex={rowEx} close={vi.fn()} />) })
    tags = Array.from(container.querySelectorAll('.row .tag')).map(t => t.textContent.trim())
    expect(tags.some(t => t.includes('Primary: Upper back'))).toBe(true)
    expect(tags).toContain('Secondary: Biceps')
    expect(tags.some(t => t.includes('Rear delts'))).toBe(true)
  })
})

describe('Ticket 04 — Custom exercise lifecycle with lats', () => {
  it('form offers Lats as primary alongside Upper back, secondary includes other posterior muscle', async () => {
    await act(async () => { root.render(<CustomExForm onDone={vi.fn()} close={vi.fn()} />) })
    const primaryChips = Array.from(container.querySelectorAll('.chips')[0].querySelectorAll('button.chip')).map(c => c.textContent.trim())
    expect(primaryChips).toContain('Lats')
    expect(primaryChips).toContain('Upper back')
    expect(primaryChips.indexOf('Lats')).toBe(primaryChips.indexOf('Upper back') + 1)
    const latsPrimary = Array.from(container.querySelectorAll('.chips')[0].querySelectorAll('button.chip')).find(c => c.textContent.trim() === 'Lats')
    await act(async () => { latsPrimary.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
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
    const upperSec = Array.from(container.querySelectorAll('.chips')[1].querySelectorAll('button.chip')).find(c => c.textContent.trim() === 'Upper back')
    await act(async () => { upperSec.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const saveBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Create exercise'))
    await act(async () => { saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const created = useStore.getState().S.customEx.find(c => c.n === 'My Lat Pull Machine')
    expect(created).toBeTruthy()
    expect(created.tg).toBe('lats')
    expect(created.sm).toEqual(['upper-back'])
    expect(created.bp).toBe('back')
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
    await act(async () => { root.render(<Library />) })
    let latsChip = getChip(container, 'Lats')
    await act(async () => { latsChip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    let items = Array.from(container.querySelectorAll('.list .item'))
    expect(items.some(it => it.textContent.includes('Old Back Lift'))).toBe(true)
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
    const exported = JSON.parse(JSON.stringify(useStore.getState().S))
    expect(exported.customEx.find(c => c.id === 'c-lats-1').tg).toBe('lats')
    expect(exported.customEx.find(c => c.id === 'c-lats-1').sm).toEqual(['upper-back'])
    const bundle = buildPlanBundle(useStore.getState().S, 'Test Plan')
    expect(bundle.customEx.find(c => c.id === 'c-lats-1').tg).toBe('lats')
    expect(bundle.customEx.find(c => c.id === 'c-lats-1').sm).toEqual(['upper-back'])
    const json = JSON.stringify(bundle)
    const parsed = parsePlan(json)
    expect(parsed.customEx[0].tg).toBe('lats')
    const target = { routines: [], customEx: [], week: {} }
    mergePlan(target, parsed)
    expect(target.customEx[0].tg).toBe('lats')
    expect(target.customEx[0].sm).toEqual(['upper-back'])
    const newId = target.customEx[0].id
    expect(newId).not.toBe('c-lats-1')
    useStore.getState().update(s => { s.customEx = target.customEx })
    expect(primaryMuscleOf(newId)).toBe('lats')
    expect(matchesMuscleFilter(newId, 'lats')).toBe(true)
    expect(matchesMuscleFilter(newId, 'upper-back')).toBe(true)
  })
})

describe('Ticket 05 — Stats Muscle Balance integration', () => {
  it('derives separate effective-sets buckets for lats and upper-back via loadOf and shades via levelsOf', async () => {
    const latW = logged({
      id: 'w-lat', d: '2026-08-20', start: Date.now() - 86400000, routineId: null, name: 'Lat Day', bw: 80,
      entries: [{ id: '0007', sets: [{ done: true, w: 50, r: 10 }, { done: true, w: 50, r: 10 }] }]
    })
    const rowW = logged({
      id: 'w-row', d: '2026-08-21', start: Date.now() - 3600000, routineId: null, name: 'Row Day', bw: 80,
      entries: [{ id: '0027', sets: [{ done: true, w: 60, r: 10 }, { done: true, w: 60, r: 10 }] }]
    })
    const latLoad = loadOfWorkouts([latW], null)
    expect(latLoad.lats).toBeCloseTo(2, 5)
    expect(latLoad['upper-back']).toBeCloseTo(0.8, 5)
    const rowLoad = loadOfWorkouts([rowW], null)
    expect(rowLoad['upper-back']).toBeCloseTo(2, 5)
    expect(rowLoad.lats).toBeCloseTo(0.8, 5)
    const latLevels = levelsOf(latLoad)
    expect(latLevels.lats).toBe(4)
    expect(latLevels['upper-back']).toBe(2)
    expectIsolatedLatsLevels()
  })

  it('rankOf orders Lats and Upper back independently and missed retains head-to-toe order', () => {
    const load = { lats: 5, 'upper-back': 10, chest: 1 }
    const { worked, missed } = rankOf(load)
    expect(worked[0]).toBe('upper-back')
    expect(worked[1]).toBe('lats')
    expect(worked[2]).toBe('chest')
    const expectedMissed = MUSCLES.filter(m => !worked.includes(m))
    expect(missed).toEqual(expectedMissed)
    expect(MUSCLES.indexOf('lats')).toBe(MUSCLES.indexOf('upper-back') + 1)
  })

  it('historic workouts reinterpret live under new split (no migration) - long-term balance reflects precise model', () => {
    const histW = {
      id: 'w-hist', d: '2026-01-01', start: Date.UTC(2026, 0, 1, 10), unit: 'kg',
      entries: [{ id: 'c-legacy-hist', sets: [{ done: true, w: 50, r: 10 }, { done: true, w: 50, r: 10 }] }],
    }
    useStore.getState().update(s => { s.customEx = [{ id: 'c-legacy-hist', n: 'Old Back Lift Hist', bp: 'back', eq: 'custom', custom: true }] })
    const load = loadOfWorkouts([histW], null)
    expect(load.lats).toBeCloseTo(1.0, 5)
    expect(load['upper-back']).toBeCloseTo(0.7, 5)
    expect(load['lower-back']).toBeCloseTo(0.3, 5)
  })
})
