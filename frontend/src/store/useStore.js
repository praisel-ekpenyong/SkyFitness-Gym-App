// Central application state store (Zustand atom).
//
// Encapsulates the user's entire profile: workouts, routines, bodyweight history,
// schedule, and in-progress workout sessions. State updates use an immutable copy-on-write
// pattern via `update(mutator)` and are automatically persisted to storage (localStorage,
// mirrored by IndexedDB / native storage) and synchronized across open browser tabs.
// Heavy active-workout business logic is delegated behind the `lib/active-workout.js` seam.

import { create } from 'zustand'
import { localTZ } from '../lib/format.js'
import { registerCustom } from '../lib/exercises.js'
import { MOBILE, syncReminder } from '../lib/mobile.js'
import { flush, load, loadLocal, save, LOCAL_KEY, onStorageSync } from '../lib/storage.js'
import { setsDoneActive } from '../lib/workout-model.js'
import {
  createActiveSession, applyWorkingWeight, commitWorkingWeight, completeActiveSession,
  addActiveExercise, removeActiveExercise, toggleActiveSet,
  updateActiveSetField, addActiveSet, removeActiveSet, addActiveWarmup,
  pairActiveSuperset, unpairActiveSuperset, setActiveIndex, discardActiveSession
} from '../lib/active-workout.js'

/**
 * Default empty state atom `S` representing a fresh profile.
 * Every profile snapshot loaded from disk or backup is normalized over a clone of DEF.
 */
export const DEF = {
  // Display & unit preferences
  unit: 'kg',           // 'kg' | 'lb' - active weight display unit throughout the app
  restSec: 90,          // Default rest timer countdown in seconds
  sound: true,          // Rest timer chime audio toggle
  keepAwake: true,      // Screen Wake Lock toggle during active workouts
  theme: 'light',       // 'light' | 'dark' UI theme token
  accent: 'lime',       // Accent color token (CSS theme class)
  body: 'male',         // 'male' | 'female' anatomical model for recovery heatmaps
  targetW: null,        // Goal body weight in current `unit`, or null if unset

  // Historical data & routines
  bodyweight: [],       // Chronological bodyweight log: { d: 'YYYY-MM-DD', w: number, t?: epoch ms }
  routines: [],         // User routines: Array<{ id, name, emoji, prog?, ex: Array<cfg> }>
  week: {},             // Weekday schedule: { [dayIndex 0..6]: routineId | null }
  dayPlan: {},          // Date-specific overrides: { ['YYYY-MM-DD']: routineId | 'rest' | null }
  exWeights: {},        // All-time heaviest working weight per exercise: { [exId]: { w: number, d: 'YYYY-MM-DD' } }
  workouts: [],         // Finished workout log: Array<{ id, d, name, entries: Array<entry> }>
  active: null,         // Active session object ({ id, routineId, entries, ... }) or null
  customEx: [],         // Custom exercise definitions: Array<{ id, name, bp, target, ... }>
  gifSize: 'full',      // Exercise illustration size: 'full' | 'compact'
  favorites: [],        // Array of favorited exercise ID strings

  // English-only application: locale bundles were removed, so nothing reads S.lang. Legacy
  // profiles that still carry the key retain it in storage harmlessly.

  // Daily reminder notification settings: { on: boolean, time: 'HH:mm', tz: string|null }
  reminder: { on: false, time: '08:00', tz: null },

  // effort: which per-set effort scale is logged — 'none' | 'rir' | 'rpe'. null, not 'none', so
  // that a profile which never chose (loaded state is overlaid on DEF, on every path: local
  // load or backup import) still falls back to the `showRir` boolean this replaced and
  // keeps the column it had. See effortOf.
  effort: null,

  // Timestamp of the last successful JSON export — drives the backup nag in Settings.
  // null, not absent, so a fresh install reads as "never exported" like any old profile.
  lastExport: null,

  // Profile display name — optional name shown as "Hi {name}" on Home (CONTEXT.md: Profile display name).
  // null = not set; merged via DEF so old backups / stored snapshots get it for free.
  displayName: null
}
/** Deep-copies a state value. */
const clone = o => {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(o) } catch {}
  }
  return JSON.parse(JSON.stringify(o))
}

/**
 * Produce a guaranteed well-formed application state atom `S` from arbitrary or partially corrupt input.
 *
 * Deep-clones `DEF` as the structural baseline, overlays valid top-level fields from `raw`,
 * ensures collections are true arrays, maps (`week`, `dayPlan`, `exWeights`) are plain objects,
 * and resets `active` to null if it lacks a valid `entries` array.
 */
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return clone(DEF)
  const base = clone(DEF)
  const S = { ...base, ...raw }
  S.workouts = Array.isArray(raw.workouts) ? raw.workouts : []
  S.routines = Array.isArray(raw.routines) ? raw.routines : []
  S.bodyweight = Array.isArray(raw.bodyweight) ? raw.bodyweight : []
  S.customEx = Array.isArray(raw.customEx) ? raw.customEx : []
  S.favorites = Array.isArray(raw.favorites) ? raw.favorites : []
  S.week = raw.week && typeof raw.week === 'object' && !Array.isArray(raw.week) ? { ...raw.week } : {}
  S.dayPlan = raw.dayPlan && typeof raw.dayPlan === 'object' && !Array.isArray(raw.dayPlan) ? { ...raw.dayPlan } : {}
  S.exWeights = raw.exWeights && typeof raw.exWeights === 'object' && !Array.isArray(raw.exWeights) ? { ...raw.exWeights } : {}
  S.reminder = { ...base.reminder, ...(raw.reminder && typeof raw.reminder === 'object' && !Array.isArray(raw.reminder) ? raw.reminder : {}) }
  // A corrupt `active` (bad backup edit, truncated write) must not crash every boot:
  // Workout reads A.entries, so anything without an entries array is discarded here.
  const a = raw.active
  S.active = a && typeof a === 'object' && !Array.isArray(a) && Array.isArray(a.entries) ? a : null
  return S
}

