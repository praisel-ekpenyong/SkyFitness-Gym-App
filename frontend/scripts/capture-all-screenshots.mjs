import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, extname, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(__dirname, '..')
const rootDir = resolve(frontendDir, '..')
const distDir = resolve(frontendDir, 'dist')
const outputDir = resolve(rootDir, 'assets', 'screenshots')

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true })
}

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

const CDN = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd'
const MEDIA_FILES = [
  { dir: 'images', name: '0001-2gPfomN.jpg' },
  { dir: 'images', name: '0002-Hy9D21L.jpg' },
  { dir: 'images', name: '0003-1ZFqTDN.jpg' },
  { dir: 'images', name: '0006-qaZVsGk.jpg' },
  { dir: 'images', name: '0007-4IKbhHV.jpg' },
  { dir: 'images', name: '0009-PAgTVaK.jpg' },
  { dir: 'images', name: '0011-03lzqwk.jpg' },
  { dir: 'images', name: '0025-EIeI8Vf.jpg' },
  { dir: 'videos', name: '0025-EIeI8Vf.gif' }
]

async function ensureMedia() {
  for (const f of MEDIA_FILES) {
    const distTarget = join(distDir, 'media', f.dir, f.name)
    const pubTarget = join(frontendDir, 'public', 'media', f.dir, f.name)
    if (existsSync(distTarget) && existsSync(pubTarget)) continue

    mkdirSync(dirname(distTarget), { recursive: true })
    mkdirSync(dirname(pubTarget), { recursive: true })

    const url = `${CDN}/${f.dir}/${f.name}`
    try {
      console.log(`[Media] Fetching ${f.name}...`)
      const res = await fetch(url)
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        writeFileSync(distTarget, buf)
        writeFileSync(pubTarget, buf)
      } else {
        console.warn(`[Media] Failed fetching ${url}: ${res.status}`)
      }
    } catch (e) {
      console.warn(`[Media] Error fetching ${url}: ${e.message}`)
    }
  }
}

function startServer(port = 4180) {
  const server = createServer((req, res) => {
    const urlPath = req.url.split('?')[0]
    let filePath = join(distDir, urlPath === '/' ? 'index.html' : urlPath)
    if (!existsSync(filePath) || !extname(filePath)) {
      filePath = join(distDir, 'index.html')
    }
    try {
      const data = readFileSync(filePath)
      const ext = extname(filePath)
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      })
      res.end(data)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })

  return new Promise(res => server.listen(port, () => res(server)))
}

