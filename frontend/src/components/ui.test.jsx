// @vitest-environment happy-dom
import { act, StrictMode, Suspense, startTransition, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NumberField } from './ui.jsx'

let container
let root
let setOutside

function Weight({ initial }) {
  const [value, setValue] = useState(initial)
  setOutside = setValue
  return <NumberField value={value} onChange={setValue} aria-label="Weight" />
}

const input = () => container.querySelector('[aria-label="Weight"]')

function type(text) {
  act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input(), text)
    input().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<StrictMode><Weight initial={50} /></StrictMode>))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('NumberField under StrictMode', () => {
  it('keeps a half-typed decimal the stored number cannot show', () => {
    type('62.')
    expect(input().value).toBe('62.')
    type('62,5')
    expect(input().value).toBe('62.5')
  })

  it('drops the draft and shows the new value when the stored value changes from outside', () => {
    type('62.')
    act(() => setOutside(80))
    expect(input().value).toBe('80')
    type('80.')
    expect(input().value).toBe('80.')
  })

  it('shows the outside value even when it changes back to what was last typed', () => {
    type('62.')
    act(() => setOutside(80))
    act(() => setOutside(62))
    expect(input().value).toBe('62')
  })
})

// A render React discards (here: a transition that suspends) must not leave the field believing
// the outside value changed, or the next urgent render throws the lifter's draft away.
describe('NumberField when a render is discarded', () => {
  const never = new Promise(() => {})
  function Suspends({ when }) {
    if (when) throw never
    return null
  }
  let rerender
  function Page() {
    const [value, setValue] = useState(50)
    const [, setTick] = useState(0)
    setOutside = setValue
    rerender = () => setTick(n => n + 1)
    return <Suspense fallback="loading">
      <NumberField value={value} onChange={setValue} aria-label="Weight" />
      <Suspends when={value === 80} />
    </Suspense>
  }

  it('keeps the draft after an outside change that never commits', () => {
    act(() => root.render(<StrictMode><Page /></StrictMode>))
    type('62.')
    act(() => startTransition(() => setOutside(80)))
    expect(input().value).toBe('62.')
    act(() => rerender())
    expect(input().value).toBe('62.')
  })
})
