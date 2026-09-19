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
  const port = 4176
  await new Promise(res => server.listen(port, res))
  console.log(`Server listening on http://127.0.0.1:${port}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 400, height: 860 },
    deviceScaleFactor: 2
  })

  const sampleState = {
    displayName: 'Alex',
    theme: 'dark',
    accent: 'lime',
    unit: 'kg',
    targetW: 76.5,
    bodyweight: [{ d: '2026-08-25', w: 79.1, t: Date.now() }],
    routines: [
      { id: 'r-push', name: 'Push Day', emoji: 'chest', exercises: [{ id: 'bench-press' }, { id: 'overhead-press' }, { id: 'tricep-pushdown' }] }
    ],
    week: { 0: 'r-push' },
    dayPlan: {},
    workouts: [
      { id: 'w-old', d: '2026-08-20', name: 'Push Day', entries: [{ id: 'bench-press', sets: [{ w: 77.5, r: 8, done: true }, { w: 77.5, r: 8, done: true }] }] }
    ],
    active: {
      id: 'w-act',
      name: 'Push Day',
      start: Date.now() - 22 * 60 * 1000,
      routineId: 'r-push',
      cur: 0,
      entries: [
        {
          id: '0025',
          target: { sets: 3, reps: 8, weight: 80 },
          plan: { kind: 'up', why: ['Hit target reps last session · +2.5 kg progression'] },
          sets: [
            { w: 50, r: 10, done: true, warmup: true },
            { w: 80, r: 8, done: true },
            { w: 80, r: 8, done: false },
            { w: 80, r: 7, done: false }
          ]
        },
        {
          id: '0047',
          target: { sets: 3, reps: 10, weight: 45 },
          sets: [
            { w: 45, r: 10, done: false },
            { w: 45, r: 10, done: false }
          ]
        }
      ]
    },
    customEx: [],
    favorites: []
  }

  await context.addInitScript((st) => {
    localStorage.setItem('gym_state_v1', JSON.stringify(st))
  }, sampleState)

  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:${port}/#/workout`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#app', { timeout: 5000 })
  await page.waitForTimeout(600)

  const outPath = join(artifactDir, `workout_${tag}_dark.png`)
  await page.screenshot({ path: outPath, fullPage: false })
  console.log(`Saved screenshot to ${outPath}`)

  // Also take Light mode screenshot
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light')
  })
  await page.waitForTimeout(300)
  const outPathLight = join(artifactDir, `workout_${tag}_light.png`)
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
