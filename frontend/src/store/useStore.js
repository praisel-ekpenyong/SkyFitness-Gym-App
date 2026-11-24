
import { create } from 'zustand'
import { produce, setAutoFreeze } from 'immer'
import { localTZ } from '../lib/dates.js'
import { registerCustom } from '../lib/exercises.js'
import { MOBILE, syncReminder } from '../platform/mobile.js'
import { SEED_PLAN } from '../lib/env.js'
import { seedPlanInto } from '../lib/plans/seed.js'
import { flush, load, loadLocal, save, onStorageSync } from '../platform/storage.js'
import { normalizeState, freshProfile, isNewerProfile, NewerProfileError } from '../lib/profile/index.js'
import { act } from '../lib/active-workout.js'
import { actRoutine } from '../lib/routines.js'
import { runEffects } from './effects.js'

// Frozen in tests so code that changes state outside update fails the suite (ADR 0026).
setAutoFreeze(import.meta.env.MODE === 'test')

// The one place the store reads the clock for normalizeState (lib/ takes it as an argument).
const normalizeAtEdge = raw => normalizeState(raw, Date.now())

const stamp = S => ({ ...S, _ts: Date.now() })

// A Profile saved by a newer Sky is not admitted (ADR 0027). The tab starts empty in memory,
// flags `newerProfile`, and never writes, so the newer Profile stays on disk as it was.
function loadState(raw = loadLocal()) {
  if (isNewerProfile(raw)) return { S: freshProfile(), newerProfile: true }
  return { S: normalizeAtEdge(raw), newerProfile: false }
}

const hasData = st => !!((st.workouts || []).length || (st.routines || []).length || (st.bodyweight || []).length)

export function sanitizeDisplayName(v) {
  if (v == null) return null
  const s = String(v).trim().replace(/\s+/g, ' ')
  if (!s) return null
  return s.slice(0, 24)
}

export const useStore = create((set, get) => {
  const initial = loadState()
  registerCustom(initial.S.customEx)

  const persist = S => {
    // The stored Profile belongs to a newer Sky: writing would overwrite it with an older shape.
    if (get().newerProfile) return
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
    // Another tab runs a newer Sky: whatever the timestamps, this tab stops reading and writing.
    if (isNewerProfile(incoming)) { set({ newerProfile: true }); return }
    const current = get().S
    const incomingTs = Number(incoming?._ts) || 0
    const currentTs = Number(current?._ts) || 0
    if (incomingTs > currentTs) {
      const normalized = normalizeAtEdge(incoming)
      registerCustom(normalized.customEx)
      set({ S: normalized })
    }
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    flush()
  })

  return {
    S: initial.S,
    ready: false,
    storageBlocked: false,
    newerProfile: initial.newerProfile,

    update(mut) {
      persist(produce(get().S, draft => {
        mut(draft)
        draft._ts = Date.now()
      }))
    },
    replaceState(S) { persist(stamp(normalizeAtEdge(S))) },
    // `send` is where a hold's completeHold goes; a default here would drop its open-finish.
    act(command, send) {
      let res = null
      get().update(s => { res = act(s, command) })
      runEffects(res.effects, () => get().S, send)
      return res
    },
    actRoutine(command) {
      let res = { ok: false }
      get().update(s => { res = actRoutine(s, command) })
      return res
    },
    async boot() {
      if (get().newerProfile) { set({ ready: true }); return }
      let S = get().S
      const winner = await load({
        running: S,
        hasData,
        overlay: x => {
          try { return normalizeAtEdge(x) } catch (e) {
            if (!(e instanceof NewerProfileError)) throw e
            set({ newerProfile: true })
            return null
          }
        },
      })
      if (get().newerProfile) { set({ ready: true }); return }
      if (winner) S = winner
      S = seedPlanInto(S, SEED_PLAN)
      if (MOBILE) syncReminder(S)

      const tz = localTZ()
      if (S.reminder?.on && S.reminder.tz !== tz) {
        S = { ...S, reminder: { ...S.reminder, tz } }
      }
      if (S !== get().S) persist(stamp(S))
      set({ ready: true })
    }
  }
})

const countArray = (obj, key) => {
  const S = obj?.S ?? obj
  return Array.isArray(S?.[key]) ? S[key].length : 0
}

/**
 * Returns true when `next` has more finished Workouts or Weigh-ins than `prev`.
 * Accepts either store slices ({ S }) or raw profile states.
 */
export function hasKeptMore(prev, next) {
  return countArray(next, 'workouts') > countArray(prev, 'workouts') ||
         countArray(next, 'bodyweight') > countArray(prev, 'bodyweight')
}

export { hasData }