/** Loads the persisted state, falling back to a fresh profile. */
function loadState() {
  const raw = loadLocal()
  return raw ? normalizeState(raw) : clone(DEF)
}

/** Reports whether the profile holds any training data. */
const hasData = st => !!((st.workouts || []).length || (st.routines || []).length || (st.bodyweight || []).length)

/**
 * Sanitize a user-provided profile display name for storage.
 *
 * Strips leading/trailing whitespace, collapses consecutive internal whitespace into
 * a single space, and caps length at 24 characters. Returns null if empty or whitespace-only
 * so absent names remain null in state.
 */
export function sanitizeDisplayName(v) {
  if (v == null) return null
  const s = String(v).trim().replace(/\s+/g, ' ')
  if (!s) return null
  // 1–24 chars, collapsed whitespace — rendering capitalizes first grapheme
  return s.slice(0, 24)
}

export const useStore = create((set, get) => {
  const persist = S => {
    registerCustom(S.customEx)
    let blocked = false
    try {
      // Denied writes (quota/security) degrade to `false` — never throw — so
      // training keeps working from memory with the blocked notice showing.
      blocked = save(S) === false
    } catch (e) {
      // Truly unexpected persistence failures (e.g. a circular payload failing
      // JSON.stringify) still propagate so programmer errors stay loud — but
      // only after the in-memory state has landed, so no failure ever skips
      // the update or freezes the app.
      set({ S, storageBlocked: true })
      throw e
    }
    // stamps _ts, writes localStorage now, mirrors on the storage module's debounce
    set({ S, storageBlocked: blocked })
  }

  // Cross-tab synchronization: reload and update state when newer _ts snapshot is saved by another tab
  onStorageSync(incoming => {
    const current = get().S
    const incomingTs = Number(incoming?._ts) || 0
    const currentTs = Number(current?._ts) || 0
    if (incomingTs > currentTs) {
      const normalized = normalizeState(incoming)
      registerCustom(normalized.customEx)
      set({ S: normalized })
    }
  })

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
    // True while device storage denies writes (quota/security): training keeps
    // working from memory and the shell shows a persistent notice that changes
    // will not persist. Cleared by the next successful save.
    storageBlocked: false,

    /**
     * Mutate application state atom `S` via a draft function and persist changes.
     *
     * Clones current state, executes `mut(draft)`, and persists via `save(S)`.
     * Automatically registers custom exercises and synchronizes cross-tab updates.
     *
     * @param {(draft: Object) => void} mut - Synchronous mutator function.
     */
    update(mut) {
      const S = clone(get().S)
      mut(S)
      persist(S)
    },
    /**
     * Replace application state atom `S` wholesale after normalizing schema.
     *
     * @param {Object} S - New state payload to normalize and persist.
     */
    replaceState(S) { persist(normalizeState(S)) },
    // --- Active-workout lifecycle (deep seam: lib/active-workout.js) ---
    // Sheets and views call these; the single heaviest-weight policy,
    // target freezing, set toggles, and Record detection all live behind the seam.
    beginSession(routineId, bw, { replaceActiveId = null } = {}) {
      const current = get().S.active
      if (current && setsDoneActive(current) > 0 && replaceActiveId !== current.id) return null
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
    commitWorkingWeight(entryIdx, weight) {
      let next = null
      get().update(s => { next = commitWorkingWeight(s, entryIdx, weight) })
      return next
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

    /**
     * Initialize store during application launch.
     *
     * Races local and mirrored storage (IndexedDB/file mirrors) to select the newest snapshot,
     * updates reminder timezone if the device travelled, and marks the store ready.
     */
    async boot() {
      let S = get().S
      const winner = await load({
        running: S,
        hasData,
        overlay: x => normalizeState(x),
      })
      if (winner) S = winner
      if (MOBILE) syncReminder(S)

      // Re-stamp the reminder's timezone on every load — keeps it correct if you're travelling,
      // without needing to revisit Settings.
      const tz = localTZ()
      if (S.reminder?.on && S.reminder.tz !== tz) {
        S = { ...S, reminder: { ...S.reminder, tz } }
      }
      // One write per boot: the old code persisted the winner and then updated the
      // reminder tz separately, ping-ponging cross-tab sync via _ts on every load.
      if (S !== get().S) persist(S)
      set({ ready: true })
    }
  }
})

export { hasData }
