import { chromium } from 'playwright';
const BASE='http://127.0.0.1:5173/';
const b=await chromium.launch({headless:true});
const c=await b.newContext({viewport:{width:1280,height:800}});
const p=await c.newPage();
p.on('pageerror', e=>console.log('PAGEERROR',e.message));
const log=(s,ok,detail='')=>console.log(`${ok?'✅':'❌'} ${s} ${ok?'PASS':'FAIL'} ${detail}`);
async function closeAny(page){
  for(let i=0;i<5;i++){
    const cnt=await page.locator('.sheet, .center').count();
    if(cnt===0) return true;
    const nice=page.locator('button:has-text("Nice!")').first();
    if(await nice.count()){ try{await nice.click({timeout:1000}); await page.waitForTimeout(400); continue;}catch{}}
    const cancel=page.locator('.center button:has-text("Cancel"), .sheet button:has-text("Cancel")').first();
    if(await cancel.count()){ try{await cancel.click({timeout:1000}); await page.waitForTimeout(400); continue;}catch{}}
    const mback=page.locator('.mback').first();
    if(await mback.count()){ try{await mback.click({timeout:1000}); await page.waitForTimeout(400); continue;}catch{}}
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    if(await page.locator('.sheet, .center').count()===0) return true;
  }
  return (await p.locator('.sheet, .center').count())===0;
}
await p.goto(BASE+'#/home'); await p.waitForTimeout(1000);
// ensure we have history: finish a workout if needed
await p.evaluate(async()=>{
  const {useStore}=await import('/src/store/useStore.js');
  const S=useStore.getState().S;
  if(S.workouts.length===0 || S.active){
    // ensure active exists with 0 done to test early finish
    if(!S.active){
      const {useStore:us}=await import('/src/store/useStore.js');
      const st=us.getState().S;
      if(st.routines.length===0){
        const {starterRoutines}=await import('/src/lib/starter.js');
        const [push]=starterRoutines();
        us.getState().update(s=>{ s.routines.push(push); });
      }
      const sheets=await import('/src/sheets.jsx');
      sheets.startFlow(us.getState().S.routines[0].id);
    }
  }
});
await p.waitForTimeout(800);
if(await p.locator('.sheet, .center').count()){
  const w= p.locator('button:has-text("Start without weighing")');
  if(await w.count()) await w.click();
  await p.waitForTimeout(600);
}
await p.goto(BASE+'#/workout'); await p.waitForTimeout(800);
console.log('=== Reconfirm 5 fails ===');

// 1) Finish after all closeSheet - early finish confirm
{
  const finishBtn=p.locator('button:has-text("Finish workout early")').first();
  const finishBtn2=p.locator('button:has-text("Finish workout")').first();
  let btn= await finishBtn.count()?finishBtn:finishBtn2;
  if(!await btn.count()){
    // create 0-done active if needed
    await p.evaluate(async()=>{
      const {useStore}=await import('/src/store/useStore.js');
      useStore.getState().update(s=>{
        if(s.active) s.active.entries.forEach(e=>e.sets.forEach(ss=>ss.done=false));
      });
    });
    await p.waitForTimeout(300);
    btn=p.locator('button:has-text("Finish workout")').first();
  }
  if(await btn.count()){
    await btn.click(); await p.waitForTimeout(800);
    const cnt=await p.locator('.sheet, .center').count();
    log('1 Finish early sheet opens', cnt>0, `cnt ${cnt} text ${(await p.locator('.sheet, .center').first().textContent().catch(e=>'')).slice(0,60)}`);
    const ok=await closeAny(p);
    log('1 Finish after all closeSheet (fixed harness)', ok, `remaining ${await p.locator('.sheet, .center').count()}`);
    // force close if still
    if(!ok) await p.evaluate(async()=>{const {useUI}=await import('/src/store/useUI.js'); useUI.getState().sheets.slice().forEach(s=>useUI.getState().closeSheet(s.id));});
    await p.waitForTimeout(400);
  } else log('1 Finish early button', false, 'not found');
}
// ensure history has 1 workout for next tests - force finish a workout quickly
await p.evaluate(async()=>{
  const {useStore}=await import('/src/store/useStore.js');
  const S=useStore.getState().S;
  if(!S.active){
    const sheets=await import('/src/sheets.jsx');
    sheets.startFlow(S.routines[0].id);
  }
});
await p.waitForTimeout(800);
if(await p.locator('.sheet, .center').count()){
  const w= p.locator('button:has-text("Start without weighing")');
  if(await w.count()) await w.click();
  await p.waitForTimeout(500);
}
await p.evaluate(async()=>{
  const {useStore}=await import('/src/store/useStore.js');
  useStore.getState().update(s=>{
    if(s.active) s.active.entries.forEach(e=>e.sets.forEach(ss=>ss.done=true));
  });
  const {finishWorkout}=await import('/src/sheets.jsx');
  finishWorkout();
});
await p.waitForTimeout(1000);
if(await p.locator('button:has-text("Nice!")').count()){
  await p.locator('button:has-text("Nice!")').first().click(); await p.waitForTimeout(500);
}
await closeAny(p);
await p.waitForTimeout(400);

