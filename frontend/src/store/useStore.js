
import { create } from 'zustand'
import { ACCENTS, localTZ } from '../lib/format.js'
import { registerCustom } from '../lib/exercises.js'
import { MOBILE, syncReminder } from '../lib/mobile.js'
import { flush, load, loadLocal, save, LOCAL_KEY, onStorageSync } from '../lib/storage.js'
import { admit } from '../lib/log/admit.js'
import { setsDone } from '../lib/workout-model.js'
import {
  createActiveSession, completeActiveSession,
  addActiveExercise, removeActiveExercise, replaceActiveExercise, moveActiveExercise, toggleActiveSet,
  updateActiveSetField, addActiveSet, removeActiveSet, addActiveWarmup,
  pairActiveSuperset, unpairActiveSuperset, setActiveIndex, discardActiveSession,
  syncRoutineFromSession, updateActiveExerciseNote
} from '../lib/active-workout.js'

export const DEF = {
  unit: 'kg',
  restSec: 90,
  sound: true,
  keepAwake: true,
  theme: 'dark',
  accent: 'lime',
  body: 'male',
  targetW: null,

  bodyweight: [],
  routines: [],
  week: {},
  dayPlan: {},
  exWeights: {},
  workouts: [],
  active: null,
  customEx: [],
  gifSize: 'full',
  favorites: [],


  reminder: { on: false, time: '08:00', tz: null },

  effort: null,

  lastExport: null,

  displayName: null
}
const clone = o => {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(o) } catch {}
  }
  return JSON.parse(JSON.stringify(o))
}

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
  S.accent = typeof raw.accent === 'string' && Object.hasOwn(ACCENTS, raw.accent) ? raw.accent : base.accent
  const a = raw.active
  S.active = a && typeof a === 'object' && !Array.isArray(a) && Array.isArray(a.entries) ? a : null
  return admit(S)
}

function loadState() {
  const raw = loadLocal()
  return raw ? normalizeState(raw) : clone(DEF)
}

const hasData = st => !!((st.workouts || []).length || (st.routines || []).length || (st.bodyweight || []).length)

export function sanitizeDisplayName(v) {
  if (v == null) return null
  const s = String(v).trim().replace(/\s+/g, ' ')
  if (!s) return null
  return s.slice(0, 24)
}

export const useStore = create((set, get) => {
  const persist = S => {
    registerCustom(S.customEx)
    let blocked = false
    try {
      blocked = save(S) === false
    } catch (e) {
      set({ S, storageBlocked: true })
      throw e
    }
    set({ S, storageBlocked: blocked })
  }

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

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    flush()
  })

  return {
    S: (() => { const s = loadState(); registerCustom(s.customEx); return s })(),
    ready: false,
    storageBlocked: false,

    update(mut) {
      const S = clone(get().S)
      mut(S)
      persist(S)
    },
    replaceState(S) { persist(normalizeState(S)) },
    beginSession(routineId, bw) {
      const current = get().S.active
      if (current && setsDone(current) > 0) return null
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
    replaceActiveExercise(idx, newExId, targetCfg) {
      let entry = null
      get().update(s => { entry = replaceActiveExercise(s, idx, newExId, targetCfg) })
      return entry
    },
    moveActiveExercise(idx, dir) {
      let ok = false
      get().update(s => { ok = moveActiveExercise(s, idx, dir) })
      return ok
    },
    toggleActiveSet(entryIdx, setIdx) {
      let outcome = null
      get().update(s => { outcome = toggleActiveSet(s, entryIdx, setIdx) })
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
    syncRoutineFromSession(routineId, syncedEx) {
      let ok = false
      get().update(s => { ok = syncRoutineFromSession(s, routineId, syncedEx) })
      return ok
    },
    updateActiveExerciseNote(entryIdx, note) {
      let ok = false
      get().update(s => { ok = updateActiveExerciseNote(s, entryIdx, note) })
      return ok
    },

    async boot() {
      let S = get().S
      const winner = await load({
        running: S,
        hasData,
        overlay: x => normalizeState(x),
      })
      if (winner) S = winner
      if (MOBILE) syncReminder(S)

      const tz = localTZ()
      if (S.reminder?.on && S.reminder.tz !== tz) {
        S = { ...S, reminder: { ...S.reminder, tz } }
      }
      if (S !== get().S) persist(S)
      set({ ready: true })
    }
  }
})

export { hasData }
