import { describe, it, expect } from 'vitest'
import { setsDoneActive, workSetsDone } from './lib/history.js'

describe('probe: what finishWorkout decides', () => {
  it('shows the button and the confirm disagreeing', () => {
    // One exercise, one warm-up row left unticked, both work sets ticked.
    const A = {
      entries: [{
        id: '0025',
        sets: [
          { w: 40, r: 5, done: false, phase: 'warmup', warmup: true },
          { w: 100, r: 8, done: true },
          { w: 100, r: 8, done: true },
        ],
      }],
    }
    const done = setsDoneActive(A)                       // session.jsx:136, unchanged
    const total = A.entries.reduce((n, e) => n + e.sets.length, 0)  // session.jsx:137, unchanged
    const workDone = workSetsDone(A)                      // already imported in session.jsx:6
    const workTotal = A.entries.reduce((n, e) => n + e.sets.filter(s => !s.warmup).length, 0)
    console.log('row-based  ->', JSON.stringify({ done, total, early: done < total, gapN: total - done }))
    console.log('work-based ->', JSON.stringify({ workDone, workTotal, early: workDone < workTotal }))
    expect(done < total).toBe(true)      // the confirm says "Finish early?"
    expect(workDone < workTotal).toBe(false)  // the button says "Finish workout"
  })
})
