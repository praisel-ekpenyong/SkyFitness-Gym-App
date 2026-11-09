// Shared helpers for the visual review tools in this folder. Tools only: nothing here ships in the app.
//
// Environment (every value has a default; flags on each script override the same names):
//   SKY_REVIEW_PORT     port the review server listens on          (default 5198)
//   SKY_REVIEW_BASE     base URL the scripts open                  (default http://127.0.0.1:<port>/)
//   SKY_REVIEW_TODAY    the frozen "today", YYYY-MM-DD, UTC        (default 2026-11-09)
//   SKY_REVIEW_OUT      where screenshots and JSON land            (default frontend/.tmp/review)
//   SKY_REVIEW_PROFILE  throwaway browser profile dir for open.mjs (default <out>/profile)
//   SKY_BROWSER         path to a Chromium/Chrome binary          (default: first of chromium, chromium-browser, google-chrome, google-chrome-stable on PATH)
import { createRequire } from 'node:module'
import { accessSync, constants } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(join(FRONTEND, 'package.json'))
export const { chromium } = require('playwright-core')

export function parseArgs(argv = process.argv.slice(2)) {
  const flags = {}, rest = []
  for (const a of argv) {
    if (a.startsWith('--')) { const [k, ...v] = a.slice(2).split('='); flags[k] = v.length ? v.join('=') : true }
    else rest.push(a)
  }
  return { flags, rest }
}

export function config(flags = {}) {
  const env = process.env
  const port = +(flags.port || env.SKY_REVIEW_PORT || 5198)
  const base = (flags.base || env.SKY_REVIEW_BASE || `http://127.0.0.1:${port}/`).replace(/\/?$/, '/')
  const today = flags.today || env.SKY_REVIEW_TODAY || '2026-11-09'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`today must be YYYY-MM-DD, got "${today}"`)
  const out = resolve(flags.out || env.SKY_REVIEW_OUT || join(FRONTEND, '.tmp', 'review'))
  const profile = resolve(flags.profile || env.SKY_REVIEW_PROFILE || join(out, 'profile'))
  return { port, base, today, out, profile }
}

export function findBrowser(flags = {}) {
  const explicit = flags.browser || process.env.SKY_BROWSER
  if (explicit) return explicit
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
      const p = join(dir, name)
      try { accessSync(p, constants.X_OK); return p } catch {}
    }
  }
  throw new Error('No browser found. Set SKY_BROWSER=/path/to/chromium or put chromium on PATH.')
}

export const launch = (flags = {}, opts = {}) => chromium.launch({ executablePath: findBrowser(flags), ...opts })

// "Today" at 10:12 UTC, as epoch ms. Runs use timezoneId UTC so local and UTC dates agree.
export const todayMs = today => { const [y, m, d] = today.split('-').map(Number); return Date.UTC(y, m - 1, d, 10, 12, 0) }

// Shift Date so "now" starts at the chosen moment but keeps ticking, so timers and the rest dock still run.
export const freezeClock = (ctx, today) => ctx.addInitScript(t => {
  const R = Date, off = t - R.now()
  class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off) } static now() { return R.now() + off } }
  window.Date = D
}, todayMs(today))

// Put `state` in localStorage before the app's first script runs. The app saves an empty profile if it
// boots with nothing there, so this must be an init script, never a post-load evaluate.
export const seedStorage = (ctx, state) => ctx.addInitScript(s => {
  if (!localStorage.getItem('gym_state_v1')) localStorage.setItem('gym_state_v1', JSON.stringify(s))
}, state)

// Demo profile: 14 weeks of Mon/Wed/Fri history ending the day before `today`, with a gap three weeks back.
const SPEC = {
  push: { name: 'Push Day', emoji: 'barbell', ex: [['0025', 4, 8, 80], ['0047', 3, 10, 24], ['0426', 3, 10, 40], ['0334', 3, 12, 10], ['0241', 3, 12, 25], ['0251', 3, 10, 0]] },
  pull: { name: 'Pull Day', emoji: 'pullup', ex: [['2330', 4, 10, 50], ['0027', 4, 8, 70], ['1323', 3, 10, 45], ['0031', 3, 10, 30], ['0313', 3, 12, 12]] },
  legs: { name: 'Leg Day', emoji: 'legs', ex: [['0043', 4, 8, 100], ['0085', 3, 10, 80], ['0739', 3, 12, 60], ['0585', 3, 12, 40], ['0586', 3, 12, 35], ['0605', 4, 15, 50]] },
}
const iso = d => d.toISOString().slice(0, 10)

export function buildSeed({ today = '2026-11-09', theme = 'dark' } = {}) {
  const routines = Object.entries(SPEC).map(([id, r]) => ({ id, name: r.name, emoji: r.emoji, prog: 'linear', ex: r.ex.map(([eid, sets, reps, w]) => ({ id: eid, sets, reps, weight: w + 15 })) }))
  const base = new Date(todayMs(today)); base.setUTCHours(12, 0, 0, 0)
  const workouts = [], bodyweight = []
  let n = 0
  for (let i = 14 * 7; i >= 1; i--) {
    const d = new Date(base); d.setUTCDate(base.getUTCDate() - i)
    const wd = d.getUTCDay()
    if ([1, 3, 5].includes(wd) && !(i > 20 && i < 27)) {
      const key = wd === 1 ? 'push' : wd === 3 ? 'pull' : 'legs', r = SPEC[key], weeks = (14 * 7 - i) / 7
      const start = new Date(d); start.setUTCHours(18, 5, 0, 0)
      const entries = r.ex.map(([id, sets, reps, w0], k) => {
        const w = w0 ? Math.round((w0 + Math.floor(weeks / 2) * 2.5) * 2) / 2 : 0
        const rows = Array.from({ length: sets }, (_, s) => ({ w, r: reps - (i > 21 && s === sets - 1 && (n + k) % 3 === 0 ? 1 : 0), done: true }))
        return { id, target: { sets, reps, weight: w }, sets: rows }
      })
      const mins = 48 + (n % 5) * 6
      workouts.push({ id: 'w' + (n++), d: iso(d), name: r.name, routineId: key, start: +start, end: +start + mins * 60000, bw: null, entries, prs: n % 7 === 0 ? [r.ex[0][0]] : [] })
    }
    if (i % 2 === 0) bodyweight.push({ d: iso(d), w: Math.round((84.6 - (14 * 7 - i) * 0.021 + Math.sin(i / 3) * 0.35) * 10) / 10, t: +d })
  }
  return { unit: 'kg', restSec: 90, sound: false, keepAwake: true, theme, accent: 'lime', body: 'male', targetW: 80, bodyweight, routines,
    week: { 1: 'push', 3: 'pull', 5: 'legs' }, dayPlan: {}, exWeights: {}, workouts, active: null, customEx: [], gifSize: 'full', favorites: ['0025', '0043'], reminder: { on: false, time: '08:00', tz: null }, effort: null, lastExport: todayMs(today), displayName: 'Sam', v: 1 }
}
