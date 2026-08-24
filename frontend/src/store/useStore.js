import { create } from 'zustand'
import { localTZ } from '../lib/format.js'
import { registerCustom } from '../lib/exercises.js'
import { MOBILE, nativeLoad, nativeSave, syncReminder } from '../lib/mobile.js'
import { idbLoad, idbSave, loadLocal, pickNewest, LOCAL_KEY } from '../lib/storage.js'

const KEY = LOCAL_KEY   // single definition lives in lib/storage.js
export const DEF = {
  unit: 'kg', restSec: 90, sound: true, keepAwake: true, lang: 'en',
  theme: 'light', accent: 'lime', body: 'male', targetW: null,
  bodyweight: [], routines: [], week: {}, dayPlan: {},
  exWeights: {}, workouts: [], active: null, customEx: [], gifSize: 'full',
  // effort: which per-set effort scale is logged — 'none' | 'rir' | 'rpe'. null, not 'none', so
  // that a profile which never chose (loaded state is overlaid on DEF, on every path: local
  // load or backup import) still falls back to the `showRir` boolean this replaced and
  // keeps the column it had. See effortOf.
  reminder: { on: false, time: '08:00', tz: null }, effort: null,
  // Timestamp of the last successful JSON export — drives the backup nag in Settings.
  // null, not absent, so a fresh install reads as "never exported" like any old profile.
  lastExport: null
}
const clone = o => JSON.parse(JSON.stringify(o))

function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return Object.assign(clone(DEF), JSON.parse(raw))
  } catch (e) { /* ignore */ }
  return clone(DEF)
}

const hasData = st => !!((st.workouts || []).length || (st.routines || []).length || (st.bodyweight || []).length)

export const useStore = create((set, get) => {
  let saveTm = null
  let idbTm = null   // debounce for the IndexedDB mirror (web twin of saveTm)

  // Mobile build: mirror the state into a file in the app's data directory (survives WebView
  // storage eviction) and keep the native reminder schedule in step with the weekly plan.
  const nativePersist = () => {
    clearTimeout(saveTm)
    saveTm = setTimeout(() => { saveTm = null; nativeSave(get().S); syncReminder(get().S) }, 800)
  }

  const persist = S => {
    S._ts = Date.now()
    registerCustom(S.customEx)
    localStorage.setItem(KEY, JSON.stringify(S))
    set({ S })
    // The IndexedDB mirror rides along on every save — same debounce as the mobile file copy.
    clearTimeout(idbTm)
    idbTm = setTimeout(() => { idbTm = null; idbSave(S) }, 800)
    if (MOBILE) nativePersist()
  }

  // A setting changed right before switching away/closing the tab must not get lost mid-debounce
  // (e.g. setting the reminder time then immediately backgrounding to test it). On mobile the
  // same applies to the file mirror — backgrounding is often the last thing before the OS
  // kills the app.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    if (MOBILE && saveTm) {
      clearTimeout(saveTm)
      saveTm = null
      nativeSave(get().S)
    }
    if (idbTm) {
      clearTimeout(idbTm)
      idbTm = null
      idbSave(get().S)
    }
  })

  return {
    S: (() => { const s = loadState(); registerCustom(s.customEx); return s })(),
    ready: false,

    // Mutate a draft of S via producer fn, then persist.
    update(mut) {
      const S = clone(get().S)
      mut(S)
      persist(S)
    },
    replaceState(S) { persist(clone(S)) },

    // Boot: restore whichever stored copy is newest (mobile file mirror / IndexedDB mirror,
    // each raced against what localStorage already loaded), re-stamp the reminder's timezone,
    // and go straight in — there is no server to ask anything of.
    async boot() {
      if (MOBILE) {
        const saved = await nativeLoad()
        const S = get().S
        if (saved && (!hasData(S) || (saved._ts || 0) >= (S._ts || 0))) {
          persist(Object.assign(clone(DEF), saved))
        } else if (hasData(S)) {
          nativeSave(S)   // first run after an update from a file-less version: seed the mirror
        }
        syncReminder(get().S)
      } else {
        // Web: localStorage and the IndexedDB mirror race on timestamps; pickNewest decides.
        // No winner means no history anywhere — the empty defaults already loaded stand.
        // (The mobile branch above restores on a >= tie; here a tie keeps the copy already
        // running — swapping for an equal one would only churn both storages.)
        const snap = x => ({ ts: x._ts, state: Object.assign(clone(DEF), x) })
        const raw = loadLocal()
        const local = raw ? snap(raw) : null
        const stored = await idbLoad()
        const mirror = stored ? snap(stored) : null
        const winner = pickNewest(local, mirror)
        const S = get().S
        if (winner && (!hasData(S) || (winner._ts || 0) > (S._ts || 0))) {
          persist(winner)   // also refreshes both storages under one fresh timestamp
        } else if (!mirror && hasData(S)) {
          idbSave(S)   // first boot with the mirror, or its storage was cleared: seed it
        }
      }

      // Re-stamp the reminder's timezone on every load — keeps it correct if you're travelling,
      // without needing to revisit Settings.
      const tz = localTZ()
      if (get().S.reminder?.on && get().S.reminder.tz !== tz) {
        get().update(s => { s.reminder = { ...s.reminder, tz } })
      }
      set({ ready: true })
    }
  }
})

export { hasData }
