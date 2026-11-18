import { describe, it, expect } from 'vitest'
import * as explain from './streak-explain.js'
import { weekExplanation, markLabel, markIcon } from './streak-explain.js'

describe('weekExplanation', () => {
  it('a counted week says so with its streak', () => {
    expect(weekExplanation({ state: 'counted', run: 3 })).toBe('You trained, so this week counts. Streak: 3.')
    expect(weekExplanation({ state: 'counted', run: 4 })).toBe('You trained, so this week counts. Streak: 4.')
  })

  it('formats the streak number like every other number', () => {
    expect(weekExplanation({ state: 'counted', run: 1234 })).toBe('You trained, so this week counts. Streak: 1,234.')
  })

  it('a broken week explains the streak started over, with no freeze talk', () => {
    expect(weekExplanation({ state: 'broke', run: 0 })).toBe('No workout, so the streak started over.')
  })

  it('a missed week and an open week have their own sentence', () => {
    expect(weekExplanation({ state: 'missed', run: 0 })).toBe('No workout this week.')
    expect(weekExplanation({ state: 'open', run: 2 })).toBe('Still open. One workout and it counts.')
  })
})

describe('markLabel', () => {
  it('names the week by its start day and its state', () => {
    expect(markLabel('3 Nov', 'counted')).toBe('Week of 3 Nov: counted')
    expect(markLabel('10 Nov', 'broke')).toBe('Week of 10 Nov: broke')
    expect(markLabel('17 Nov', 'open')).toBe('Week of 17 Nov: open')
  })
})

describe('markIcon', () => {
  it('gives each week state its icon, and an open week none', () => {
    expect(markIcon('counted')).toBe('check')
    expect(markIcon('broke')).toBe('xmark')
    expect(markIcon('missed')).toBe('minus')
    expect(markIcon('open')).toBeNull()
  })
})

describe('no Freezes or Freeze rules', () => {
  it('exports nothing for freezes or a rule picker', () => {
    expect(Object.keys(explain).sort()).toEqual(['markIcon', 'markLabel', 'weekExplanation'])
  })
})
