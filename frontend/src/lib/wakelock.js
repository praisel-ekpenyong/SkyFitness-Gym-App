import { useEffect } from 'react'

/**
 * Reports whether the browser exposes the Screen Wake Lock API.
 * @returns {boolean} True when `navigator.wakeLock` exists; false otherwise.
 */
export const wakeLockSupported = () => 'wakeLock' in navigator

let sentinel = null
let wanted = false
let pending = false

async function acquire() {
  if (!wanted || sentinel || pending || !wakeLockSupported()) return
  if (document.visibilityState !== 'visible') return   // request() rejects on a hidden document
  pending = true
  try {
    const s = await navigator.wakeLock.request('screen')
    if (!wanted) { s.release().catch(() => {}); return }
    sentinel = s
    s.addEventListener('release', () => { if (sentinel === s) sentinel = null })
  } catch (e) {
    // iOS refuses in Low Power Mode, and some browsers refuse on low battery. Nothing to
    // do about it and nothing the user could act on — stay quiet and try again next time
    // the document becomes visible.
    sentinel = null
  } finally { pending = false }
}

const onVisible = () => { if (document.visibilityState === 'visible') acquire() }

/**
 * Declares the workout wants the screen on and takes the lock now.
 * @returns {void} Nothing; repeat calls while wanted are ignored and the lock re-acquires on every return to visible.
 */
export function requestWakeLock() {
  if (wanted) return
  wanted = true
  document.addEventListener('visibilitychange', onVisible)
  acquire()
}

/**
 * Declares the workout no longer needs the screen on and drops any held lock.
 * @returns {void} Nothing; stops re-acquiring and detaches the visibility listener.
 */
export function releaseWakeLock() {
  wanted = false
  document.removeEventListener('visibilitychange', onVisible)
  const s = sentinel
  sentinel = null
  if (s) s.release().catch(() => {})
}

export function useWakeLock(enabled) {
  useEffect(() => {
    if (!enabled) return
    requestWakeLock()
    return releaseWakeLock
  }, [enabled])
}
