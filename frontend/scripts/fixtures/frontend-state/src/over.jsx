// Five useState calls: one over the cap, for check-frontend-state.test.mjs.
import { useState } from 'react'

export function Over() {
  const [a] = useState(0)
  const [b] = useState(0)
  const [c] = useState(0)
  const [d] = useState(0)
  const [e] = useState(0)
  return a + b + c + d + e
}
