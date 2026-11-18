
import { create } from 'zustand'
import { localTZ } from '../lib/format.js'
import { registerCustom } from '../lib/exercises.js'
import { MOBILE, syncReminder } from '../lib/mobile.js'
import { SEED_PLAN } from '../lib/env.js'
import { seedPlanInto } from '../lib/plans/seed.js'
import { flush, load, loadLocal, save, LOCAL_KEY, onStorageSync } from '../lib/storage.js'
import { DEF, normalizeState } from '../lib/profile/index.js'
import { act } from '../lib/active-workout.js'
import { syncRoutineFromSession } from '../lib/routine-sync.js'
import { runEffects } from './effects.js'

const clone = o => {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(o) } catch {}
  }
  return JSON.parse(JSON.stringify(o))
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
    // `send` is where a hold's completeHold goes; a default here would drop its open-finish.
    act(command, send) {
      let res = null
      get().update(s => { res = act(s, command) })
      runEffects(res.effects, get().S, send)
      return res
    },
    syncRoutineFromSession(routineId, syncedEx) {
      let ok = false
      get().update(s => { ok = syncRoutineFromSession(s, routineId, syncedEx) })
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
      S = seedPlanInto(S, SEED_PLAN)
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

export { DEF, normalizeState, hasData }