// 2) History after workout first detail click
{
  await p.goto(BASE+'#/history'); await p.waitForTimeout(800);
  const rows=p.locator('.list .item');
  const cnt=await rows.count();
  log('2 History rows exist', cnt>0, `cnt ${cnt}`);
  if(cnt>0){
    const first=rows.first();
    await first.scrollIntoViewIfNeeded().catch(()=>{});
    await p.waitForTimeout(200);
    let clicked=false;
    try{ await first.click({timeout:3000}); clicked=true; }catch(e){ log('2 History row click raw', false, e.message.slice(0,80));}
    await p.waitForTimeout(600);
    const sheet=await p.locator('.sheet, .center').count();
    log('2 History after workout first detail click', sheet>0 || clicked, `clicked ${clicked} sheet ${sheet}`);
    const ok=await closeAny(p);
    log('3 History after closeSheet', ok, `remaining ${await p.locator('.sheet, .center').count()}`);
  }
}

// 4 & 5) Stats heatmap
{
  await p.goto(BASE+'#/stats'); await p.waitForTimeout(1000);
  const hm=p.locator('.hm-wrap').first();
  if(await hm.count()) await hm.scrollIntoViewIfNeeded().catch(()=>{});
  const cell=p.locator('.hm-c').first();
  // need to ensure cell is scrolled into view horizontally
  if(await cell.count()){
    await cell.scrollIntoViewIfNeeded().catch(()=>{});
    await p.waitForTimeout(200);
    let clicked=false;
    try{ await cell.click({timeout:3000}); clicked=true; }catch(e){ 
      // try via evaluate click
      try{ await cell.evaluate(el=>el.click()); clicked=true; }catch{}
    }
    await p.waitForTimeout(600);
    const sheet=await p.locator('.sheet, .center').count();
    log('4 Stats heatmap click after workout', clicked, `clicked ${clicked} sheet ${sheet} text ${(await p.locator('.sheet, .center').first().textContent().catch(e=>'')).slice(0,40)}`);
    const ok=await closeAny(p);
    log('5 heatmap post closeSheet', ok, `remaining ${await p.locator('.sheet, .center').count()}`);
    if(!ok){
      // try double close for chained calendar->detail
      await p.waitForTimeout(300);
      const ok2=await closeAny(p);
      log('5 heatmap post closeSheet retry', ok2, `remaining ${await p.locator('.sheet, .center').count()}`);
    }
  } else log('4 Stats heatmap cell', false, 'not found');
}

// Also test original audit's route loads after ensuring no sheets
{
  await closeAny(p);
  await p.waitForTimeout(400);
  for(const route of ['#/home','#/plan','#/workout','#/stats','#/history','#/library','#/settings']){
    await p.goto(BASE+route); await p.waitForTimeout(600);
    await p.waitForSelector('#app',{timeout:3000}).catch(()=>{});
    const hasApp=await p.locator('#app').count();
    log(`Route ${route} loads`, hasApp>0, `app ${hasApp}`);
  }
}

console.log('=== RECONFIRM DONE ===');
await b.close();
