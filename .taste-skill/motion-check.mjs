// Verifies the landing motion layer under an emulated no-preference setting.
// Same counting method as inspect.mjs (animationstart/transitionrun/getAnimations),
// but with prefers-reduced-motion forced to no-preference, i.e. what real users get.
import { Browser, sleep } from 'file:///C:/Users/USER/.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { fileURLToPath } from 'node:url';

const RECORDER = `(() => {
  const seen = new WeakSet(); const els = [];
  addEventListener('animationstart', (e) => { if (e.target instanceof Element && !seen.has(e.target)) { seen.add(e.target); els.push(e.target.tagName + '.' + (e.target.className.baseVal !== undefined ? '' : e.target.className).toString().slice(0, 40)); } }, true);
  addEventListener('transitionrun', (e) => { if (e.target instanceof Element && !seen.has(e.target)) { seen.add(e.target); els.push(e.target.tagName + '.' + e.target.className.toString().slice(0, 40)); } }, true);
  window.__els = els;
  window.__sample = () => { for (const a of document.getAnimations ? document.getAnimations() : []) { const t = a.effect && a.effect.target; if (t instanceof Element && !seen.has(t)) { seen.add(t); els.push(t.tagName + '[live]'); } } };
})();`;

const browser = await Browser.launch();
const page = await browser.newPage({ width: 1440, height: 900 });
await page.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
const file = fileURLToPath(new URL('../landing/index.html', import.meta.url));
await page.goto('file:///' + file.replace(/\\/g, '/'), { settleMs: 1800 });
const H = 900;
for (let i = 1; i <= 10; i++) {
  await page.eval(`window.scrollTo({ top: ${i * H}, behavior: 'instant' })`);
  await sleep(700);
  await page.eval('window.__sample && window.__sample()');
}
const els = await page.eval('window.__els');
console.log('MOVING ELEMENTS: ' + els.length);
for (const e of els.slice(0, 40)) console.log(' - ' + e);
await browser.close();
