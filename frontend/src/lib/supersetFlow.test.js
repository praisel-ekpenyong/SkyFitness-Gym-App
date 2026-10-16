import { describe, expect, it } from 'vitest'
import { setProgressHighWater, supersetFlowStep, pairAdjacent, unpairSuperset, supersetUnits } from './supersetFlow.js'

const entry = done => ({ sets: done.map(value => ({ done: value })) })

describe('supersetFlowStep', () => {
  it('does not create navigation or rest flow for a normal singleton exercise', () => {
    const entries = [entry([true]), entry([false])]
    expect(supersetFlowStep(entries, [0], 0)).toBeNull()
  })

  it('does not count an uncheck/re-check of previously completed work as new progress', () => {
    const finished = entry([true, true, true])
    expect(setProgressHighWater(finished, 3)).toEqual({ isNew: false, highWater: 3 })
    expect(setProgressHighWater(finished, 2)).toEqual({ isNew: true, highWater: 3 })
  })

  it('skips a spent short member and uses the last member with work as the round boundary', () => {
    // A has just completed set two of three; B's only set was completed last round.
    const entries = [entry([true, true, false]), entry([true])]
    expect(supersetFlowStep(entries, [0, 1], 0)).toEqual({
      unitDone: false,
      roundDone: true,
      nextIdx: 0
    })
  })

  it('wraps to the next member with work at a normal round boundary', () => {
    const entries = [entry([true, false, false]), entry([true])]
    expect(supersetFlowStep(entries, [0, 1], 1)).toEqual({
      unitDone: false,
      roundDone: true,
      nextIdx: 0
    })
  })
})

describe('pairAdjacent / unpairSuperset', () => {
  it('pairs adjacent entries under one sg-{i}-{j} id without mutating the source', () => {
    const entries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const paired = pairAdjacent(entries, 1, 2)

    expect(paired[1].sg).toBe('sg-1-2')
    expect(paired[2].sg).toBe('sg-1-2')
    expect(paired[0].sg).toBeUndefined()
    expect(entries).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    expect(supersetUnits(paired)).toEqual([[0], [1, 2]])
  })

  it('reuses the existing group id when one member is already paired', () => {
    const entries = [{ id: 'a', sg: 'sg-0-1' }, { id: 'b', sg: 'sg-0-1' }, { id: 'c' }]
    const paired = pairAdjacent(entries, 1, 2)

    expect(paired.map(e => e.sg)).toEqual(['sg-0-1', 'sg-0-1', 'sg-0-1'])
  })

  it('unpairs one entry and prunes partners left without an adjacent mate', () => {
    const entries = [
      { id: 'a', sg: 'sg-0-2' }, { id: 'b', sg: 'sg-0-2' }, { id: 'c', sg: 'sg-0-2' }
    ]
    const unpaired = unpairSuperset(entries, 1)

    expect(unpaired.every(e => e.sg === undefined)).toBe(true)
    expect(entries.map(e => e.sg)).toEqual(['sg-0-2', 'sg-0-2', 'sg-0-2'])
  })

  it('rejects a non-adjacent pairing request', () => {
    const entries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

    expect(() => pairAdjacent(entries, 0, 2)).toThrow(/adjacent/)
    expect(entries).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
  })
})
