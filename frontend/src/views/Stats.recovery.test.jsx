import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Window } from 'happy-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recapSheet } from '../sheets.jsx'
import Stats from './Stats.jsx'

const DAY = 86400000
const HOUR = 3600000
const BASE_NOW = Date.UTC(2026, 0, 22, 12)

const mocks = vi.hoisted(() => ({
  maps: [],
  mapMounts: 0,
  S: {
    unit: 'kg', body: 'male', effort: 'rir', targetW: null,
    bodyweight: [], routines: [], workouts: [],
  },
}))

vi.mock('../store/useStore.js', () => ({
  useStore: selector => selector({ S: mocks.S }),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../sheets.jsx', () => ({
  bwSheet: () => {}, goalSheet: () => {}, calendarSheet: () => {}, recapSheet: vi.fn(), workoutDetailSheet: () => {},
  WorkoutRow: () => React.createElement('div'),
}))
vi.mock('../components/LineChart.jsx', () => ({ default: props => React.createElement('div', { 'data-chart-days': props.points.map(p => p.d).join(',') }) }))
vi.mock('../components/Heatmap.jsx', () => ({ default: () => React.createElement('div') }))
vi.mock('../components/Icon.jsx', () => ({ default: props => React.createElement('span', props) }))
vi.mock('../components/BodyMap.jsx', () => ({
  default: props => {
    mocks.maps.push(props)
    React.useEffect(() => {
      mocks.mapMounts += 1
      return () => {}
    }, [])
    return React.createElement(
      'div',
      { 'data-body-map': true, 'data-selected-muscle': props.selected || '' },
      React.createElement('button', {
        'data-muscle': 'chest',
        'aria-label': props.getA11yLabel ? props.getA11yLabel('chest', props.load?.chest) : 'Chest',
        onClick: () => props.onMuscle?.('chest'),
      }, 'Chest'),
    )
  },
  BodyMapLegend: () => React.createElement('div', { 'data-balance-legend': true }),
}))

let dom
let root
let container

function iso(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function set(done, extra = {}) {
  return { done, w: 80, r: 8, unit: 'kg', ...extra }
}

function workout(id, start, entries) {
  return { id, d: iso(start), start, unit: 'kg', entries }
}

function entry(id, sets) {
  return { id, sets }
}

function lifecycleWorkouts(now = BASE_NOW) {
  // The old one-set session lowers the causal reference seen by the six-set session. Position
  // that newer stimulus 30 seconds before its .5 crossing so the real interval update flips it.
  const weightedSet = 640 * (30 / 38) ** 1.5
  const referenceAfterOldSession = 2000 + (weightedSet - 2000) / 3
  const fatigueEdge = now - (
    36 * Math.log2((6 * weightedSet / referenceAfterOldSession) / Math.LN2) * HOUR - 30000
  )
  const balanceEdge = now - (30 * DAY - 30000)
  const strengthEdge = now - (14 * DAY - 30000)
  return [
    workout('fatigue-edge', fatigueEdge, [entry('1254', Array.from({ length: 6 }, () => set(true, { rir: 0 })))]),
    workout('balance-edge', balanceEdge, [entry('1254', [set(true, { rir: 2 })])]),
    workout('strength-edge', strengthEdge, [entry('1001', [set(true, { rir: 2 })])]),
    workout('abs-completed', now - 20 * DAY, [entry('1002', [set(true, { rir: 2 })])]),
    workout('abs-undone', now - DAY, [entry('1002', [set(false, { rir: 0 })])]),
  ]
}

function resetFixture(workouts = lifecycleWorkouts()) {
  mocks.S.customEx = []
  mocks.S.unit = 'kg'
  mocks.S.bodyweight = []
  mocks.S.workouts = workouts
  mocks.maps.length = 0
  mocks.mapMounts = 0
}

function installDom() {
  dom = new Window({ url: 'http://localhost/' })
  globalThis.window = dom
  globalThis.document = dom.document
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.navigator })
  for (const key of ['HTMLElement', 'HTMLIFrameElement', 'Node', 'Element', 'Event', 'MouseEvent']) {
    globalThis[key] = dom[key]
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
}

async function mountStats() {
  installDom()
  await act(async () => { root.render(React.createElement(Stats)) })
}

async function unmountStats() {
  if (!root) return
  await act(async () => { root.unmount() })
  root = null
  container = null
  dom.close()
  dom = null
}

function muscleCard() {
  return [...container.querySelectorAll('.card')].find(card =>
    [...card.querySelectorAll('.seg button')].some(button =>
      ['Muscle balance', 'Fatigue', 'Strength'].includes(button.textContent.trim())))
}

function buttonWithText(scope, text) {
  return [...scope.querySelectorAll('button')].find(button => button.textContent.trim() === text)
}

function viewButton(text) {
  return buttonWithText(muscleCard(), text)
}

function balanceRangeButton(text) {
  return buttonWithText(muscleCard().querySelectorAll('.seg')[1], text)
}