function generateHistoryData() {
  const now = Date.now()
  const d = new Date()
  const todayDay = (d.getDay() + 6) % 7 // 0=Mon, 1=Tue, ..., 6=Sun (Monday-indexed for week strip)
  const jsDay = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat

  // Bodyweight history: 60 days of data ending today at 79.8 kg, down from 83.5 kg
  const bodyweight = []
  const baseWeight = 83.5
  for (let i = 60; i >= 0; i--) {
    const dt = new Date(d)
    dt.setDate(d.getDate() - i)
    const iso = dt.toISOString().slice(0, 10)
    const progress = (60 - i) / 60
    const noise = Math.sin(i * 1.5) * 0.35
    const w = Math.round((baseWeight - progress * 3.7 + noise) * 10) / 10
    bodyweight.push({ d: iso, w: i === 0 ? 79.8 : (i === 2 ? 80.2 : w), t: dt.getTime() })
  }

  // Workouts schedule: Push, Pull, Legs over 90 days
  const workouts = []
  const exercisePool = {
    push: [
      { id: '0025', n: 'barbell bench press', w: 82.5, r: 8, target: { sets: 4, reps: 8, weight: 82.5 } },
      { id: '0612', n: 'overhead press', w: 50, r: 8, target: { sets: 3, reps: 8, weight: 50 } },
      { id: '0314', n: 'incline dumbbell bench press', w: 26, r: 10, target: { sets: 3, reps: 10, weight: 26 } },
      { id: '0863', n: 'triceps pushdown', w: 30, r: 12, target: { sets: 3, reps: 12, weight: 30 } },
      { id: '0334', n: 'lateral raise', w: 12, r: 15, target: { sets: 3, reps: 15, weight: 12 } }
    ],
    pull: [
      { id: '0027', n: 'barbell bent over row', w: 70, r: 8, target: { sets: 4, reps: 8, weight: 70 } },
      { id: '0861', n: 'cable seated row', w: 65, r: 10, target: { sets: 3, reps: 10, weight: 65 } },
      { id: '0499', n: 'inverted row', w: 0, r: 10, target: { sets: 3, reps: 10, weight: 0 } },
      { id: '0019', n: 'barbell curl', w: 32.5, r: 10, target: { sets: 3, reps: 10, weight: 32.5 } }
    ],
    legs: [
      { id: '0043', n: 'barbell full squat', w: 105, r: 6, target: { sets: 4, reps: 6, weight: 105 } },
      { id: '0710', n: 'leg press', w: 180, r: 10, target: { sets: 3, reps: 10, weight: 180 } },
      { id: '0585', n: 'lying leg curls', w: 45, r: 10, target: { sets: 3, reps: 10, weight: 45 } },
      { id: '0785', n: 'standing calf raises', w: 80, r: 15, target: { sets: 4, reps: 15, weight: 80 } }
    ]
  }

  // Generate 72 past workouts over the last 90 days.
  // Note: Most recent completed workout is yesterday (dayOffset = 1), so today is NOT marked completed yet.
  let workoutCount = 0
  const routineTypes = ['push', 'pull', 'legs']
  // Offsets in days for recent sessions:
  // - 1 day ago: Push Day (chest, front delts, triceps fatigued = RED/ORANGE)
  // - 2.5 days ago: Pull Day (lats, upper back, rear delts, biceps = ORANGE/YELLOW)
  // - 4 days ago: Leg Day (quads, glutes, hamstrings, calves = YELLOW)
  const recentOffsets = [1, 2.5, 4, 6]

  for (let dayOffset = 90; dayOffset >= 1; dayOffset--) {
    const isRecent = recentOffsets.some(o => Math.abs(o - dayOffset) < 0.6)
    if (!isRecent && (dayOffset % 7 === 0 || dayOffset % 7 === 3 || dayOffset % 7 === 5)) {
      continue
    }

    const dt = new Date(d)
    dt.setTime(now - dayOffset * 86400000)
    const iso = dt.toISOString().slice(0, 10)
    const rType = routineTypes[workoutCount % 3]
    const template = exercisePool[rType]

    const entries = template.map(ex => {
      const setsCount = ex.target.sets || 3
      const sets = []
      for (let s = 0; s < setsCount; s++) {
        const rir = s === setsCount - 1 ? 1.5 : (s === 0 ? 3.5 : 2.5)
        sets.push({
          w: (ex.id === '0025' && dayOffset > 25) ? 92.5 : ex.w,
          r: ex.r,
          rir,
          done: true
        })
      }
      return {
        id: ex.id,
        target: ex.target,
        sets
      }
    })

    workouts.push({
      id: `w-${workoutCount + 1}`,
      name: rType === 'push' ? 'Push Day' : (rType === 'pull' ? 'Pull Day' : 'Leg Day'),
      d: iso,
      start: dt.getTime(),
      t: dt.getTime(),
      duration: 3200 + Math.floor(Math.sin(dayOffset) * 400),
      entries
    })

    workoutCount++
    if (workoutCount >= 72) break
  }

  const state = {
    displayName: 'Alex',
    theme: 'dark',
    accent: 'lime',
    unit: 'kg',
    targetW: 78.0,
    gifSize: 'mini',
    effort: 'rir',
    bodyweight,
    routines: [
      {
        id: 'r-push',
        name: 'Push Day',
        emoji: 'chest',
        ex: [
          { id: '0025', sets: 4, reps: 8, weight: 82.5 },
          { id: '0612', sets: 3, reps: 8, weight: 50 },
          { id: '0314', sets: 3, reps: 10, weight: 26 },
          { id: '0863', sets: 3, reps: 12, weight: 30 },
          { id: '0334', sets: 3, reps: 15, weight: 12 },
          { id: '0218', sets: 3, reps: 12, weight: 15 }
        ]
      },
      {
        id: 'r-pull',
        name: 'Pull Day',
        emoji: 'back',
        ex: [
          { id: '0027', sets: 4, reps: 8, weight: 70 },
          { id: '0861', sets: 3, reps: 10, weight: 65 },
          { id: '0499', sets: 3, reps: 10, weight: 0 },
          { id: '0019', sets: 3, reps: 10, weight: 32.5 },
          { id: '0293', sets: 3, reps: 10, weight: 28 }
        ]
      },
      {
        id: 'r-legs',
        name: 'Leg Day',
        emoji: 'quads',
        ex: [
          { id: '0043', sets: 4, reps: 6, weight: 105 },
          { id: '0710', sets: 3, reps: 10, weight: 180 },
          { id: '0585', sets: 3, reps: 10, weight: 45 },
          { id: '0563', sets: 3, reps: 12, weight: 55 },
          { id: '0785', sets: 4, reps: 15, weight: 80 },
          { id: '0001', sets: 3, reps: 15, weight: 0 }
        ]
      }
    ],
    // Week schedule: Standard Monday=Push, Wednesday=Pull, Friday=Legs
    // (Note: in JS 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)
    week: {
      1: 'r-push', // Monday
      2: null,     // Tuesday
      3: 'r-pull', // Wednesday
      4: null,     // Thursday
      5: 'r-legs', // Friday
      6: null,     // Saturday
      0: null      // Sunday
    },
    dayPlan: {},
    workouts,
    active: null,
    customEx: [],
    favorites: []
  }

  // For Home Screen: if today is a rest day in the Mon/Wed/Fri split, assign a routine to today's JS day
  // so the Home hero showcases the scheduled routine card with green "Start workout" button
  if (!state.week[jsDay]) {
    state.week[jsDay] = 'r-push'
  }

  return state
}

