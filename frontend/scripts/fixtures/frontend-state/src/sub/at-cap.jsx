import { useState } from 'react'

export function AtCap() {
  const [a] = useState(0)
  const [b] = useState(0)
  const [c] = useState(0)
  const [d] = useState(0)
  return a + b + c + d
}
