// WebAudio beeps + haptics (ported from the vanilla app). `enabled` gates sound.
let audioCtx = null

/**
 * Returns the shared WebAudio context for timer and set cues, resuming it when suspended.
 * @returns {AudioContext|null} Shared context, or null outside a browser or without WebAudio support.
 */
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

/**
 * Plays one short sine cue through the shared audio context.
 * @param {boolean} enabled - When falsy nothing plays and no context is created.
 * @param {number} freq - Tone frequency in hertz; missing reads as 880.
 * @param {number} dur - Audible length in seconds; missing reads as 0.18 with a short release tail.
 * @param {number} when - Delay in seconds after now; missing plays immediately.
 * @returns {void} Nothing; failures stay silent so a missed cue never breaks a set.
 */
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
  } catch (e) { /* best-effort: a failed beep must never break a set tick */ }
}

/**
 * Fires a haptic cue where the device supports it.
 * @param {number|number[]} p - Pattern in milliseconds passed straight to the device vibrator.
 * @returns {void} Nothing; missing support or failures stay silent.
 */
export function vibrate(p) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(p)
    }
  } catch (e) { /* haptics are best-effort too */ }
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
