// Durable storage — the app's one persistence module. Every save writes localStorage AND a
// mirrored copy (IndexedDB; plus the native file mirror on mobile builds) through this file,
// and boot loads whichever snapshot is newest. iOS Safari evicts website data under storage
// pressure, so the log's only home can't be localStorage alone. Same shape as the Capacitor
// mirror: debounced save, newest-timestamp restore — minus the native shell.
//
// The decisions that matter are pure and tested in storage.test.js with plain data; the IO
// around them is exercised there too, through injectable sinks and happy-dom's localStorage.

import { MOBILE, nativeLoad, nativeSave } from './mobile.js'

// Same key the store has always used for localStorage; exported so there is exactly one
// definition of it.
export const LOCAL_KEY = 'gym_state_v1'

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
  } catch (e) { /* localStorage copy still stands */ }
}

// --- sinks -----------------------------------------------------------------
// A sink is one mirrored home for the snapshot: { id, read, write }. The IndexedDB
// mirror is always present; the native file mirror registers itself on mobile builds
// (main.jsx). `write` runs on the shared debounce and on flush; boot-time reads go
// through `read` (web) or stay on nativeLoad (mobile, which races the file directly).
export const idbSink = { id: 'idb', read: idbLoad, write: idbSave }

let sinks = [idbSink]

/** Register a mirrored home for snapshots (the native file mirror opts in at startup). */
export function registerSink(sink) {
  sinks.push(sink)
}

/** Test seam: replace the sink list outright. Restores the default when omitted. */
export function __setSinksForTests(list) {
  sinks = list || [idbSink]
}

// --- the write protocol ----------------------------------------------------
// One trailing debounce drives every mirror: each save resets the timer, a drain hands
// the newest snapshot to all sinks, and flush() drains immediately (the store calls it
// on visibilitychange → hidden — backgrounding is often the last event before the OS
// kills the app). Idempotent: flushing with nothing pending does nothing.
const DRAIN_MS = 800

let tm = null
let pending = null

function drain() {
  tm = null
  const snapshot = pending
  pending = null
  if (snapshot) for (const sink of sinks) {
    // One failing mirror must never kill the others or the app: a denied
    // IndexedDB/file write degrades silently here (localStorage already
    // decided the blocked flag); async rejections are dropped the same way.
    try {
      const r = sink.write(snapshot)
      if (r && typeof r.catch === 'function') r.catch(() => {})
    } catch (e) { /* degraded mirror — the in-memory state already stands */ }
  }
}

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
  // Blocked device storage (private mode, disabled cookies/site data): the write
  // is denied, not full. Training must keep working from memory with a notice.
  if (name === 'SecurityError' || name === 'NotAllowedError' || code === 18 || code === 1000) return true
  // Last resort: message sniffing, DOMExceptions only — a programmer TypeError
  // that happens to mention e.g. "permission" must stay loud, not degrade.
  if (typeof DOMException !== 'function' || !(e instanceof DOMException)) return false
  const msg = String(e.message || '').toLowerCase()
  return DENIED_MSGS.some(m => msg.includes(m))
}

// Substrings identifying a denied write inside a DOMException message.
const DENIED_MSGS = ['quota', 'exceeded', 'security', 'denied', 'blocked', 'not allowed', 'access is denied', 'permission']

// True once a localStorage write has been denied until a later write succeeds.
// The store mirrors this into a visible notice; the in-memory Profile is always
// authoritative, so a blocked device degrades to one unsaved session, never a freeze.
let blockedWrites = false

/** Whether the last localStorage write was denied (quota or security). */
export function isStorageBlocked() {
  return blockedWrites
}

/** Test seam: reset the blocked flag without touching stored data. */
export function __resetStorageBlockedForTests() {
  blockedWrites = false
}

// The synchronous local write, injectable so tests can simulate denied device
// storage deterministically (per-instance stubbing of the frozen happy-dom
// Storage never lands — verified by probe — so denial goes through here,
// alongside the existing __setSinksForTests precedent for the mirrors).
let localWriteImpl = (key, value) => localStorage.setItem(key, value)

/** Test seam: replace the synchronous local write (e.g. with one that throws). */
export function __setLocalWriteForTests(fn) {
  localWriteImpl = fn || ((key, value) => localStorage.setItem(key, value))
}

/**
 * Stamp the snapshot, land it in localStorage synchronously, schedule the mirrors.
 * Returns true when the local copy landed, false when storage denied the write
 * (quota or security) — the snapshot is still queued for the mirrors and the
 * caller keeps working from memory. Truly unexpected failures (e.g. a circular
 * payload failing JSON.stringify) still throw so programmer errors stay loud.
 */
