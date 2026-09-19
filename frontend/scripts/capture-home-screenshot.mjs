import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, extname, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(__dirname, '..')
const distDir = resolve(frontendDir, 'dist')
const artifactDir = process.env.ARTIFACT_DIR || 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\1574be32-7748-47cf-8da3-2f6e316ab470'
const tag = process.argv[2] || 'before'

if (!existsSync(artifactDir)) {
  mkdirSync(artifactDir, { recursive: true })
}

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

const server = createServer((req, res) => {
  const urlPath = req.url.split('?')[0]
  let filePath = join(distDir, urlPath === '/' ? 'index.html' : urlPath)
  if (!existsSync(filePath) || !extname(filePath)) {
    filePath = join(distDir, 'index.html')
  }
  try {
    const data = readFileSync(filePath)
    const ext = extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(data)
  } catch (err) {
    res.writeHead(404)
    res.end('Not found')
  }
})

async function run() {
  const port = 4175
  await new Promise(res => server.listen(port, res))
  console.log(`Server listening on http://127.0.0.1:${port}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 400, height: 860 },
    deviceScaleFactor: 2
  })
  const todayISO = new Date().toISOString().slice(0, 10)
  const d = new Date()
  const todayDay = (d.getDay() + 6) % 7 // 0=Mon, 1=Tue, etc.
  const days = []
  for (let i = 20; i >= 0; i--) {
    const dt = new Date(d)
    dt.setDate(d.getDate() - i)
    days.push(dt.toISOString().slice(0, 10))
  }

  const sampleState = {
    displayName: 'Alex',
    theme: 'dark',
    accent: 'lime',
    unit: 'kg',
    targetW: 76.5,
    bodyweight: [
      { d: days[0], w: 82.0, t: new Date(days[0]).getTime() },
      { d: days[5], w: 81.2, t: new Date(days[5]).getTime() },
      { d: days[10], w: 80.4, t: new Date(days[10]).getTime() },
      { d: days[15], w: 79.8, t: new Date(days[15]).getTime() },
      { d: days[20], w: 79.1, t: new Date(days[20]).getTime() }
    ],
    routines: [
      { id: 'r-push', name: 'Push Day', emoji: 'chest', exercises: [{ id: 'bench-press' }, { id: 'overhead-press' }, { id: 'tricep-pushdown' }] },
      { id: 'r-pull', name: 'Pull Day', emoji: 'back', exercises: [{ id: 'lat-pulldown' }, { id: 'barbell-row' }, { id: 'bicep-curl' }] },
      { id: 'r-legs', name: 'Leg Day', emoji: 'quads', exercises: [{ id: 'squat' }, { id: 'leg-press' }, { id: 'calf-raise' }] }
    ],
    week: {
      0: 'r-push',
      1: null,
      2: 'r-pull',
      3: null,
      4: 'r-legs',
      5: null,
      6: null
    },
    dayPlan: {},
    workouts: [
      { id: 'w-1', d: days[14], name: 'Push Day', duration: 3200 },
      { id: 'w-2', d: days[12], name: 'Pull Day', duration: 2900 },
      { id: 'w-3', d: days[7], name: 'Push Day', duration: 3100 },
      { id: 'w-4', d: days[5], name: 'Leg Day', duration: 3400 },
      { id: 'w-5', d: days[2], name: 'Push Day', duration: 3300 }
    ],
    active: null,
    customEx: [],
    favorites: []
  }
  // Schedule a workout on today's day of week so hero shows scheduled state
  sampleState.week[todayDay] = 'r-push'

  // Seed sample state into localStorage via init script before any page load
  await context.addInitScript((st) => {
    localStorage.setItem('gym_state_v1', JSON.stringify(st))
  }, sampleState)

  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:${port}/#/home`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#app', { timeout: 5000 })
  await page.waitForTimeout(600)

  const outPath = join(artifactDir, `home_${tag}_dark.png`)
  await page.screenshot({ path: outPath, fullPage: false })
  console.log(`Saved screenshot to ${outPath}`)

  // Also take Light mode screenshot
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light')
  })
  await page.waitForTimeout(300)
  const outPathLight = join(artifactDir, `home_${tag}_light.png`)
  await page.screenshot({ path: outPathLight, fullPage: false })
  console.log(`Saved screenshot to ${outPathLight}`)

  await browser.close()
  server.close()
}

run().catch(e => {
  console.error(e)
  server.close()
  process.exit(1)
})
