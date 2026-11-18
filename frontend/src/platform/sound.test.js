import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  beep,
  vibrate,
  playSetComplete,
  playTimerWarning,
  playTimerComplete,
  playWorkoutComplete,
  _resetAudioContext,
} from './sound.js'

describe('sound and haptics engine', () => {
  let createdOscillators
  let createdGains
  let resumedCount
  let destination
  let audioContextInstances
  let originalWindow
  let originalNavigator

  beforeEach(() => {
    _resetAudioContext()
    createdOscillators = []
    createdGains = []
    resumedCount = 0
    destination = { id: 'destination' }
    audioContextInstances = []

    class FakeGainNode {
      constructor() {
        this.gain = {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        }
        this.connectedTo = null
      }
      connect(target) {
        this.connectedTo = target
      }
    }

    class FakeOscillatorNode {
      constructor() {
        this.frequency = { value: 0 }
        this.type = ''
        this.connectedTo = null
        this.startedAt = null
        this.stoppedAt = null
      }
      connect(target) {
        this.connectedTo = target
      }
      start(t) {
        this.startedAt = t
      }
      stop(t) {
        this.stoppedAt = t
      }
    }

    class FakeAudioContext {
      constructor() {
        this.state = 'running'
        this.currentTime = 100
        this.destination = destination
        audioContextInstances.push(this)
      }
      createOscillator() {
        const osc = new FakeOscillatorNode()
        createdOscillators.push(osc)
        return osc
      }
      createGain() {
        const gain = new FakeGainNode()
        createdGains.push(gain)
        return gain
      }
      async resume() {
        resumedCount++
        this.state = 'running'
      }
    }

    globalThis.window = {
      AudioContext: FakeAudioContext,
    }

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        vibrate: vi.fn(),
      },
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    _resetAudioContext()
    vi.restoreAllMocks()
  })

  describe('beep', () => {
    it('does nothing when enabled is false', () => {
      beep(false, 880, 0.15)
      expect(audioContextInstances.length).toBe(0)
      expect(createdOscillators.length).toBe(0)
    })

    it('synthesizes a tone with correct gain envelope and frequency when enabled is true', () => {
      beep(true, 1040, 0.12, 0.05)
      expect(audioContextInstances.length).toBe(1)
      expect(createdOscillators.length).toBe(1)
      expect(createdGains.length).toBe(1)

      const osc = createdOscillators[0]
      const gain = createdGains[0]

      expect(osc.frequency.value).toBe(1040)
      expect(osc.type).toBe('sine')
      expect(osc.connectedTo).toBe(gain)
      expect(gain.connectedTo).toBe(destination)

      const t0 = 100 + 0.05
      expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.001, t0)
      expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.35, t0 + 0.02)
      expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, t0 + 0.12)
      expect(osc.startedAt).toBe(t0)
      expect(osc.stoppedAt).toBe(t0 + 0.12 + 0.05)
    })

    it('resumes suspended AudioContext on iOS/Safari autoplay policies', () => {
      beep(true, 880)
      const ctx = audioContextInstances[0]
      ctx.state = 'suspended'

      beep(true, 880)
      expect(resumedCount).toBe(1)
    })

    it('swallows errors gracefully when AudioContext fails or throws', () => {
      globalThis.window.AudioContext = class {
        constructor() {
          throw new Error('Audio disabled by policy')
        }
      }
      expect(() => beep(true, 880)).not.toThrow()
    })
  })

  describe('vibrate', () => {
    it('dispatches pattern to navigator.vibrate', () => {
      vibrate([200, 100, 200])
      expect(navigator.vibrate).toHaveBeenCalledWith([200, 100, 200])
    })

    it('swallows errors when navigator.vibrate is missing or throws', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      })
      expect(() => vibrate(100)).not.toThrow()
    })
  })

  describe('semantic audio & haptic cue helpers', () => {
    it('playSetComplete plays a 1040Hz beep and 30ms haptic pulse', () => {
      playSetComplete(true)
      expect(createdOscillators.length).toBe(1)
      expect(createdOscillators[0].frequency.value).toBe(1040)
      expect(navigator.vibrate).toHaveBeenCalledWith(30)
    })

    it('playTimerWarning plays a 660Hz tone', () => {
      playTimerWarning(true)
      expect(createdOscillators.length).toBe(1)
      expect(createdOscillators[0].frequency.value).toBe(660)
    })

    it('playTimerComplete schedules 3 tones and a triple vibration pulse', () => {
      playTimerComplete(true)
      expect(createdOscillators.length).toBe(3)
      expect(createdOscillators.map(o => o.frequency.value)).toEqual([880, 880, 1320])
      expect(navigator.vibrate).toHaveBeenCalledWith([200, 100, 200])
    })

    it('playWorkoutComplete schedules an ascending fanfare (880Hz, 1100Hz, 1320Hz)', () => {
      playWorkoutComplete(true)
      expect(createdOscillators.length).toBe(3)
      expect(createdOscillators.map(o => o.frequency.value)).toEqual([880, 1100, 1320])
    })
  })
})
