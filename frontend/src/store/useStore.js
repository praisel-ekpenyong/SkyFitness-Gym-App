import { create } from 'zustand'
import { localTZ } from '../lib/format.js'
import { registerCustom } from '../lib/exercises.js'
import { MOBILE, syncReminder } from '../lib/mobile.js'
import { flush, load, loadLocal, save } from '../lib/storage.js'
import {
  createActiveSession, applyWorkingWeight, completeActiveSession,
  addActiveExercise, removeActiveExercise, toggleActiveSet,
  updateActiveSetField, addActiveSet, removeActiveSet, addActiveWarmup,
  pairActiveSuperset, unpairActiveSuperset, setActiveIndex, discardActiveSession
} from '../lib/active-workout.js'

export const DEF = {
  // No lang key — Sky is English-only (ticket 05) and nothing reads S.lang. Profiles that
  // still carry one from upstream keep it in storage harmlessly.
  unit: 'kg', restSec: 90, sound: true, keepAwake: true,
  theme: 'light', accent: 'lime', body: 'male', targetW: null,
  bodyweight: [], routines: [], week: {}, dayPlan: {},
  exWeights: {}, workouts: [], active: null, customEx: [], gifSize: 'full',
  favorites: [],
  // effort: which per-set effort scale is logged — 'none' | 'rir' | 'rpe'. null, not 'none', so
  // that a profile which never chose (loaded state is overlaid on DEF, on every path: local
  // load or backup import) still falls back to the `showRir` boolean this replaced and
  // keeps the column it had. See effortOf.
  reminder: { on: false, time: '08:00', tz: null }, effort: null,
  // Timestamp of the last successful JSON export — drives the backup nag in Settings.
  // null, not absent, so a fresh install reads as "never exported" like any old profile.
  lastExport: null,
  // Profile display name — optional name shown as "Hi {name}" on Home (CONTEXT.md: Profile display name).
  // null = not set; merged via DEF so old backups / stored snapshots get it for free.
  displayName: null
}
const clone = o => {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(o) } catch {}
  }
  return JSON.parse(JSON.stringify(o))
}

function loadState() {
  const raw = loadLocal()
  return raw ? Object.assign(clone(DEF), raw) : clone(DEF)
}

const hasData = st => !!((st.workouts || []).length || (st.routines || []).length || (st.bodyweight || []).length)

export function sanitizeDisplayName(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  // 1–24 chars, keep as-entered — rendering capitalizes first grapheme
  return s.slice(0, 24)
}

export const useStore = create((set, get) => {
  const persist = S => {
    registerCustom(S.customEx)
    save(S)   // stamps _ts, writes localStorage now, mirrors on the storage module's debounce
    set({ S })
  }

  // A setting changed right before switching away/closing the tab must not get lost mid-debounce
  // (e.g. setting the reminder time then immediately backgrounding to test it). The drain
  // policy lives behind the storage seam; this listener only tells it "now".
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    flush()
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

    // --- Active-workout lifecycle (deep seam: lib/active-workout.js) ---
    // Sheets and views call these; the single heaviest-weight policy,
    // target freezing, set toggles, and Record detection all live behind the seam.
    beginSession(routineId, bw) {
      const active = createActiveSession(get().S, routineId, bw)
      get().update(s => { s.active = active })
      return active
    },
    addActiveExercise(exId, targetCfg) {
      let entry = null
      get().update(s => { entry = addActiveExercise(s, exId, targetCfg) })
      return entry
    },
    removeActiveExercise(idx) {
      let ok = false
      get().update(s => { ok = removeActiveExercise(s, idx) })
      return ok
    },
    toggleActiveSet(entryIdx, setIdx, opts = {}) {
      let outcome = null
      get().update(s => { outcome = toggleActiveSet(s, entryIdx, setIdx, opts) })
      return outcome
    },
    updateActiveSetField(entryIdx, setIdx, field, value) {
      let ok = false
      get().update(s => { ok = updateActiveSetField(s, entryIdx, setIdx, field, value) })
      return ok
    },
    addActiveSet(entryIdx) {
      let ok = false
      get().update(s => { ok = addActiveSet(s, entryIdx) })
      return ok
    },
    removeActiveSet(entryIdx, setIdx = null) {
      let ok = false
      get().update(s => { ok = removeActiveSet(s, entryIdx, setIdx) })
      return ok
    },
    addActiveWarmup(entryIdx) {
      let ok = false
      get().update(s => { ok = addActiveWarmup(s, entryIdx) })
      return ok
    },
    pairActiveSuperset(firstIdx, secondIdx) {
      let ok = false
      get().update(s => { ok = pairActiveSuperset(s, firstIdx, secondIdx) })
      return ok
    },
    unpairActiveSuperset(entryIdx) {
      let ok = false
      get().update(s => { ok = unpairActiveSuperset(s, entryIdx) })
      return ok
    },
    recordWorkingWeight(entryIdx, weight) {
      let ok = false
      get().update(s => { ok = applyWorkingWeight(s, entryIdx, weight) })
      return ok
    },
    setActiveIndex(idx) {
      let ok = false
      get().update(s => { ok = setActiveIndex(s, idx) })
      return ok
    },
    discardSession() {
      let ok = false
      get().update(s => { ok = discardActiveSession(s) })
      return ok
    },
    finishSession() {
      let result = null
      get().update(s => { result = completeActiveSession(s) })
      return result
    },

    // Boot: let the storage module race its copies and hand back the newest snapshot
    // (mobile file mirror / IndexedDB mirror, each against what localStorage loaded),
    // re-stamp the reminder's timezone, and go straight in — there is no server to ask
    // anything of.
    async boot() {
      const winner = await load({
        running: get().S,
        hasData,
        overlay: x => Object.assign(clone(DEF), x),
      })
      if (winner) persist(winner)   // also refreshes every storage under one fresh timestamp
      if (MOBILE) syncReminder(get().S)

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
