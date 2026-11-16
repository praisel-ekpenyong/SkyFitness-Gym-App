import { describe, expect, it } from 'vitest'
import { pairAdjacent, unpairSuperset, supersetUnits } from './supersetFlow.js'

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
