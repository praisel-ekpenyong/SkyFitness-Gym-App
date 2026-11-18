// iOS Safari evicts website data under storage pressure, so the log's only home can't be localStorage alone.

import { MOBILE, nativeLoad, nativeSave } from './mobile.js'

export const LOCAL_KEY = 'gym_state_v1'

/**
 * Reads the last synchronously saved snapshot from localStorage.
 * @returns {Object|null} Parsed snapshot, or null when absent or unreadable.
 */
export function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (e) { return null }
}

const DB = 'sky-state'
const STORE = 'state'
const KEY = 'state'

let dbp = null

function openDB() {
  if (!('indexedDB' in globalThis)) return null   // tests / very old browsers: mirror is off
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }).catch(() => { dbp = null; return null })
  }
  return dbp
}

/**
 * Reads the newest mirrored snapshot from IndexedDB for the boot race.
 * @returns {Promise<Object|null>} Stored snapshot, or null when missing, unavailable, or unreadable.
 */
export async function idbLoad() {
  try {
    const db = await openDB()
    if (!db) return null
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE).objectStore(STORE).get(KEY)
      tx.onsuccess = () => resolve(tx.result || null)
      tx.onerror = () => resolve(null)
    })
  } catch (e) { return null }
}

/**
 * Writes a snapshot to the IndexedDB mirror without disturbing the localStorage copy.
 * @param {Object} snapshot - Stamped state snapshot to mirror.
 * @returns {Promise<void>} Resolves once the mirror write completes; failures stay silent.
 */
export async function idbSave(snapshot) {
  try {
    const db = await openDB()
    if (!db) return
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(snapshot, KEY)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {  }
}

export const idbSink = { id: 'idb', read: idbLoad, write: idbSave }

let sinks = [idbSink]

export function registerSink(sink) {
  sinks.push(sink)
}

export function __setSinksForTests(list) {
  sinks = list || [idbSink]
}

const DRAIN_MS = 800

let tm = null
let pending = null

function drain() {
  tm = null
  const snapshot = pending
  pending = null
  if (snapshot) for (const sink of sinks) {
    try {
      const r = sink.write(snapshot)
      if (r && typeof r.catch === 'function') r.catch(() => {})
    } catch (e) {  }
  }
}

/**
 * Writes the pending snapshot to every mirror immediately instead of waiting for the debounce.
 * @returns {void} Nothing; a no-op when nothing is pending.
 */
export function flush() {
  if (tm == null) return
  clearTimeout(tm)
  drain()
}

function isStorageDenied(e) {
  if (!e) return false
  const name = e.name || ''
  const code = e.code
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014) return true
  if (name === 'SecurityError' || name === 'NotAllowedError' || code === 18 || code === 1000) return true
  // Last resort: message sniffing, DOMExceptions only — a programmer TypeError
  // that happens to mention e.g. "permission" must stay loud, not degrade.
  if (typeof DOMException !== 'function' || !(e instanceof DOMException)) return false
  const msg = String(e.message || '').toLowerCase()
  return DENIED_MSGS.some(m => msg.includes(m))
}

const DENIED_MSGS = ['quota', 'exceeded', 'security', 'denied', 'blocked', 'not allowed', 'access is denied', 'permission']

let blockedWrites = false

export function isStorageBlocked() {
  return blockedWrites
}

export function __resetStorageBlockedForTests() {
  blockedWrites = false
}

// Per-instance stubbing of the frozen happy-dom Storage never lands — verified by probe — so denial goes through here.
let localWriteImpl = (key, value) => localStorage.setItem(key, value)

export function __setLocalWriteForTests(fn) {
  localWriteImpl = fn || ((key, value) => localStorage.setItem(key, value))
}

export function save(snapshot) {
  snapshot._ts = Date.now()
  try {
    localWriteImpl(LOCAL_KEY, JSON.stringify(snapshot))
    blockedWrites = false
  } catch (e) {
    if (!isStorageDenied(e)) throw e
    blockedWrites = true
  }
  clearTimeout(tm)
  pending = { ...snapshot }
  tm = setTimeout(drain, DRAIN_MS)
  return !blockedWrites
}

export const BACKUP_NAG_MS = 14 * 24 * 60 * 60 * 1000

/**
 * Tells callers whether the backup reminder should show now.
 * @param {number} lastExportTs - Millisecond timestamp of the last successful export; missing means never backed up.
 * @param {number} now - Current millisecond timestamp the caller supplies.
 * @returns {boolean} True when never exported or the last export is older than two weeks; false otherwise, including future stamps.
 */
export function backupDue(lastExportTs, now) {
  return !lastExportTs || now - lastExportTs > BACKUP_NAG_MS
}

