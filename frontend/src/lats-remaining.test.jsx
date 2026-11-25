// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, within } from '@testing-library/react'
import { chipIn, chipNamesIn, search, tileNamed, tilesIn } from './test/library-queries.js'
import { allChips, chipRow, chipNamed, isOn, typeInto } from './test/catalogue-queries.js'
import Library from './views/Library.jsx'
import { ExerciseDetail, ExercisePicker, CustomExForm } from './sheets/catalogue.jsx'
import { useStore } from './store/useStore.js'
import { DEF } from './lib/profile/index.js'
import { EXIDX } from './lib/exercises.js'
import { MUSCLES, FILTER_MUSCLES, MUSCLE_NAME, primaryMuscleOf, secondaryMusclesOf, matchesMuscleFilter, loadOfWorkouts, levelsOf, rankOf } from './lib/muscles.js'
import { buildPlanBundle, parsePlan, mergePlan } from './lib/plan-share.js'
import { act as actOn } from './lib/active-workout.js'

const logged = active => actOn({ unit: 'kg', routines: [], workouts: [], active }, { type: 'finish' }).result.workout

vi.mock('./platform/sound.js', async orig => (await import('./test/platform-mocks.js')).mockSound(await orig()))
vi.mock('./platform/mobile.js', async orig => (await import('./test/platform-mocks.js')).mockMobile(await orig()))

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

const getChip = (scope, label) => chipNamed(allChips(scope), label)

const HEAD_TO_TOE_DISPLAY = FILTER_MUSCLES.map(m => MUSCLE_NAME[m])
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
  it('Library renders a chip for every filter muscle in taxonomy order with Lats after Upper back; Favorites/All preserved', async () => {
    useStore.getState().update(s => { s.favorites = ['0001'] })
    await act(async () => { root.render(<Library />) })
    const chips = chipNamesIn(container)
    expect(chips.slice(0, EXPECTED_LIBRARY_CHIPS.length)).toEqual(EXPECTED_LIBRARY_CHIPS)
    expect(chips.indexOf('Lats')).toBe(chips.indexOf('Upper back') + 1)
    expect(chips.indexOf('Serratus')).toBe(chips.indexOf('Lats') + 1)
  })

  it('clicking Lats shows primary lat exercises and secondary contributors; clicking Upper back shows disjoint primary set', async () => {
    await act(async () => { root.render(<Library />) })
    fireEvent.click(chipIn(container, 'Lats'))
    expect(tileNamed(container, 'alternate lateral pulldown')).toBeTruthy()
    expect(tileNamed(container, 'barbell bent over row')).toBeTruthy()

    fireEvent.click(chipIn(container, 'Upper back'))
    expect(tileNamed(container, 'barbell bent over row')).toBeTruthy()
    const latUnderUpper = tileNamed(container, 'alternate lateral pulldown')
    expect(within(latUnderUpper).getByText(/Secondary: Upper back/)).toBeTruthy()

    fireEvent.click(chipIn(container, 'Lats'))
    expect(within(tileNamed(container, 'alternate lateral pulldown')).queryByText(/Secondary:/)).toBeNull()
  })

  it('crossover compounds display inline Secondary: Lats or Secondary: Upper back badges', async () => {
    await act(async () => { root.render(<Library />) })
    fireEvent.click(chipIn(container, 'Upper back'))
    expect(within(tileNamed(container, 'alternate lateral pulldown')).getByText(/Secondary: Upper back/)).toBeTruthy()

    const custom = { id: 'c-test-latsec', n: 'Custom Row to Lats', bp: 'back', tg: 'upper-back', sm: ['lats'], eq: 'custom', custom: true }
    useStore.getState().update(s => { s.customEx.push(custom) })
    await act(async () => { root.render(<Library />) })
    fireEvent.click(chipIn(container, 'Lats'))
    expect(within(tileNamed(container, 'Custom Row to Lats')).getByText(/Secondary: Lats/)).toBeTruthy()
  })

  it('ExercisePicker renders the same muscle chips, with Lats after Upper back, and matches the same semantics', async () => {
    useStore.getState().update(s => { s.favorites = ['0001'] })
    await act(async () => { root.render(<ExercisePicker onPick={vi.fn()} close={vi.fn()} />) })
    const chips = chipRow(container, 0).map(c => c.textContent.trim())
    HEAD_TO_TOE_DISPLAY.forEach(m => expect(chips).toContain(m))
    expect(chips.indexOf('Lats')).toBe(chips.indexOf('Upper back') + 1)
    const latsChip = getChip(container, 'Lats')
    fireEvent.click(latsChip)
    let items = tilesIn(container)
    expect(items.some(it => it.textContent.toLowerCase().includes('alternate lateral pulldown'))).toBe(true)
    expect(items.some(it => it.textContent.toLowerCase().includes('barbell bent over row'))).toBe(true)

    const upperChip = getChip(container, 'Upper back')
    fireEvent.click(upperChip)
    items = tilesIn(container)
    expect(items.some(it => it.textContent.toLowerCase().includes('barbell bent over row'))).toBe(true)
  })

  it('text search for lats/latissimus matches canonical lats group and rhomboids matches upper-back via alias-aware search', async () => {
    await act(async () => { root.render(<Library />) })
    search(container, 'lats')
    expect(tileNamed(container, 'alternate lateral pulldown')).toBeTruthy()
    search(container, 'rhomboids')
    expect(tileNamed(container, 'barbell bent over row')).toBeTruthy()
    search(container, 'latissimus')
    expect(tileNamed(container, 'alternate lateral pulldown')).toBeTruthy()
  })

  it('ExerciseDetail shows Primary: Lats with secondaries for vertical pull and Primary: Upper back for row', async () => {
    const latEx = EXIDX['0007']
    await act(async () => { root.render(<ExerciseDetail ex={latEx} close={vi.fn()} />) })
    expect(within(container).getByText('Primary: Lats')).toBeTruthy()
    expect(within(container).getByText('Secondary: Biceps')).toBeTruthy()
    expect(within(container).getByText('Secondary: Upper back')).toBeTruthy()

    await act(async () => { root.unmount() })
    container.innerHTML = ''
    root = createRoot(container)
    const rowEx = EXIDX['0027']
    await act(async () => { root.render(<ExerciseDetail ex={rowEx} close={vi.fn()} />) })
    expect(within(container).getByText('Primary: Upper back')).toBeTruthy()
    expect(within(container).getByText('Secondary: Biceps')).toBeTruthy()
    expect(within(container).getByText(/Rear delts/)).toBeTruthy()
  })
})

