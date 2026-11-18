import { describe, it, expect } from 'vitest'
import { weekExplanation, markLabel, freezeLine } from './streak-explain.js'

describe('weekExplanation', () => {
  it('a counted week says so with its streak, and names an earned freeze', () => {
    expect(weekExplanation({ state: 'counted', run: 3, earned: false }, 'gentle'))
      .toBe('You trained, so this week counts. Streak: 3.')
    expect(weekExplanation({ state: 'counted', run: 4, earned: true }, 'gentle'))
      .toBe('You trained, so this week counts. Streak: 4. It also earned a freeze.')
  })

  it('a frozen week says a freeze covered it and adds nothing', () => {
    expect(weekExplanation({ state: 'frozen', run: 4, earned: false }, 'gentle'))
      .toBe('No workout, so a freeze covered it. The streak kept going, but this week adds nothing.')
  })

  it('a broken week explains the streak started over, Strict naming its rule', () => {
    expect(weekExplanation({ state: 'broke', run: 0, earned: false }, 'gentle'))
      .toBe('No workout and no freeze left, so the streak started over.')
    expect(weekExplanation({ state: 'broke', run: 0, earned: false }, 'generous'))
      .toBe('No workout and no freeze left, so the streak started over.')
    expect(weekExplanation({ state: 'broke', run: 0, earned: false }, 'strict'))
      .toBe('No workout, and your rule has no freezes, so the streak started over.')
  })

  it('a missed week and an open week have their own sentence', () => {
    expect(weekExplanation({ state: 'missed', run: 0, earned: false }, 'gentle')).toBe('No workout this week.')
    expect(weekExplanation({ state: 'open', run: 2, earned: false }, 'gentle'))
      .toBe('Still open. One workout and it counts.')
  })
})

describe('markLabel', () => {
  it('names the week by its start day and its state', () => {
    expect(markLabel('3 Nov', 'counted')).toBe('Week of 3 Nov: counted')
    expect(markLabel('10 Nov', 'broke')).toBe('Week of 10 Nov: broke')
    expect(markLabel('17 Nov', 'open')).toBe('Week of 17 Nov: open')
  })
})

describe('freezeLine', () => {
  it('Strict has no freezes to bank', () => {
    expect(freezeLine({ rule: 'strict', freezes: 0, toNextFreeze: 4 })).toBe('Strict rule: no freezes are banked.')
  })

  it('a bank with room says how many counted weeks earn the next freeze', () => {
    expect(freezeLine({ rule: 'gentle', freezes: 0, toNextFreeze: 4 })).toBe('Next freeze in 4 counted weeks.')
    expect(freezeLine({ rule: 'gentle', freezes: 0, toNextFreeze: 1 })).toBe('Next freeze in 1 counted week.')
  })

  it('a full bank says the next freeze would be lost', () => {
    expect(freezeLine({ rule: 'gentle', freezes: 1, toNextFreeze: 2 })).toBe('Bank full: the next freeze would be lost.')
  })
})
