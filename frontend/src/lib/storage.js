// Durable storage — the web twin of the mobile file mirror in mobile.js. Every persist()
// writes localStorage AND an IndexedDB copy; boot() loads whichever snapshot is newer.
// iOS Safari evicts website data under storage pressure, so the log's only home can't be
// localStorage alone. Same shape as the Capacitor mirror: debounced save, newest-timestamp
// restore — minus the native shell.
//
// The two decisions that matter are pure and tested in storage.test.js with plain data;
// this file's IO around them is deliberately thin and untested.

// Same key the store has always used for localStorage; exported so there is exactly
// one definition of it.
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
