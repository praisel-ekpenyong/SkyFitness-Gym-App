import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, extname, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(__dirname, '..')
const distDir = resolve(frontendDir, 'dist')
const screenshotsDir = process.env.ARTIFACT_DIR || resolve(frontendDir, '.tmp', 'screenshots')

if (!existsSync(screenshotsDir)) {
  mkdirSync(screenshotsDir, { recursive: true })
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
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    })
    res.end(data)
  } catch (err) {
    res.writeHead(404)
    res.end('Not found')
  }
})

async function run() {
  if (!existsSync(distDir)) {
    throw new Error('frontend/dist not found. Please run "npm run build" first.')
  }

  await new Promise(res => server.listen(4173, res))
  console.log('[Playwright] Static preview server running on http://127.0.0.1:4173')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
  })

  const page = await context.newPage()
  const errors = []
  page.on('pageerror', err => errors.push(err.message))

  console.log('[1/6] Navigating to Home (#/home)...')
  await page.goto('http://127.0.0.1:4173/#/home', { waitUntil: 'networkidle' })
  await page.waitForSelector('#app', { timeout: 5000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(screenshotsDir, 'preview_home.png') })

  console.log('[2/6] Navigating to Plan (#/plan)...')
  await page.goto('http://127.0.0.1:4173/#/plan', { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(screenshotsDir, 'preview_plan.png') })

  console.log('[3/6] Navigating to Stats (#/stats)...')
  await page.goto('http://127.0.0.1:4173/#/stats', { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(screenshotsDir, 'preview_stats.png') })

  console.log('[4/6] Navigating to Exercise Library (#/library)...')
  await page.goto('http://127.0.0.1:4173/#/library', { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(screenshotsDir, 'preview_library.png') })

  console.log('[5/6] Navigating to Settings (#/settings)...')
  await page.goto('http://127.0.0.1:4173/#/settings', { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(screenshotsDir, 'preview_settings.png') })

  console.log('[6/6] Navigating to Workout (#/workout)...')
  await page.goto('http://127.0.0.1:4173/#/workout', { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(screenshotsDir, 'preview_workout.png') })

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  console.log(`[PWA] Manifest: "${manifestHref}"`)

  const themeMeta = await page.locator('meta[name="theme-color"]').getAttribute('content')
  console.log(`[PWA] Theme color: "${themeMeta}"`)

  if (errors.length > 0) {
    errors.forEach(e => console.error('Browser error:', e))
    throw new Error('Errors detected during browser preview')
  }

  await browser.close()
  server.close()
  console.log('✅ Playwright browser verification passed with 0 errors.')
}

run().catch(err => {
  console.error('Playwright verification failed:', err)
  server.close()
  process.exit(1)
})
