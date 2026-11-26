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
        this.state = 'suspended'
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

    it('plays one audible tone that is started, stopped later, and routed to the speakers', () => {
      beep(true, 1040, 0.12, 0.05)
      expect(audioContextInstances.length).toBe(1)
      expect(createdOscillators.length).toBe(1)

      const osc = createdOscillators[0]
      const gain = createdGains[0]
      expect(osc.frequency.value).toBe(1040)
      expect(osc.connectedTo).toBe(gain)
      expect(gain.connectedTo).toBe(destination)
      expect(osc.startedAt).toBeGreaterThanOrEqual(100 + 0.05)
      expect(osc.stoppedAt).toBeGreaterThan(osc.startedAt)
    })

    it('resumes the context a browser creates suspended under its autoplay policy', () => {
      beep(true, 880)
      expect(resumedCount).toBe(1)
    })

    it('resumes the context again when the browser suspends it later, as iOS does after backgrounding', () => {
      beep(true, 880)
      const resumedFirst = resumedCount
      audioContextInstances[0].state = 'suspended'

      beep(true, 880)
      expect(resumedCount).toBe(resumedFirst + 1)
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
    it('playSetComplete plays one short tone and a haptic pulse', () => {
      playSetComplete(true)
      expect(createdOscillators.length).toBe(1)
      expect(navigator.vibrate).toHaveBeenCalledOnce()
    })

    it('a cue is silent when sound is off', () => {
      for (const cue of [playSetComplete, playTimerWarning, playTimerComplete, playWorkoutComplete]) cue(false)
      expect(createdOscillators.length).toBe(0)
    })

    it('playTimerWarning plays a single tone', () => {
      playTimerWarning(true)
      expect(createdOscillators.length).toBe(1)
    })

    it('playTimerComplete is a multi-tone alert with a vibration pattern', () => {
      playTimerComplete(true)
      expect(createdOscillators.length).toBeGreaterThan(1)
      expect(navigator.vibrate).toHaveBeenCalledOnce()
    })

    it('playWorkoutComplete plays a rising fanfare', () => {
      playWorkoutComplete(true)
      const pitches = createdOscillators.map(o => o.frequency.value)
      expect(pitches.length).toBeGreaterThan(1)
      expect(pitches).toEqual([...pitches].sort((a, b) => a - b))
    })
  })
})
