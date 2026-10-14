// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Switch, Segmented } from './ui.jsx'
import BodyMap from './BodyMap.jsx'
import { MUSCLES, INERT, MUSCLE_NAME } from '../lib/muscles.js'

let container
let root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  if (container) container.remove()
  root = null
  container = null
})

async function render(el) {
  await act(async () => { root.render(el) })
}

describe('accessibility rendered-role seam', () => {
  it('shared switch exposes its visible label as its accessible name', async () => {
    await render(<Switch checked={false} onChange={() => {}} label="Sounds" />)
    const btn = container.querySelector('[role="switch"]')
    expect(btn).toBeTruthy()
    expect(btn.getAttribute('aria-label')).toBe('Sounds')
    expect(btn.getAttribute('aria-checked')).toBe('false')
  })

  it('single-select group announces as a radiogroup with radio options', async () => {
    const onChange = vi.fn()
    await render(
      <Segmented
        label="Weight unit"
        options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]}
        value="kg"
        onChange={onChange}
      />,
    )
    const group = container.querySelector('[role="radiogroup"]')
    expect(group).toBeTruthy()
    expect(group.getAttribute('aria-label')).toBe('Weight unit')
    const radios = [...container.querySelectorAll('[role="radio"]')]
    expect(radios).toHaveLength(2)
    const names = radios.map(r => r.getAttribute('aria-label') || r.textContent.trim())
    expect(names).toEqual(['kg', 'lb'])
    expect(radios[0].getAttribute('aria-checked')).toBe('true')
    expect(radios[1].getAttribute('aria-checked')).toBe('false')
    // activation still works through the radio role
    await act(async () => {
      radios[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith('lb')
  })

  it('body map gives each drawable muscle exactly one tab stop with activation; inert stays inert', async () => {
    const onMuscle = vi.fn()
    await render(<BodyMap load={{}} onMuscle={onMuscle} />)
    // BodyMap geometry loads async — wait for interactive muscles to appear.
    const deadline = Date.now() + 3000
    let stops = []
    while (Date.now() < deadline) {
      await act(async () => { await new Promise(r => setTimeout(r, 25)) })
      stops = [...container.querySelectorAll('[tabindex="0"]')]
      if (stops.length > 0) {
        // wait one more tick to let both front+back views settle
        await act(async () => { await new Promise(r => setTimeout(r, 50)) })
        stops = [...container.querySelectorAll('[tabindex="0"]')]
        if (stops.length >= MUSCLES.length) break
        // if stable but wrong count, keep waiting until deadline
        const stable = [...container.querySelectorAll('[tabindex="0"]')].length
        if (stable === stops.length && Date.now() > deadline - 2000 && stable > 0) break
      }
    }
    stops = [...container.querySelectorAll('[tabindex="0"]')]
    expect(stops).toHaveLength(MUSCLES.length)

    const labelled = [...container.querySelectorAll('[role="button"][aria-label]')]
    expect(labelled).toHaveLength(MUSCLES.length)
    const labels = labelled.map(el => el.getAttribute('aria-label')).sort()
    const expected = MUSCLES.map(slug => MUSCLE_NAME[slug]).sort()
    expect(labels).toEqual(expected)

    // Inert silhouette regions never take a tab stop and expose no interactive role.
    const inertInteractive = [...container.querySelectorAll('.bm-sil[tabindex], .bm-sil[role]')]
    expect(inertInteractive).toHaveLength(0)

    // Keyboard activation on the single stop calls back with that muscle.
    const first = labelled[0]
    const before = onMuscle.mock.calls.length
    await act(async () => {
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onMuscle.mock.calls.length).toBe(before + 1)
  })
})
