// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ExerciseDetail } from './exercise-detail.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'
import { isoOf } from '../lib/dates.js'
import { useUI } from '../store/useUI.js'
import { fireEvent, within } from '@testing-library/react'

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
