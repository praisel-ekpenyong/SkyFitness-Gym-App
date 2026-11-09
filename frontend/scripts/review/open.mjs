// Opens a real, visible window on a running app (dev server or serve.mjs) with a throwaway profile and the demo history.
// usage: node open.mjs [--base=http://localhost:5173/] [--profile=dir] [--shot=file.png] [--today=] [--seed=file.json]
// Needs a display. The window stays open until you close it.
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { buildSeed, chromium, config, findBrowser, freezeClock, parseArgs, seedStorage } from './lib.mjs'
const { flags } = parseArgs()
const cfg = config(flags)
const shot = flags.shot || join(cfg.out, 'open.png')
mkdirSync(dirname(shot), { recursive: true })
rmSync(cfg.profile, { recursive: true, force: true })
const seed = flags.seed ? JSON.parse(readFileSync(flags.seed, 'utf8')) : buildSeed({ today: cfg.today })
const ctx = await chromium.launchPersistentContext(cfg.profile, {
  executablePath: findBrowser(flags), headless: false, viewport: null, serviceWorkers: 'block', timezoneId: 'UTC',
  args: ['--app=about:blank', '--window-size=430,932', '--window-position=120,40'],
})
await seedStorage(ctx, seed)
await freezeClock(ctx, cfg.today)
const page = ctx.pages()[0] || await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) console.log('CONSOLE', m.text()) })
await page.goto(cfg.base + '#/home')
await page.waitForSelector('.home-hero', { timeout: 30000 })
await page.waitForTimeout(1200)
console.log('SIZE', JSON.stringify(await page.evaluate(() => ({ w: innerWidth, h: innerHeight, h1: document.querySelector('h1')?.textContent, font: document.fonts.check("700 20px 'Archivo Variable'") }))))
await page.screenshot({ path: shot })
console.log('READY', shot)
await new Promise(r => ctx.on('close', r))
console.log('CLOSED')
