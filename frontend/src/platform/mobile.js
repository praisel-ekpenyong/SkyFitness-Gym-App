import { t } from '../lib/i18n-core.js'
import { MOBILE as ENV_MOBILE } from '../lib/env.js'

/** @typedef {import('../lib/types.js').Profile} Profile */

export const MOBILE = ENV_MOBILE

const FILE = 'sky-state.json'

/**
 * Restores the last natively saved snapshot from the app's private file on mobile builds.
 * @returns {Promise<Object|null>} Parsed snapshot, or null on first launch or when unreadable.
 */
export async function nativeLoad() {
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const r = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 })
    return JSON.parse(r.data)
  } catch (e) { return null }
}

/**
 * Mirrors a snapshot into the app's private file so the log survives WebView eviction, without disturbing the localStorage copy.
 * @param {Profile} state - State snapshot persisted as JSON.
 * @returns {Promise<void>} Resolves once the file write completes; rejects when the write fails so the drain can record it.
 */
export async function nativeSave(state) {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  await Filesystem.writeFile({ path: FILE, directory: Directory.Data, data: JSON.stringify(state), encoding: Encoding.UTF8 })
}

/**
 * Storage sink that mirrors snapshots to the app's private file and keeps workout reminders synced; rejects only when the file write fails.
 */
export const nativeSink = {
  id: 'native',
  async write(state) {
    const [saved] = await Promise.allSettled([nativeSave(state), syncReminder(state)])
    if (saved.status === 'rejected') throw saved.reason
  },
}

function reminderNotifications(S) {
  const r = S.reminder
  if (!r?.on) return null
  const [hour, minute] = (r.time || '08:00').split(':').map(Number)
  return Object.entries(S.week || {})
    .filter(([, rid]) => rid && (S.routines || []).some(x => x.id === rid))
    .map(([day, rid]) => ({
      id: 100 + Number(day),
      title: t('Workout day'),
      body: t('{0} is on the plan today — let’s go!', S.routines.find(x => x.id === rid).name),
      // Capacitor weekdays are 1 (Sunday) … 7 (Saturday); S.week uses getDay() 0…6.
      schedule: { on: { weekday: Number(day) + 1, hour, minute }, allowWhileIdle: true },
    }))
}

let scheduledKey = null

export function __resetReminderForTests() {
  scheduledKey = null
}

/**
 * Schedules the weekly workout-day reminders on native builds. Web builds never call it: the Capacitor
 * web plugin cannot schedule a repeating notification and would show every one of them at once.
 * @param {Profile} S - The Profile.
 * @param {boolean} [interactive=false] - True when the lifter just switched the reminder on, so permission may be asked.
 * @returns {Promise<boolean>} False when permission is missing or scheduling failed.
 */
export async function syncReminder(S, interactive = false) {
  const notifications = reminderNotifications(S)
  const key = JSON.stringify(notifications)
  if (!interactive && key === scheduledKey) return true
  scheduledKey = null
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.cancel({ notifications: [0, 1, 2, 3, 4, 5, 6].map(d => ({ id: 100 + d })) }).catch(() => {})
    if (!notifications) { scheduledKey = key; return true }
    let perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted' && interactive) perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return false
    if (notifications.length) await LocalNotifications.schedule({ notifications })
    scheduledKey = key
    return true
  } catch (e) { return false }
}

// WKWebView can't do blob-URL downloads, so the backup goes out through the OS share sheet
export async function shareExport(json, filename) {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')
  const w = await Filesystem.writeFile({ path: filename, directory: Directory.Cache, data: json, encoding: Encoding.UTF8 })
  await Share.share({ title: filename, url: w.uri })
}
