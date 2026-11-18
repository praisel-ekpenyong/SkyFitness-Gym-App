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
 * @returns {Promise<void>} Resolves once the mirror write completes; rejects when the write fails so the drain can record it.
 */
export async function idbSave(snapshot) {
  const db = await openDB()
  if (!db) throw new Error('IndexedDB unavailable')
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(snapshot, KEY)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
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

// Ids of mirrors whose latest write failed. The localStorage copy is still good; this is the "insurance is down" signal.
const failedMirrors = new Set()

export function isMirrorFailing() {
  return failedMirrors.size > 0
}

export function __resetMirrorFailuresForTests() {
  failedMirrors.clear()
}

// Every mirror write goes through here so a failure, sync or async, is recorded and never unhandled.
function writeToSink(sink, snapshot) {
  try {
    const r = sink.write(snapshot)
    if (r && typeof r.then === 'function') r.then(() => failedMirrors.delete(sink.id), () => failedMirrors.add(sink.id))
    else failedMirrors.delete(sink.id)
  } catch (e) { failedMirrors.add(sink.id) }
}

function drain() {
  tm = null
  const snapshot = pending
  pending = null
  if (snapshot) for (const sink of sinks) {
    writeToSink(sink, snapshot)
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

// The caller stamps `_ts`; save only reads its argument.
export function save(snapshot) {
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

/**
 * Asks the browser to keep this origin's storage out of eviction. Boot calls it once; never throws.
 * @param {StorageManager} [manager] - Defaults to navigator.storage; tests inject a fake.
 * @returns {Promise<boolean>} True when the browser granted persistence.
 */
export async function requestPersistence(manager = globalThis.navigator?.storage) {
  if (typeof manager?.persist !== 'function') return false
  try { return (await manager.persist()) === true } catch (e) { return false }
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
      if (native) writeToSink(native, running?._ts ? running : { ...running, _ts: Date.now() })
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
    writeToSink(mirrorSink, running?._ts ? running : { ...running, _ts: Date.now() })
  }
  return null
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
