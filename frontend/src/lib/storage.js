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
  if (snapshot) for (const sink of sinks) sink.write(snapshot)
}

export function flush() {
  if (tm == null) return
  clearTimeout(tm)
  drain()
}

function isQuotaError(e) {
  if (!e) return false
  const name = e.name || ''
  const code = e.code
  const msg = String(e.message || '').toLowerCase()
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014 || msg.includes('quota') || msg.includes('exceeded')
}

/** Stamp the snapshot, land it in localStorage synchronously, schedule the mirrors. */
export function save(snapshot) {
  snapshot._ts = Date.now()
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot))
  } catch (e) {
    if (!isQuotaError(e)) throw e
    // quota exceeded — keep pending snapshot for async sinks
  }
  clearTimeout(tm)
  pending = snapshot
  tm = setTimeout(drain, DRAIN_MS)
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
      if (native) native.write(running)   // first run after upgrading from a file-less version
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
    mirrorSink.write(running)   // first boot with the mirror, or its storage was cleared: seed it
  }
  return null
}
