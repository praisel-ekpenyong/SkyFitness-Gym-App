import { describe, it, expect } from 'vitest'
import { seedPlanInto } from './seed.js'
import { validateEnv } from '../env.js'

const empty = () => ({ routines: [], week: {}, customEx: [], restSec: 90 })

describe('dev seed plan', () => {
  it('preloads the named plan into an empty profile without mutating it', () => {
    const S = empty()
    const out = seedPlanInto(S, 'hypertrophy-5day')
    expect(out).not.toBe(S)
    expect(S.routines).toHaveLength(0)
    expect(out.routines.map(r => r.name)).toEqual(['Upper', 'Lower', 'Push', 'Pull', 'Legs'])
  })

  it('never touches a profile that already has routines', () => {
    const S = { ...empty(), routines: [{ id: 'r1', name: 'Mine', ex: [] }] }
    expect(seedPlanInto(S, 'hypertrophy-5day')).toBe(S)
  })

  it('ignores an unknown or missing name', () => {
    const S = empty()
    expect(seedPlanInto(S, 'nope')).toBe(S)
    expect(seedPlanInto(S, undefined)).toBe(S)
  })

  it('reads VITE_SEED_PLAN only outside production builds', () => {
    expect(validateEnv({ VITE_SEED_PLAN: 'hypertrophy-5day' }).seedPlan).toBe('hypertrophy-5day')
    expect(validateEnv({ VITE_SEED_PLAN: 'hypertrophy-5day', PROD: true }).seedPlan).toBeUndefined()
    expect(validateEnv({}).seedPlan).toBeUndefined()
  })
})