export function save(snapshot) {
  snapshot._ts = Date.now()
  try {
    localWriteImpl(LOCAL_KEY, JSON.stringify(snapshot))
    blockedWrites = false
  } catch (e) {
    if (!isStorageDenied(e)) throw e
    // Denied — keep pending snapshot for async sinks, flag for the visible notice.
    blockedWrites = true
  }
  clearTimeout(tm)
  // A shallow copy, not the caller's live object: a mutation between save and the
  // 800 ms drain must not corrupt what the mirrors receive.
  pending = { ...snapshot }
  tm = setTimeout(drain, DRAIN_MS)
  return !blockedWrites
}

// Is the backup reminder due? True only when the last successful JSON export is missing or
// older than the nag threshold. `now` is injected so callers (and tests) own the clock.
export const BACKUP_NAG_MS = 14 * 24 * 60 * 60 * 1000   // two weeks between backups

export function backupDue(lastExportTs, now) {
  return !lastExportTs || now - lastExportTs > BACKUP_NAG_MS
}

// Which stored copy wins at boot? Newest timestamp; empty defaults when neither exists.
// Each side arrives as { ts, state } or null. A tie keeps what localStorage already loaded
// (the app is already running it — swapping for an equal copy buys nothing), and a missing
// timestamp counts as "no copy": pre-timestamp saves must not beat stamped mirrors.
export function pickNewest(local, mirror) {
  const mts = mirror ? mirror.ts || 0 : 0
  if (mts && (!local || (local.ts || 0) < mts)) return mirror.state
  return local ? local.state : null
}

// --- the boot protocol -----------------------------------------------------
// Restore whichever stored copy is newest, seeding mirrors that came up empty so every
// home converges. The caller injects the app-side facts — the running state, whether a
// profile "has data", and the DEF overlay — so this file never learns Profile shapes.
//
// Tie rules are platform-frozen: on mobile the file copy wins a tie (`>=`, it is the copy
// built to survive eviction); on the web a tie keeps the already-running state (`>`).
// Seeding preserves the snapshot's own timestamp — only a swap may restamp.
export async function load({ running, hasData, overlay }) {
  if (MOBILE) {
    const saved = await nativeLoad()
    if (saved && (!hasData(running) || (saved._ts || 0) >= (running._ts || 0))) {
      return overlay(saved)
    }
    if (!saved && hasData(running)) {
      const native = sinks.find(s => s.id === 'native')
      // Seed the mirror with the running state itself (reference-identical, so callers
      // can rely on identity); only stamp a copy when it carries no timestamp yet.
      if (native) native.write(running?._ts ? running : { ...running, _ts: Date.now() })   // first run after upgrading from a file-less version
    }
    return null
  }

  const raw = loadLocal()
  const local = raw ? { ts: raw._ts, state: raw } : null
  const mirrorSink = sinks.find(s => s.id !== 'native')
  const stored = mirrorSink ? await mirrorSink.read() : null
  const mirror = stored ? { ts: stored._ts, state: stored } : null
  const winner = pickNewest(local, mirror)

  // No winner means no history anywhere — the empty defaults already loaded stand.
  if (winner && (!hasData(running) || (winner._ts || 0) > (running._ts || 0))) {
    return overlay(winner)
  }
  if (!mirror && hasData(running) && mirrorSink) {
    // First boot with the mirror, or its storage was cleared: seed it. Same
    // reference when already stamped (see above); a timestamped copy otherwise,
    // so an unstamped seed never loses the newest-timestamp race by default.
    mirrorSink.write(running?._ts ? running : { ...running, _ts: Date.now() })
  }
  return null
}

// Backup validation and sanitization
export function validateBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.workouts) || !Array.isArray(data.routines)) {
    throw new Error('not a Sky backup')
  }
  return true
}

const isPlainRecord = v => v && typeof v === 'object' && !Array.isArray(v)
// A Workout Entry is usable when it names an exercise and carries a sets
// array — anything else (null, missing id, missing sets) is a hand-edit scar
// that must never sink a Restore. Sets themselves stay as logged; only the
// Entry shell is guarded here so one bad record cannot kill the tab.
const isGoodWorkoutEntry = e => isPlainRecord(e) && typeof e.id === 'string' && e.id.length > 0 && Array.isArray(e.sets)
const isGoodWorkout = w => isPlainRecord(w) && Array.isArray(w.entries)
const isGoodRoutineEx = e => isPlainRecord(e) && typeof e.id === 'string' && e.id.length > 0
const isGoodRoutine = r => isPlainRecord(r) && typeof r.id === 'string' && r.id.length > 0 && Array.isArray(r.ex)

// Strip malformed Workout and Routine elements (and malformed Entries inside
// otherwise good ones), returning the cleaned Profile plus how many elements
// were skipped for the visible notice. Stale Day overrides (pointing at a
// deleted Routine) are pruned silently — the week schedule is the fallback.
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
  const clean = { ...data, active: null }
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

export function sanitizeBackup(data) {
  if (!data || typeof data !== 'object') return data
  return sanitizeRestorePayload(data).clean
}

// Cross-tab synchronization event listener
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
