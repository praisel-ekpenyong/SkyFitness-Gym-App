// Measured checks on the built app: overflow, tap targets (including ::after hit areas, measured), contrast,
// clipped text, CSP violations, console errors; then font and offline proof on the real service worker.
// usage: node audit.mjs [--base=url] [--seed=file.json] [--today=YYYY-MM-DD]   exits 1 when there are findings.
import { readFileSync } from 'node:fs'
import { buildSeed, config, freezeClock, launch, parseArgs, seedStorage } from './lib.mjs'
const { flags } = parseArgs()
const cfg = config(flags), base = cfg.base
const seed = flags.seed ? JSON.parse(readFileSync(flags.seed,'utf8')) : buildSeed({ today: cfg.today })
const b = await launch(flags)
const routes=['/home','/plan','/plan/r/push','/stats','/history','/library','/settings','/workout']
const VPS={phone:[390,844],small:[360,640],tablet:[768,1024],desktop:[1440,900]}
const audit=()=>{
  const lum=c=>{const a=c.map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*a[0]+.7152*a[1]+.0722*a[2]}
  const parse=s=>{ const c=document.createElement('canvas').getContext('2d'); c.fillStyle='#000'; c.fillStyle=s; const f=c.fillStyle; if(f.startsWith('#')){const n=parseInt(f.slice(1),16);return[n>>16,(n>>8)&255,n&255,1]} const m=f.match(/[\d.]+/g).map(Number);return[m[0],m[1],m[2],m[3]??1] }
  const bgOf=el=>{let e=el;while(e){const s=getComputedStyle(e);const c=parse(s.backgroundColor);if(s.backgroundColor!=='rgba(0, 0, 0, 0)'&&c[3]>=.99)return c;e=e.parentElement}return parse(getComputedStyle(document.body).backgroundColor)}
  const out={overflow:[],tap:[],contrast:[],clipped:[]}
  const de=document.documentElement
  if(de.scrollWidth>de.clientWidth+1) out.overflow.push(`page ${de.scrollWidth}>${de.clientWidth}`)
  const vis=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'}
  for(const e of document.querySelectorAll('#app *,#tabbar *')){ if(!vis(e)) continue; const r=e.getBoundingClientRect(); if(r.right>innerWidth+1&&!e.closest('.chips,.hm-wrap')) out.overflow.push((e.className?.baseVal??e.className??e.tagName)+` right=${Math.round(r.right)}`) }
  for(const e of document.querySelectorAll('button,[role=button],[role=checkbox],[role=radio],[role=switch],input:not([hidden]),textarea')){ if(!vis(e)||e.closest('.bodymap,.hm-grid')) continue; const r=e.getBoundingClientRect(); const a=getComputedStyle(e,'::after'); const hit=a.content!=='none'&&a.position==='absolute'?{w:parseFloat(a.width)||0,h:parseFloat(a.height)||0}:{w:0,h:0}; const hh=Math.max(r.height,hit.h), hw=Math.max(r.width,hit.w); if(hh<44||hw<44) out.tap.push(`${e.getAttribute('aria-label')||e.textContent.trim().slice(0,24)||e.className} ${Math.round(r.width)}x${Math.round(r.height)} (hit ${Math.round(hw)}x${Math.round(hh)})`) }
  const w=document.createTreeWalker(document.getElementById('root'),NodeFilter.SHOW_TEXT)
  while(w.nextNode()){ const t=w.currentNode; if(!t.textContent.trim()) continue; const e=t.parentElement; if(!vis(e)||e.closest('svg')) continue; const s=getComputedStyle(e); if(parseFloat(s.opacity)<1) continue; let dis=e.closest('button:disabled,[disabled]'); if(dis) continue
    const fg=parse(s.color),bg=bgOf(e); const mix=fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3])); const L1=lum(mix),L2=lum(bg); const cr=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05); const px=parseFloat(s.fontSize); const need=(px>=24||(px>=18.66&&+s.fontWeight>=700))?3:4.5
    if(cr<need) out.contrast.push(`${cr.toFixed(2)} "${t.textContent.trim().slice(0,26)}" ${px}px`)
    if(px<11) out.contrast.push(`TOO SMALL ${px}px "${t.textContent.trim().slice(0,26)}"`)
    if(e.scrollWidth>e.clientWidth+1 && s.overflow==='visible' && s.display!=='inline' && !e.closest('.hm-wrap,.chips')) out.clipped.push(`"${t.textContent.trim().slice(0,26)}" ${e.scrollWidth}>${e.clientWidth}`)
  }
  for(const k of Object.keys(out)) out[k]=[...new Set(out[k])]
  return out
}
let bad=0
for(const theme of ['dark','light']) for(const [vp,[w,h]] of Object.entries(VPS)){
  const s=JSON.parse(JSON.stringify(seed)); s.theme=theme; s.active=null
  const c=await b.newContext({viewport:{width:w,height:h},serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'UTC',hasTouch:vp!=='desktop',isMobile:vp!=='desktop'})
  await seedStorage(c,s); await freezeClock(c,cfg.today)
  await c.addInitScript(()=>{ window.__csp=[]; document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI)) })
  const p=await c.newPage(); const errs=[]
  p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error'&&!/Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()) })
  const run=async(label)=>{ const r=await p.evaluate(audit); const csp=await p.evaluate(()=>window.__csp); const items=[...r.overflow.map(x=>'OVERFLOW '+x),...r.tap.map(x=>'TAP '+x),...r.contrast.map(x=>'CONTRAST '+x),...r.clipped.map(x=>'SPILL '+x),...csp.map(x=>'CSP '+x)]; if(items.length){bad+=items.length; console.log(`[${theme} ${vp} ${label}]\n  `+items.slice(0,14).join('\n  ')+(items.length>14?`\n  …+${items.length-14}`:''))} }
  for(const r of routes){ await p.goto(base+'#'+r); await p.waitForTimeout(650); await run(r) }
  // the live workout
  await p.goto(base+'#/home'); await p.waitForTimeout(500)
  const start=p.locator('button').filter({hasText:/Plan or start workout|Start workout/}).first()
  await p.evaluate(()=>{ const S=JSON.parse(localStorage.getItem('gym_state_v1')); S.week={0:'push',1:'push',2:'push',3:'push',4:'push',5:'push',6:'push'}; localStorage.setItem('gym_state_v1',JSON.stringify(S)) }); await p.reload(); await p.waitForTimeout(600)
  await p.locator('button').filter({hasText:/Start workout/}).first().click(); await p.waitForTimeout(250); await p.locator('button').filter({hasText:/Save & start/}).first().click(); await p.waitForTimeout(800); await run('active workout')
  await p.locator('[role=checkbox]').first().click(); await p.waitForTimeout(400); await run('resting')
  const logged=await p.evaluate(()=>{ const k=[...document.querySelectorAll('.chk-l')].pop(); if(!k) return 'none'; const r=k.closest('button').getBoundingClientRect(); const d=document.querySelector('#timer')?.getBoundingClientRect(); return {keyBottom:Math.round(r.bottom),dockTop:d?Math.round(d.top):null,vh:innerHeight} })
  if(vp==='phone') console.log('  log key vs dock:',JSON.stringify(logged))
  if(errs.length){bad+=errs.length; console.log(`[${theme} ${vp}] ERRORS`,errs.slice(0,4))}
  await c.close()
}
console.log(bad?`\n${bad} findings`:'\nno findings')
// font proof + offline proof, on the real service worker
const c=await b.newContext({viewport:{width:390,height:844},timezoneId:'UTC'})
await seedStorage(c,seed); await freezeClock(c,cfg.today)
const p=await c.newPage(); await p.goto(base); await p.waitForTimeout(1500)
const font=async()=>p.evaluate(async()=>{ await document.fonts.ready; const m=t=>{const s=document.createElement('span');s.style.cssText="position:absolute;font:700 40px 'Archivo Variable';font-stretch:62%;font-variant-numeric:tabular-nums";s.textContent=t;document.body.append(s);const w=s.getBoundingClientRect().width;s.remove();return w}; return {loaded:document.fonts.check("700 20px 'Archivo Variable'"),tabular:m('1111')===m('8888'),faces:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+' '+f.stretch)} })
console.log('font online:',JSON.stringify(await font()))
await p.evaluate(()=>navigator.serviceWorker.ready); await p.reload(); await p.waitForTimeout(1200)
await c.setOffline(true); await p.reload(); await p.waitForTimeout(1500)
console.log('offline h1:',await p.locator('h1').first().textContent(),'| tabbar:',await p.locator('#tabbar').count(),'| font:',JSON.stringify(await font()))
await b.close()
process.exit(bad?1:0)