async function click(button) {
  expect(button, `expected a button named ${button?.textContent || 'unknown'}`).toBeTruthy()
  await act(async () => { button.dispatchEvent(new dom.MouseEvent('click', { bubbles: true })) })
}

async function tick(milliseconds) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
}

const lastMap = () => mocks.maps.at(-1)
const expectPressed = button => expect(button?.getAttribute('aria-checked')).toBe('true')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BASE_NOW)
  resetFixture()
})

afterEach(async () => {
  await unmountStats()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Stats muscle recovery view runtime', () => {
  it('dispatches real clicks through Balance, Fatigue, and Strength and preserves selection', async () => {
    await mountStats()
    expectPressed(viewButton('Muscle balance'))
    expectPressed(balanceRangeButton('30d'))

    await click(balanceRangeButton('30d'))
    await click(buttonWithText(muscleCard(), 'All'))
    await click(muscleCard().querySelector('[data-muscle="chest"]'))
    expect(buttonWithText(muscleCard(), 'Hard')).toBeTruthy()

    await click(viewButton('Fatigue'))
    expectPressed(viewButton('Fatigue'))
    expect(lastMap().thresholds).toBeTruthy()
    expect(container.textContent).toContain('Fatigue shows how recently each muscle was trained. High means rest.')
    expect(container.querySelector('[data-selected-muscle="chest"]')).toBeTruthy()

    await click(viewButton('Strength'))
    expectPressed(viewButton('Strength'))
    expect(lastMap().thresholds.at(-1)).toEqual({ at: 1, level: 4 })
    expect(container.textContent).toContain('Strength shows retained muscle strength. Train again to reset it.')

    await click(viewButton('Muscle balance'))
    expectPressed(balanceRangeButton('30d'))
    expect(buttonWithText(muscleCard(), 'Hard')).toBeTruthy()
    expect(lastMap().selected).toBe('chest')
  })

  it('updates the rendered Fatigue map on the real 60-second interval without remounting', async () => {
    await mountStats()
    await click(viewButton('Fatigue'))
    await click(muscleCard().querySelector('[data-muscle="chest"]'))

    const mountsBeforeTick = mocks.mapMounts
    expect(container.textContent).toContain('Fatigued')

    await tick(60000)

    expect(mocks.mapMounts).toBe(mountsBeforeTick)
    expect(container.textContent).toContain('Recovering')
  })

  it('Fatigue rescan runs on the Muscle map tick change only, not every render', async () => {
    await mountStats()
    await click(viewButton('Fatigue'))
    const first = lastMap().load

    // A second passes and an unrelated selection re-renders the Muscle map: the
    // state-derived clock has not ticked, so the memoized Fatigue rescan must not run.
    await tick(1000)
    await click(muscleCard().querySelector('[data-muscle="chest"]'))
    expect(lastMap().load).toBe(first)

    // The 60-second tick advances the clock, so the rescan runs exactly then.
    await tick(59000)
    expect(lastMap().load).not.toBe(first)
  })

  it('tapping This month tile opens the monthly recap sheet', async () => {
    await mountStats()
    const monthTile = [...container.querySelectorAll('.tile')].find(tile =>
      tile.textContent.includes('This month')
    )
    expect(monthTile).toBeTruthy()
    await click(monthTile)
    expect(recapSheet).toHaveBeenCalled()
  })
})

it('shows a Profile custom exercise and its available progress controls before global registration', async () => {
  resetFixture([0, 1, 2].map(day => workout(`custom-${day}`, BASE_NOW - day * DAY, [
    entry('custom-press', [set(true, { rir: 2 })]),
  ])))
  mocks.S.customEx = [{ id: 'custom-press', n: 'Custom press', bp: 'chest', tg: 'pectorals', eq: 'barbell', sm: [] }]
  await mountStats()
  expect(container.textContent).toContain('Custom press')
  expect(buttonWithText(container, 'Est. 1RM')).toBeTruthy()
  expect(buttonWithText(container, 'Effort')).toBeTruthy()
  expect(container.querySelectorAll('.exercise-session-item')).toHaveLength(3)
})

it('keeps the Hard-set control usable when the selected window has only easy ratings', async () => {
  resetFixture([workout('easy', BASE_NOW, [entry('1254', [set(true, { rir: 5 })])])])
  await mountStats()
  await click(buttonWithText(muscleCard().querySelector('.card-head'), 'All'))
  expect(muscleCard().textContent).toContain('by sets worked')
  expect(buttonWithText(muscleCard().querySelector('.card-head'), 'All')).toBeTruthy()
})

