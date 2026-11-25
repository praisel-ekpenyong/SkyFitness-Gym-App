// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from './useStore.js'
import { DEF, normalizeState } from '../lib/profile/index.js'
import { useUI } from './useUI.js'
import { __setSinksForTests, __setLocalWriteForTests, flush, LOCAL_KEY } from '../platform/storage.js'
import { selectStatsOverview } from '../lib/stats-selectors.js'
import { switchTrainingStyle, setVolumeRange } from '../lib/volume-ranges.js'
import { buildPlanBundle, parsePlan, mergePlan } from '../lib/plan-share.js'

vi.mock('../platform/sound.js', async orig => (await import('../test/platform-mocks.js')).mockSound(await orig()))
vi.mock('../platform/mobile.js', async orig => (await import('../test/platform-mocks.js')).mockMobile(await orig()))

const NOW = Date.UTC(2026, 6, 1, 12)
const cloneDef = () => JSON.parse(JSON.stringify(DEF))
const ranges = () => {
  const { muscles } = selectStatsOverview(useStore.getState().S, { now: NOW }).weeklyVolume
  return Object.fromEntries(Object.entries(muscles).map(([slug, m]) => [slug, { range: m.range, edited: m.edited }]))
}
const exportJSON = () => JSON.stringify(useStore.getState().S, null, 2)

beforeEach(() => {
  localStorage.clear()
  __setSinksForTests([{ id: 'fake', read: async () => null, write: () => {} }])
  __setLocalWriteForTests()
  useStore.getState().replaceState(cloneDef())
  useUI.setState({ toastMsg: '' })
  flush()
})

afterEach(() => {
  __setSinksForTests()
  __setLocalWriteForTests()
  flush()
})

describe('volume settings travel with the Profile', () => {
  it('a backup carries the training style and range edits through Restore', async () => {
    const { restoreFromBackup, resetProfile } = await import('../platform/restore.js')
    useStore.getState().update(s => {
      s.routines = [{ id: 'r1', name: 'Push', ex: [{ id: '0025' }] }]
      switchTrainingStyle(s, 'high')
      setVolumeRange(s, 'chest', [6, 12])
    })
    const before = ranges()
    const backup = exportJSON()
    resetProfile()
    expect(ranges().chest).toEqual({ range: [10, 20], edited: false })

    restoreFromBackup(JSON.parse(backup))
    expect(ranges()).toEqual(before)
    expect(ranges().chest).toEqual({ range: [6, 12], edited: true })
    expect(ranges().lats).toEqual({ range: [14, 26], edited: false })
    flush()
    const persisted = JSON.parse(localStorage.getItem(LOCAL_KEY))
    expect(persisted.trainingStyle).toBe('high')
    expect(persisted.volumeRanges).toEqual({ chest: [6, 12] })
  })

  it('Reset returns Standard with no edits', async () => {
    const { resetProfile } = await import('../platform/restore.js')
    useStore.getState().update(s => { switchTrainingStyle(s, 'low'); setVolumeRange(s, 'biceps', [1, 5]) })
    resetProfile()
    const S = useStore.getState().S
    expect(S.trainingStyle).toBe('standard')
    expect(S.volumeRanges).toEqual({})
    expect(ranges().biceps).toEqual({ range: [8, 18], edited: false })
  })

  it('the plan file never carries them, and importing a plan leaves the lifter\'s own alone', () => {
    useStore.getState().update(s => {
      s.routines = [{ id: 'r1', name: 'Push', ex: [{ id: '0025' }] }]
      switchTrainingStyle(s, 'high')
      setVolumeRange(s, 'chest', [6, 12])
    })
    const bundle = buildPlanBundle(useStore.getState().S, 'Mine')
    expect(JSON.stringify(bundle)).not.toMatch(/trainingStyle|volumeRanges/)

    const foreign = { ...bundle, trainingStyle: 'low', volumeRanges: { chest: [1, 2] } }
    useStore.getState().update(s => { mergePlan(s, parsePlan(JSON.stringify(foreign))) })
    expect(useStore.getState().S.trainingStyle).toBe('high')
    expect(ranges().chest).toEqual({ range: [6, 12], edited: true })
  })

  it('invalid stored ranges and styles are ignored on Restore and on load', async () => {
    const { restoreFromBackup } = await import('../platform/restore.js')
    const junk = { trainingStyle: 'extreme', volumeRanges: { chest: [12, 8], lats: [3, 99], biceps: [2.5, 9], trapezius: [1, 4], calves: [5, 9] } }
    restoreFromBackup({ ...cloneDef(), ...junk })
    const r = ranges()
    expect(r.chest).toEqual({ range: [10, 20], edited: false })
    expect(r.lats).toEqual({ range: [10, 20], edited: false })
    expect(r.biceps).toEqual({ range: [8, 18], edited: false })
    expect(r.trapezius).toEqual({ range: null, edited: false })
    expect(r.calves).toEqual({ range: [5, 9], edited: true })

    const S = normalizeState({ ...cloneDef(), ...junk }, Date.now())
    expect(S.trainingStyle).toBe('standard')
    expect(S.volumeRanges).toEqual({ calves: [5, 9] })
    expect(normalizeState({ ...cloneDef(), volumeRanges: 'nope' }, Date.now()).volumeRanges).toEqual({})
  })
})
