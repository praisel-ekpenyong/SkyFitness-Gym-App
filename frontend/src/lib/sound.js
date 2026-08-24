// WebAudio beeps + haptics (ported from the vanilla app). `enabled` gates sound.
let audioCtx = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null
  if (!audioCtx) {
    audioCtx = new AudioContextClass()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

export function beep(enabled, freq, dur, when) {
  if (!enabled) return
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.frequency.value = freq || 880
    o.type = 'sine'
    const t0 = ctx.currentTime + (when || 0)
    g.gain.setValueAtTime(0.001, t0)
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + (dur || 0.18))
    o.start(t0)
    o.stop(t0 + (dur || 0.18) + 0.05)
  } catch (e) { /* */ }
}

export function vibrate(p) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(p)
    }
  } catch (e) { /* */ }
}

/** Play short acoustic & haptic confirmation when checking off a set. */
export function playSetComplete(enabled) {
  beep(enabled, 1040, 0.12)
  vibrate(30)
}

/** Play countdown warning tone (3s / 2s / 1s remaining). */
export function playTimerWarning(enabled) {
  beep(enabled, 660, 0.1)
}

/** Play countdown finish fanfare (880Hz -> 880Hz -> 1320Hz) + triple vibration pulse. */
export function playTimerComplete(enabled) {
  beep(enabled, 880, 0.15)
  beep(enabled, 880, 0.15, 0.25)
  beep(enabled, 1320, 0.4, 0.5)
  vibrate([200, 100, 200])
}

/** Play celebratory chime upon completing the entire workout session. */
export function playWorkoutComplete(enabled) {
  beep(enabled, 880, 0.15)
  beep(enabled, 1100, 0.15, 0.18)
  beep(enabled, 1320, 0.3, 0.36)
}

/** Internal helper for test resetting */
export function _resetAudioContext() {
  audioCtx = null
}