it('refreshes the body-weight chart on the shared minute clock without a Workout card', async () => {
  resetFixture([])
  const edge = BASE_NOW - 90 * DAY + 30000
  mocks.S.bodyweight = [{ d: iso(edge), t: edge, w: 80 }, { d: iso(BASE_NOW), t: BASE_NOW, w: 79 }]
  await mountStats()
  const weightCard = [...container.querySelectorAll('.card')].find(card => card.querySelector('h2')?.textContent === 'Body weight')
  expect(weightCard).toBeTruthy()
  const chartDays = () => weightCard.querySelector('[data-chart-days]')?.getAttribute('data-chart-days')
  const before = chartDays()
  expect(before).toBeTruthy()
  await tick(60000)
  expect(chartDays()).not.toBe(before)
})

describe('MuscleBalance expansion and a11y', () => {
  function multiMuscleWorkouts() {
    return [
      workout('w-7muscles', BASE_NOW - DAY, [
        { id: 'ex-chest', muscleWeights: { chest: 1 }, sets: [set(true, { w: 100, r: 8 })] },
        { id: 'ex-quads', muscleWeights: { quadriceps: 1 }, sets: [set(true, { w: 120, r: 8 })] },
        { id: 'ex-hams', muscleWeights: { hamstring: 1 }, sets: [set(true, { w: 90, r: 8 })] },
        { id: 'ex-glutes', muscleWeights: { gluteal: 1 }, sets: [set(true, { w: 80, r: 8 })] },
        { id: 'ex-back', muscleWeights: { 'upper-back': 1 }, sets: [set(true, { w: 70, r: 8 })] },
        { id: 'ex-shoulders', muscleWeights: { deltoids: 1 }, sets: [set(true, { w: 50, r: 8 })] },
        { id: 'ex-biceps', muscleWeights: { biceps: 1 }, sets: [set(true, { w: 30, r: 8 })] },
      ]),
    ]
  }

  it('displays top 5 muscles by default and expands to show all worked muscles on toggle', async () => {
    resetFixture(multiMuscleWorkouts())
    await mountStats()

    const card = muscleCard()
    expect(card).toBeTruthy()

    // 7 muscles worked: default view shows top 5
    let rows = card.querySelectorAll('.mrow')
    expect(rows).toHaveLength(5)

    const toggleBtn = buttonWithText(card, 'Show all (7)')
    expect(toggleBtn).toBeTruthy()

    // Toggle expansion to show all
    await click(toggleBtn)
    rows = card.querySelectorAll('.mrow')
    expect(rows).toHaveLength(7)
    expect(buttonWithText(card, 'Show top 5')).toBeTruthy()

    // Toggle back to top 5
    await click(buttonWithText(card, 'Show top 5'))
    rows = card.querySelectorAll('.mrow')
    expect(rows).toHaveLength(5)
    expect(buttonWithText(card, 'Show all (7)')).toBeTruthy()
  })

  it('makes missed muscle chips interactive and selects muscle in inspector with a11y attributes', async () => {
    resetFixture(multiMuscleWorkouts())
    await mountStats()

    const card = muscleCard()
    const missedChip = card.querySelector('.mchip.miss')
    expect(missedChip).toBeTruthy()
    expect(missedChip.getAttribute('role')).toBe('button')
    expect(missedChip.getAttribute('tabindex')).toBe('0')

    // Click missed muscle chip
    await click(missedChip)

    const inspector = card.querySelector('.muscle-inspector')
    expect(inspector).toBeTruthy()
    expect(inspector.getAttribute('role')).toBe('status')
    expect(inspector.getAttribute('aria-live')).toBe('polite')
    expect(inspector.textContent).toContain('not trained')

    // Clear inspector
    await click(buttonWithText(inspector, 'Clear'))
    expect(card.querySelector('.muscle-inspector')).toBeNull()

    // Keyboard activation via Enter key
    const chipAgain = card.querySelector('.mchip.miss')
    await act(async () => {
      chipAgain.dispatchEvent(new dom.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(card.querySelector('.muscle-inspector')).toBeTruthy()
  })

  it('supplies rich getA11yLabel across Balance, Fatigue, and Strength views', async () => {
    resetFixture(multiMuscleWorkouts())
    await mountStats()

    // 1. Balance view
    expect(lastMap().getA11yLabel).toBeTypeOf('function')
    const balanceChest = lastMap().getA11yLabel('chest')
    expect(balanceChest).toMatch(/Chest.*effective sets/)
    const balanceCalves = lastMap().getA11yLabel('calves')
    expect(balanceCalves).toMatch(/Calves.*not trained/)

    // 2. Fatigue view
    await click(viewButton('Fatigue'))
    expect(lastMap().getA11yLabel).toBeTypeOf('function')
    const fatigueChest = lastMap().getA11yLabel('chest')
    expect(fatigueChest).toMatch(/Chest.*(Fatigued|Recovering|Ready)/)

    // 3. Strength view
    await click(viewButton('Strength'))
    expect(lastMap().getA11yLabel).toBeTypeOf('function')
    const strengthChest = lastMap().getA11yLabel('chest')
    expect(strengthChest).toMatch(/Chest.*%/)
  })
})
