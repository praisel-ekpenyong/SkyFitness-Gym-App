// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Barbell from './Barbell.jsx'

let container
let root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
})

// One side of the bar, inner plate first: [tone, size] per plate.
async function plates(weight, unit) {
  await act(async () => { root.render(<Barbell weight={weight} unit={unit} />) })
  const side = container.querySelectorAll('.bbell-side')[1]
  return [...side.children].map(p => [p.className.match(/pl-(\w+) /)[1], p.className.match(/pl-(\w+)$/)[1]])
}

describe('Barbell plate sizes', () => {
  it('draws each pound plate at the size of the kilo plate that shares its colour', async () => {
    const sizes = async (unit, bar, list) => {
      const out = []
      for (const plate of list) out.push(...await plates(bar + 2 * plate, unit))
      return out
    }
    const expected = [['blue', 'big'], ['yellow', 'mid'], ['green', 'small'], ['white', 'tiny'], ['red', 'change']]
    expect(await sizes('lb', 45, [45, 35, 25, 10, 5])).toEqual(expected)
    expect(await sizes('kg', 20, [20, 15, 10, 5, 2.5])).toEqual(expected)
  })
})