export function pickNewest(local, mirror) {
  const mts = mirror ? mirror.ts || 0 : 0
  if (mts && (!local || (local.ts || 0) < mts)) return mirror.state
  return local ? local.state : null
}

export async function load({ running, hasData, overlay }) {
  if (MOBILE) {
    const saved = await nativeLoad()
    if (saved && (!hasData(running) || (saved._ts || 0) >= (running._ts || 0))) {
      return overlay(saved)
    }
    if (!saved && hasData(running)) {
      const native = sinks.find(s => s.id === 'native')
      if (native) native.write(running?._ts ? running : { ...running, _ts: Date.now() })
    }
    return null
  }

  const raw = loadLocal()
  const local = raw ? { ts: raw._ts, state: raw } : null
  const mirrorSink = sinks.find(s => s.id !== 'native')
  const stored = mirrorSink ? await mirrorSink.read() : null
  const mirror = stored ? { ts: stored._ts, state: stored } : null
  const winner = pickNewest(local, mirror)

  if (winner && (!hasData(running) || (winner._ts || 0) > (running._ts || 0))) {
    return overlay(winner)
  }
  if (!mirror && hasData(running) && mirrorSink) {
    mirrorSink.write(running?._ts ? running : { ...running, _ts: Date.now() })
  }
  return null
}

export function validateBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.workouts) || !Array.isArray(data.routines)) {
    throw new Error('not a Sky backup')
  }
  return true
}

const isPlainRecord = v => v && typeof v === 'object' && !Array.isArray(v)
const isGoodWorkoutEntry = e => isPlainRecord(e) && typeof e.id === 'string' && e.id.length > 0 && Array.isArray(e.sets)
const isGoodWorkout = w => isPlainRecord(w) && Array.isArray(w.entries)
const isGoodRoutineEx = e => isPlainRecord(e) && typeof e.id === 'string' && e.id.length > 0
const isGoodRoutine = r => isPlainRecord(r) && typeof r.id === 'string' && r.id.length > 0 && Array.isArray(r.ex)

const RESTORE_TOP_KEYS = [
  'unit', 'restSec', 'sound', 'keepAwake', 'theme', 'accent', 'body', 'targetW',
  'bodyweight', 'routines', 'week', 'dayPlan', 'exWeights', 'workouts', 'customEx',
  'gifSize', 'favorites', 'reminder', 'effort', 'lastExport', 'displayName',
  'trainingStyle', 'volumeRanges'
]

export function sanitizeRestorePayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { clean: data, skipped: 0 }
  let skipped = 0
  let workouts
  if (Array.isArray(data.workouts)) {
    workouts = []
    for (const w of data.workouts) {
      if (!isGoodWorkout(w)) { skipped++; continue }
      const entries = []
      for (const e of w.entries) {
        if (!isGoodWorkoutEntry(e)) { skipped++; continue }
        entries.push(e)
      }
      workouts.push({ ...w, entries })
    }
  }
  let routines
  if (Array.isArray(data.routines)) {
    routines = []
    for (const r of data.routines) {
      if (!isGoodRoutine(r)) { skipped++; continue }
      const ex = []
      for (const e of r.ex) {
        if (!isGoodRoutineEx(e)) { skipped++; continue }
        ex.push(e)
      }
      routines.push({ ...r, ex })
    }
  }
  const clean = { active: null }
  for (const k of RESTORE_TOP_KEYS) {
    if (data[k] !== undefined) clean[k] = data[k]
  }
  if (workouts !== undefined) clean.workouts = workouts
  if (routines !== undefined) {
    clean.routines = routines
    const ids = new Set(routines.map(r => r.id))
    if (data.dayPlan && typeof data.dayPlan === 'object' && !Array.isArray(data.dayPlan)) {
      const dayPlan = { ...data.dayPlan }
      for (const k of Object.keys(dayPlan)) {
        const v = dayPlan[k]
        if (v !== 'rest' && !ids.has(v)) delete dayPlan[k]
      }
      clean.dayPlan = dayPlan
    }
  }
  return { clean, skipped }
}

/**
 * Returns a backup-safe copy of a profile with malformed workouts and routines stripped.
 * @param {Object} data - Raw profile payload of any shape; non-objects pass through unchanged.
 * @returns {Object} Cleaned profile limited to known top-level keys with `active` cleared; stale day-plan overrides pruned.
 */
export function sanitizeBackup(data) {
  if (!data || typeof data !== 'object') return data
  return sanitizeRestorePayload(data).clean
}

export function onStorageSync(callback) {
  if (typeof window === 'undefined' || !window.addEventListener) return () => {}
  const listener = ev => {
    if (ev.key !== LOCAL_KEY || !ev.newValue) return
    try {
      const incoming = JSON.parse(ev.newValue)
      if (incoming && typeof incoming === 'object') {
        callback(incoming)
      }
    } catch {}
  }
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}