async function capture() {
  await ensureMedia()

  const port = 4180
  const server = await startServer(port)
  console.log(`[Static Server] Running on http://127.0.0.1:${port}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    colorScheme: 'dark'
  })

  const baseState = generateHistoryData()

  // 1. Home Screen
  console.log('[1/5] Capturing Home Screen (home.png)...')
  {
    const page = await context.newPage()
    await page.addInitScript(st => {
      localStorage.setItem('gym_state_v1', JSON.stringify(st))
    }, baseState)

    await page.goto(`http://127.0.0.1:${port}/#/home`, { waitUntil: 'networkidle' })
    await page.waitForSelector('#app', { timeout: 5000 })
    await page.waitForTimeout(600)

    const path = join(outputDir, 'home.png')
    await page.screenshot({ path, fullPage: false })
    console.log(`Saved ${path}`)
    await page.close()
  }

  // 2. Plan Screen
  console.log('[2/5] Capturing Plan Screen (plan.png)...')
  {
    const page = await context.newPage()
    // Make sure standard M/W/F schedule is set
    const planState = JSON.parse(JSON.stringify(baseState))
    planState.week = {
      1: 'r-push',
      2: null,
      3: 'r-pull',
      4: null,
      5: 'r-legs',
      6: null,
      0: null
    }

    await page.addInitScript(st => {
      localStorage.setItem('gym_state_v1', JSON.stringify(st))
    }, planState)

    await page.goto(`http://127.0.0.1:${port}/#/plan`, { waitUntil: 'networkidle' })
    await page.waitForSelector('#app', { timeout: 5000 })
    await page.waitForTimeout(600)

    const path = join(outputDir, 'plan.png')
    await page.screenshot({ path, fullPage: false })
    console.log(`Saved ${path}`)
    await page.close()
  }

  // 3. Workout Screen
  console.log('[3/5] Capturing Workout Screen (workout.png)...')
  {
    const workoutState = JSON.parse(JSON.stringify(baseState))
    workoutState.gifSize = 'mini'
    workoutState.effort = 'rir'
    workoutState.active = {
      id: 'w-act',
      name: 'Push Day',
      start: Date.now() - 5 * 1000,
      routineId: 'r-push',
      cur: 0,
      entries: [
        {
          id: '0025',
          target: { sets: 4, reps: 8, weight: 82.5 },
          plan: {
            kind: 'reset',
            why: ['Missed reps 5 sessions running — reset to 82.5 kg and work back up.']
          },
          sets: [
            { w: 82.5, r: 8, rir: 2, done: true },
            { w: 82.5, r: 8, rir: 2, done: true },
            { w: 82.5, r: 8, rir: null, done: false },
            { w: 82.5, r: 7, rir: null, done: false }
          ]
        },
        {
          id: '0612',
          target: { sets: 3, reps: 8, weight: 50 },
          sets: [
            { w: 50, r: 8, rir: null, done: false },
            { w: 50, r: 8, rir: null, done: false },
            { w: 50, r: 8, rir: null, done: false }
          ]
        },
        {
          id: '0314',
          target: { sets: 3, reps: 10, weight: 26 },
          sets: [
            { w: 26, r: 10, rir: null, done: false },
            { w: 26, r: 10, rir: null, done: false },
            { w: 26, r: 10, rir: null, done: false }
          ]
        },
        {
          id: '0863',
          target: { sets: 3, reps: 12, weight: 30 },
          sets: [
            { w: 30, r: 12, rir: null, done: false },
            { w: 30, r: 12, rir: null, done: false },
            { w: 30, r: 12, rir: null, done: false }
          ]
        },
        {
          id: '0334',
          target: { sets: 3, reps: 15, weight: 12 },
          sets: [
            { w: 12, r: 15, rir: null, done: false },
            { w: 12, r: 15, rir: null, done: false },
            { w: 12, r: 15, rir: null, done: false }
          ]
        },
        {
          id: '0218',
          target: { sets: 3, reps: 12, weight: 15 },
          sets: [
            { w: 15, r: 12, rir: null, done: false },
            { w: 15, r: 12, rir: null, done: false },
            { w: 15, r: 12, rir: null, done: false }
          ]
        }
      ]
    }

    const page = await context.newPage()
    await page.addInitScript(st => {
      localStorage.setItem('gym_state_v1', JSON.stringify(st))
    }, workoutState)

    await page.goto(`http://127.0.0.1:${port}/#/workout`, { waitUntil: 'networkidle' })
    await page.waitForSelector('#app', { timeout: 5000 })
    await page.waitForSelector('.exmedia img', { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(600)

    const path = join(outputDir, 'workout.png')
    await page.screenshot({ path, fullPage: false })
    console.log(`Saved ${path}`)
    await page.close()
  }

  // 4. Stats Screen
  console.log('[4/5] Capturing Stats Screen (stats.png)...')
  {
    const page = await context.newPage()
    await page.addInitScript(st => {
      localStorage.setItem('gym_state_v1', JSON.stringify(st))
    }, baseState)

    await page.goto(`http://127.0.0.1:${port}/#/stats`, { waitUntil: 'networkidle' })
    await page.waitForSelector('#app', { timeout: 5000 })
    
    // Click 'Fatigue' tab
    const fatigueTab = page.locator('.seg button').filter({ hasText: 'Fatigue' })
    await fatigueTab.click()
    await page.waitForTimeout(400)

    // Scroll down to frame the Muscle diagram and Effort card
    await page.evaluate(() => {
      window.scrollTo(0, 480)
    })
    await page.waitForTimeout(500)

    const path = join(outputDir, 'stats.png')
    await page.screenshot({ path, fullPage: false })
    console.log(`Saved ${path}`)
    await page.close()
  }

  // 5. Library Screen
  console.log('[5/5] Capturing Library Screen (library.png)...')
  {
    const page = await context.newPage()
    await page.addInitScript(st => {
      localStorage.setItem('gym_state_v1', JSON.stringify(st))
    }, baseState)

    await page.goto(`http://127.0.0.1:${port}/#/library`, { waitUntil: 'networkidle' })
    await page.waitForSelector('#app', { timeout: 5000 })
    await page.waitForSelector('.thumb img', { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(600)

    const path = join(outputDir, 'library.png')
    await page.screenshot({ path, fullPage: false })
    console.log(`Saved ${path}`)
    await page.close()
  }

  await browser.close()
  server.close()
  console.log('✅ All 5 refined screenshots captured successfully!')
}

capture().catch(err => {
  console.error('Capture failed:', err)
  process.exit(1)
})
