import { create } from 'zustand'
import { uid } from '../lib/format.js'
import { playTimerComplete, playTimerWarning, vibrate } from '../platform/sound.js'
import { t } from '../lib/i18n.js'


const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window
let requestRestNotificationPermissionP = null

const requestRestNotificationPermission = async () => {
  if (!notificationsSupported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  if (!requestRestNotificationPermissionP) {
    requestRestNotificationPermissionP = Notification.requestPermission()
      .then(perm => perm === 'granted')
      .catch(() => false)
      .finally(() => {
        requestRestNotificationPermissionP = null
      })
  }
  return requestRestNotificationPermissionP
}

const maybeRestNotification = async () => {
  if (!notificationsSupported()) return
  if (!document.hidden && document.visibilityState !== 'hidden') return
  if (Notification.permission !== 'granted' && !(await requestRestNotificationPermission())) return
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.()
    if (reg?.showNotification) {
      reg.showNotification(t('Rest over — next set!'), { body: t('Rest over — next set!') })
      return
    }
    new Notification(t('Rest over — next set!'), { body: t('Rest over — next set!') })
  } catch {
  }
}

let toastTm = null
let timerInt = null
let timerTick = null
let workInt = null
let workTick = null
let workDone = null

export const useUI = create((set, get) => ({
  sheets: [],
  toastMsg: '',
  timer: null,
  work: null,

  openSheet(render, { kind = 'sheet', locked = false } = {}) {
    const id = uid()
    set(s => ({ sheets: [...s.sheets, { id, render, kind, locked }] }))
    const close = () => get().closeSheet(id)
    return { id, close, lock: v => set(s => ({ sheets: s.sheets.map(x => x.id === id ? { ...x, locked: v } : x) })) }
  },
  closeSheet(id) { set(s => ({ sheets: s.sheets.filter(x => x.id !== id) })) },
  closeAll() { set({ sheets: [] }) },

  toast(msg) {
    set({ toastMsg: msg })
    clearTimeout(toastTm)
    toastTm = setTimeout(() => set({ toastMsg: '' }), 2200)
  },

  startRest(sec, sound = true) {
    get().stopRest()
    const endsAt = Date.now() + sec * 1000
    set({ timer: { left: sec, total: sec, endsAt, sound } })
    requestRestNotificationPermission()
    timerTick = () => {
      const tm = get().timer
      if (!tm) return
      const left = Math.max(0, Math.round((tm.endsAt - Date.now()) / 1000))
      if (left === tm.left) return
      const snd = tm.sound ?? true
      if (left <= 0) {
        playTimerComplete(snd); maybeRestNotification(); get().toast(t('Rest over — next set!')); get().stopRest(); return
      }
      if (left <= 3) playTimerWarning(snd)
      set({ timer: { ...tm, left } })
    }
    timerInt = setInterval(timerTick, 1000)
    document.addEventListener('visibilitychange', timerTick)
  },
  addRest(sec) {
    const tm = get().timer
    if (!tm) return
    const left = tm.left + sec
    if (left <= 0) { get().stopRest(); return }
    set({ timer: { ...tm, left, total: tm.total + sec, endsAt: tm.endsAt + sec * 1000 } })
  },
  stopRest() {
    if (timerInt) clearInterval(timerInt); timerInt = null
    if (timerTick) document.removeEventListener('visibilitychange', timerTick); timerTick = null
    set({ timer: null })
  },

  startWork(sec, label, onDone, sound = true) {
    get().stopWork()
    get().stopRest()
    const total = Math.max(1, Math.round(sec) || 1)
    const endsAt = Date.now() + total * 1000
    workDone = onDone
    set({ work: { left: total, total, endsAt, label, sound } })
    workTick = () => {
      const wk = get().work
      if (!wk) return
      const left = Math.max(0, Math.round((wk.endsAt - Date.now()) / 1000))
      if (left === wk.left) return
      const snd = wk.sound ?? true
      if (left <= 0) {
        playTimerComplete(snd)
        const done = workDone
        get().stopWork()
        if (done) done(wk.total)
        return
      }
      if (left <= 3) playTimerWarning(snd)
      set({ work: { ...wk, left } })
    }
    workInt = setInterval(workTick, 1000)
    document.addEventListener('visibilitychange', workTick)
  },
  finishWorkEarly() {
    const wk = get().work
    if (!wk) return
    const elapsed = Math.max(1, wk.total - wk.left)
    const done = workDone
    vibrate(30)
    get().stopWork()
    if (done) done(elapsed)
  },
  stopWork() {
    if (workInt) clearInterval(workInt); workInt = null
    if (workTick) document.removeEventListener('visibilitychange', workTick); workTick = null
    workDone = null
    set({ work: null })
  }
}))
