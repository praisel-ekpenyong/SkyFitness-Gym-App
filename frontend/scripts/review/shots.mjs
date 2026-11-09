// Screenshot scenes of the built app, on the demo profile, with the clock frozen.
// usage: node shots.mjs [--vp=phone|small|tablet|desktop] [--scenes=home,plan,...] [--theme=] [--accent=] [--effort=]
//        [--out=dir] [--seed=file.json] [--today=YYYY-MM-DD] [--base=url] [--settle=ms]
import { mkdirSync, readFileSync } from 'node:fs'
import { buildSeed, config, freezeClock, launch, parseArgs, seedStorage } from './lib.mjs'
const { flags: args } = parseArgs()
const cfg = config(args), base = cfg.base, out = cfg.out + '/shots', only = args.scenes ? args.scenes.split(',') : null
const VP = { phone:{width:390,height:844,deviceScaleFactor:2,hasTouch:true,isMobile:true}, small:{width:360,height:640,deviceScaleFactor:2,hasTouch:true,isMobile:true}, tablet:{width:768,height:1024,deviceScaleFactor:1,hasTouch:true,isMobile:true}, desktop:{width:1440,height:900,deviceScaleFactor:1} }
const vpName = args.vp || 'phone'
if (!VP[vpName]) throw new Error(`unknown --vp=${vpName}; use ${Object.keys(VP).join(', ')}`)
mkdirSync(out,{recursive:true})
const seed = args.seed ? JSON.parse(readFileSync(args.seed,'utf8')) : buildSeed({ today: cfg.today })
if (args.theme) seed.theme = args.theme
if (args.accent) seed.accent = args.accent
if (args.effort) seed.effort = args.effort
const b = await launch(args)
const errors=[]
async function ctx(state){
  const {width,height,...rest}=VP[vpName]; const c = await b.newContext({ viewport:{width,height}, ...rest, reducedMotion:'reduce', serviceWorkers:'block', timezoneId:'UTC' })
  await seedStorage(c, state)
  await freezeClock(c, cfg.today)
  const p = await c.newPage()
  p.on('pageerror',e=>errors.push(`pageerror: ${e.message}`))
  p.on('console',m=>{ if(m.type()==='error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(`console: ${m.text()}`) })
  return {c,p}
}
const go = async (p,h,wait=500)=>{ await p.goto(base+'#'+h); await p.waitForTimeout(wait) }
const snap = async (p,name,full=true)=>{ await p.waitForTimeout(args.settle?+args.settle:350); await p.screenshot({ path:`${out}/${vpName}-${name}.png`, fullPage:full }); console.log('  ',`${out}/${vpName}-${name}.png`) }
const clickT = (p,re)=>p.locator('button,[role=button],[role=checkbox]').filter({hasText:re}).first().click()
const scenes = {
  async home(){ const {c,p}=await ctx(seed); await go(p,'/home',900); await snap(p,'home'); await snap(p,'home-fold',false); await c.close() },
  async empty(){ const {c,p}=await ctx({theme:seed.theme,accent:seed.accent}); await go(p,'/home',700); await snap(p,'home-empty'); await go(p,'/plan'); await snap(p,'plan-empty'); await go(p,'/stats'); await snap(p,'stats-empty'); await go(p,'/workout'); await snap(p,'start-empty'); await c.close() },
  async rest(){ const s=JSON.parse(JSON.stringify(seed)); s.week={}; const {c,p}=await ctx(s); await go(p,'/home',900); await snap(p,'home-rest'); await c.close() },
  async plan(){ const {c,p}=await ctx(seed); await go(p,'/plan',900); await snap(p,'plan'); await go(p,'/plan/r/push',900); await snap(p,'routine'); await c.close() },
  async stats(){ const {c,p}=await ctx(seed); await go(p,'/stats',1200); await snap(p,'stats'); await snap(p,'stats-fold',false); await go(p,'/history'); await snap(p,'history',false); await c.close() },
  async library(){ const {c,p}=await ctx(seed); await go(p,'/library',1400); await snap(p,'library',false); await p.locator('.list .item[aria-label]').first().click(); await p.waitForTimeout(900); await snap(p,'exercise-sheet',false); await c.close() },
  async settings(){ const {c,p}=await ctx(seed); await go(p,'/settings',500); await snap(p,'settings'); await c.close() },
  async sheets(){ const {c,p}=await ctx(seed); await go(p,'/home',800);
    await p.locator('.week button, .wday').nth(3).click(); await snap(p,'sheet-day',false); await p.keyboard.press('Escape'); await p.waitForTimeout(250)
    await go(p,'/stats',800); await p.locator('.tile').nth(2).click(); await snap(p,'sheet-calendar',false); await p.keyboard.press('Escape'); await p.waitForTimeout(250)
    await p.locator('.tile').nth(1).click(); await snap(p,'sheet-recap',false); await p.keyboard.press('Escape'); await p.waitForTimeout(250)
    await p.locator('.tile').nth(3).click(); await snap(p,'sheet-bw',false); await p.keyboard.press('Escape'); await p.waitForTimeout(250)
    await go(p,'/plan/r/push',800); await p.locator('.list .item').first().click(); await p.waitForTimeout(500); await snap(p,'sheet-config',false); await c.close() },
  async variants(){ const v=JSON.parse(JSON.stringify(seed)); v.effort='rir';
    v.routines.push({id:'mix',name:'Upper Body Hypertrophy',emoji:'arm',ex:[{id:'0025',sets:3,reps:8,weight:60,sg:'a'},{id:'0027',sets:3,reps:8,weight:50,sg:'a'},{id:'0662',sets:3,reps:12,weight:0},{id:'3544',sets:3,mode:'time',sec:45,weight:0,bodyweight:true},{id:'3672',sets:1,min:20,speed:9}]}); v.week[1]='mix'
    const {c,p}=await ctx(v); await go(p,'/home',800); await snap(p,'long-name',false)
    await clickT(p,/Start workout/); await p.waitForTimeout(300); await clickT(p,/Save & start workout/); await p.waitForTimeout(900); await snap(p,'superset')
    for (const [i,n] of [[2,'bw'],[3,'timed'],[4,'cardio']]) { await p.evaluate(k=>[...document.querySelectorAll('.lad-s')][k-1]?.click(), i); await p.waitForTimeout(500); await snap(p,'set-'+n,false) }
    await c.close() },
  async more(){ const {c,p}=await ctx(seed); await go(p,'/home',700)
    await clickT(p,/Start workout/); await p.waitForTimeout(300); await clickT(p,/Save & start workout/); await p.waitForTimeout(900)
    await p.locator('button[aria-label="Add note"]').first().click(); await p.waitForTimeout(350); await snap(p,'sheet-note',false); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
    await p.locator('.giftoggle').first().click(); await p.waitForTimeout(350); await snap(p,'workout-mini',false); await p.locator('.giftoggle').first().click()
    await clickT(p,/Reorder exercises/); await p.waitForTimeout(400); await snap(p,'sheet-reorder',false); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
    await clickT(p,/Add exercise/); await p.waitForTimeout(900); await snap(p,'sheet-picker',false); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
    await p.locator('button[aria-label="Discard"]').click(); await p.waitForTimeout(350); await snap(p,'sheet-confirm',false); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
    await p.goto(base+'#/plan'); await p.waitForTimeout(500); await p.locator('button[aria-label="Share your plan"]').click(); await p.waitForTimeout(350); await snap(p,'sheet-plantools',false); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
    await p.goto(base+'#/plan/r/push'); await p.waitForTimeout(500); await p.locator('button[aria-label="Pick an icon"]').click(); await p.waitForTimeout(350); await snap(p,'sheet-glyph',false); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
    await p.goto(base+'#/library'); await p.waitForTimeout(800); await p.locator('.ex-create').click(); await p.waitForTimeout(350); await snap(p,'sheet-custom',false)
    await c.close() },
  async workout(){ const {c,p}=await ctx(seed); await go(p,'/home',800)
    await clickT(p,/Start workout/); await p.waitForTimeout(400); await snap(p,'weighin',false)
    await clickT(p,/Save & start workout/); await p.waitForTimeout(1000); await snap(p,'workout',false); await snap(p,'workout-full')
    const chk = p.locator('[role=checkbox]'); await chk.nth(0).click(); await p.waitForTimeout(400); await snap(p,'workout-rest',false); await snap(p,'workout-rest-full')
    await p.evaluate(()=>{ const u=[...document.querySelectorAll('#timer button')].pop(); u&&u.click() })
    for (let i=1;i<4;i++){ await chk.nth(i).click(); await p.waitForTimeout(200) ; await p.evaluate(()=>{ const u=[...document.querySelectorAll('#timer button')].pop(); u&&u.click() }) }
    await p.waitForTimeout(400); await snap(p,'workout-topweight',false)
    await clickT(p,/Save & next exercise|Save weight|Save/); await p.waitForTimeout(700); await snap(p,'workout-next',false)
    await p.goto(base+'#/home'); await p.waitForTimeout(700); await snap(p,'home-active',false)
    await p.goto(base+'#/workout'); await p.waitForTimeout(600); await p.locator('button[aria-label="Finish"]').click(); await p.waitForTimeout(400); await snap(p,'finish-confirm',false)
    await p.locator('[role=alertdialog] button').filter({hasText:/Finish/}).first().click(); await p.waitForTimeout(900); await snap(p,'finish',false); await snap(p,'finish-full'); await p.locator('.finish-cta button').click(); await p.waitForTimeout(700); await snap(p,'home-done',false); await c.close() },
}
for (const [k,f] of Object.entries(scenes)) { if (only && !only.includes(k)) continue; console.log(k); try { await f() } catch(e){ console.log('  SCENE FAILED',k,String(e).slice(0,300)); errors.push(`${k}: ${String(e).slice(0,300)}`) } }
await b.close()
console.log(errors.length? 'ERRORS:\n'+errors.join('\n') : 'no page errors')
