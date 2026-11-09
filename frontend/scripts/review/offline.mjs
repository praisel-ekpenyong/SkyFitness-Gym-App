// Proves the service worker: controller, cache contents, and every route offline, on the real built app.
// usage: node offline.mjs [--base=url] [--seed=file.json] [--today=YYYY-MM-DD]
// Needs serve.mjs (or any server of dist/) running; the dev server has no service worker.
import { readFileSync } from 'node:fs'
import { buildSeed, config, freezeClock, launch, parseArgs, seedStorage } from './lib.mjs'
const { flags } = parseArgs()
const cfg = config(flags), base = cfg.base
const seed = flags.seed ? JSON.parse(readFileSync(flags.seed,'utf8')) : buildSeed({ today: cfg.today })
const b = await launch(flags)
const c = await b.newContext({viewport:{width:390,height:844},timezoneId:'UTC'})
await seedStorage(c, seed)
await freezeClock(c, cfg.today)
const p=await c.newPage(); const log=[]
p.on('pageerror',e=>log.push('pageerror '+e.message)); p.on('requestfailed',r=>log.push('failed '+r.url().replace(base,'')+' '+r.failure()?.errorText)); p.on('console',m=>{ if(m.type()==='error') log.push('console '+m.text().slice(0,140)) })
c.on('serviceworker',w=>w.on('console',m=>log.push('sw '+m.text())))
await p.goto(base); await p.waitForTimeout(1200)
await p.evaluate(()=>navigator.serviceWorker.ready); console.log('controller after first load:',await p.evaluate(()=>!!navigator.serviceWorker.controller))
await p.reload(); await p.waitForTimeout(3500); console.log('controller after reload:',await p.evaluate(()=>!!navigator.serviceWorker.controller))
const keys=await p.evaluate(async()=>{ const out={}; for(const k of await caches.keys()){ out[k]=(await (await caches.open(k)).keys()).map(r=>new URL(r.url).pathname) } return out })
console.log('cache:',JSON.stringify(keys,null,0)); log.length=0
await c.setOffline(true); await p.reload({waitUntil:'load'}).catch(e=>console.log('reload threw',e.message.slice(0,100))); await p.waitForTimeout(1800)
for (const r of ['/home','/plan','/plan/r/push','/workout','/stats','/history','/library','/settings']) { await p.goto(base+'#'+r); await p.waitForTimeout(700); console.log('  offline',r,'->',(await p.locator('h1').count())?await p.locator('h1').first().textContent():'NO H1 '+(await p.evaluate(()=>document.body.innerText)).slice(0,60)) }
await p.goto(base+'#/home'); await p.waitForTimeout(500); await p.locator('button').filter({hasText:/Start workout/}).first().click(); await p.waitForTimeout(300); await p.locator('button').filter({hasText:/Save & start/}).first().click(); await p.waitForTimeout(800); await p.locator('[role=checkbox]').first().click(); await p.waitForTimeout(500); console.log('  offline workout started, sets:',await p.locator('.wk-title .sub').textContent(),'| rest dock:',await p.locator('#timer').count(),'| bodymap svgs on home next:'); await p.goto(base+'#/plan'); await p.waitForTimeout(600); console.log('  offline plan body maps:',await p.locator('.bm-v').count())
console.log('url',p.url()); console.log('body:',(await p.evaluate(()=>document.body?.innerText||'')).slice(0,120).replace(/\n/g,' | ')); console.log('h1 count',await p.locator('h1').count()); console.log('log',log.slice(0,14))
await b.close()