describe('Ticket 04 — Custom exercise lifecycle with lats', () => {
  it('form offers Lats as primary alongside Upper back, secondary includes other posterior muscle', async () => {
    await act(async () => { root.render(<CustomExForm onDone={vi.fn()} close={vi.fn()} />) })
    const primaryChips = chipRow(container, 0).map(c => c.textContent.trim())
    expect(primaryChips).toContain('Lats')
    expect(primaryChips).toContain('Upper back')
    expect(primaryChips.indexOf('Lats')).toBe(primaryChips.indexOf('Upper back') + 1)
    const latsPrimary = chipRow(container, 0).find(c => c.textContent.trim() === 'Lats')
    fireEvent.click(latsPrimary)
    const secChips = chipRow(container, 1).map(c => c.textContent.trim())
    expect(secChips).toContain('Upper back')
    expect(secChips).not.toContain('Lats')
  })

  it('saving custom exercise with primary Lats persists tg:lats and derives bp:back; secondary Lats persists correctly', async () => {
    const onDone = vi.fn()
    const close = vi.fn()
    await act(async () => { root.render(<CustomExForm onDone={onDone} close={close} />) })
    const nameInput = within(container).getByRole('textbox', { name: 'Exercise name' })
    typeInto(nameInput, 'My Lat Pull Machine')
    const latsPrimary = chipRow(container, 0).find(c => c.textContent.trim() === 'Lats')
    fireEvent.click(latsPrimary)
    const upperSec = chipRow(container, 1).find(c => c.textContent.trim() === 'Upper back')
    fireEvent.click(upperSec)
    const saveBtn = within(container).getByRole('button', { name: /Create exercise/ })
    fireEvent.click(saveBtn)
    const created = useStore.getState().S.customEx.find(c => c.n === 'My Lat Pull Machine')
    expect(created).toBeTruthy()
    expect(created.tg).toBe('lats')
    expect(created.sm).toEqual(['upper-back'])
    expect(created.bp).toBe('back')
    await act(async () => { root.unmount() })
    container.innerHTML = ''
    root = createRoot(container)
    await act(async () => { root.render(<CustomExForm existing={created} onDone={vi.fn()} close={vi.fn()} />) })
    const latsOn = chipRow(container, 0).find(c => c.textContent.trim() === 'Lats')
    expect(isOn(latsOn)).toBe(true)
    const upperSecOn = chipRow(container, 1).find(c => c.textContent.trim() === 'Upper back')
    expect(isOn(upperSecOn)).toBe(true)
  })

  it('saving Upper back primary with secondary Lats persists correctly', async () => {
    const onDone = vi.fn()
    await act(async () => { root.render(<CustomExForm onDone={onDone} close={vi.fn()} />) })
    const nameInput = within(container).getByRole('textbox', { name: 'Exercise name' })
    typeInto(nameInput, 'My Row Machine')
    const upperPrimary = chipRow(container, 0).find(c => c.textContent.trim() === 'Upper back')
    fireEvent.click(upperPrimary)
    const latsSec = chipRow(container, 1).find(c => c.textContent.trim() === 'Lats')
    fireEvent.click(latsSec)
    const saveBtn = within(container).getByRole('button', { name: /Create exercise/ })
    fireEvent.click(saveBtn)
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
    fireEvent.click(chipIn(container, 'Lats'))
    expect(tileNamed(container, 'Old Back Lift')).toBeTruthy()
    fireEvent.click(chipIn(container, 'Upper back'))
    expect(within(tileNamed(container, 'Old Back Lift')).getByText(/Secondary: Upper back/)).toBeTruthy()
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
