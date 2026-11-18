
import { EXIDX, isBodyweightEq } from './exercises.js'
import { modeOf, isBw, isPerSide, sideReps, cleanNote } from './workout-model.js'
import { uid, fmtNum, fmtSigned, exCount, fmtSec } from './format.js'
import { todayISO, DAYN } from './dates.js'
import { t } from './i18n-core.js'

const PLAN_FMT = 1
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

function normalizeSm(sm) {
  if (sm == null || sm === '') return null
  return Array.isArray(sm) ? sm : [sm]
}

function cleanEx(e) {
  const o = { id: e.id, sets: e.sets }
  const mode = modeOf(e)
  if (mode === 'cardio') {
    if (e.min != null) o.min = e.min
    if (e.speed != null) o.speed = e.speed
  } else if (mode === 'time') {
    o.mode = 'time'
    if (e.sec != null) o.sec = e.sec
    if (e.weight) o.weight = e.weight
  } else {
    if (e.reps != null) o.reps = e.reps
    if (e.weight) o.weight = e.weight
  }
  if (e.bodyweight != null && e.bodyweight !== isBodyweightEq(e.id)) o.bodyweight = e.bodyweight
  if (e.side && mode !== 'time' && mode !== 'cardio') o.side = true
  if (e.prog) o.prog = e.prog
  if (e.inc > 0) o.inc = e.inc
  if (e.repsMin != null) o.repsMin = e.repsMin
  if (e.repsMax != null) o.repsMax = e.repsMax
  if (e.sg) o.sg = e.sg
  const notes = cleanNote(e.notes)
  if (notes) o.notes = notes
  return o
}

export function buildPlanBundle(S, name) {
  const routines = (S.routines || []).map(r => ({
    id: r.id, name: r.name, emoji: r.emoji, ...(r.prog ? { prog: r.prog } : {}), ex: (r.ex || []).map(cleanEx)
  }))
  const usedIds = new Set(routines.flatMap(r => r.ex.map(e => e.id)))
  const customEx = (S.customEx || [])
    .filter(c => usedIds.has(c.id))
    .map(c => {
      const sm = normalizeSm(c.sm)
      return {
        id: c.id,
        n: c.n,
        bp: c.bp,
        ...(c.tg ? { tg: c.tg } : {}),
        ...(sm ? { sm } : {}),
        ...(c.desc ? { desc: c.desc } : {}),
        ...(c.eq ? { eq: c.eq } : {}),
        ...(c.custom ? { custom: c.custom } : {}),
      }
    })
  const week = {}
  WEEK_ORDER.forEach(d => { if (S.week?.[d]) week[d] = S.week[d] })
  return { sky_plan: PLAN_FMT, exported: todayISO(), name: name || '', week, routines, customEx }
}

export function parsePlan(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!data || !data.sky_plan || !Array.isArray(data.routines)) {
    throw new Error(t('this isn’t a Sky plan file'))
  }
  const customEx = (Array.isArray(data.customEx) ? data.customEx : []).filter(c => c && c.id)
  const known = new Set(customEx.map(c => c.id))
  let dropped = 0
  const routines = data.routines.filter(r => r && Array.isArray(r.ex)).map(r => ({
    ...r,
    ex: r.ex.filter(e => {
      const ok = !!e && (known.has(e.id) || !!EXIDX[e.id])
      if (!ok) dropped++
      return ok
    })
  }))
  return {
    name: (data.name || '').trim(),
    routines,
    week: data.week || {},
    customEx,
    dropped,
    routineCount: routines.length,
    exerciseCount: routines.reduce((n, r) => n + r.ex.length, 0),
    scheduledDays: WEEK_ORDER.filter(d => data.week?.[d]).length
  }
}

export function mergePlan(s, bundle, { schedule } = {}) {
  s.customEx = s.customEx || []
  const exIdMap = {}
  bundle.customEx.forEach(c => {
    const same = s.customEx.find(x => (x.n || '').toLowerCase() === (c.n || '').toLowerCase() && x.bp === c.bp)
    if (same) { exIdMap[c.id] = same.id; return }
    const nid = uid()
    exIdMap[c.id] = nid
    const sm = normalizeSm(c.sm)
    s.customEx.push({
      id: nid,
      n: c.n,
      bp: c.bp,
      ...(c.tg ? { tg: c.tg } : {}),
      ...(sm ? { sm } : {}),
      ...(c.desc ? { desc: c.desc } : {}),
      eq: c.eq || 'custom',
      custom: true,
    })
  })
  const ridMap = {}
  bundle.routines.forEach(r => {
    const nid = uid()
    ridMap[r.id] = nid
    s.routines.push({
      id: nid,
      name: r.name || t('Shared routine'),
      emoji: r.emoji,
      ...(r.prog ? { prog: r.prog } : {}),
      ex: (r.ex || []).map(e => ({ ...e, id: exIdMap[e.id] || e.id }))
    })
  })
  if (schedule) {
    WEEK_ORDER.forEach(d => { delete s.week[d] })
    Object.entries(bundle.week || {}).forEach(([d, oldId]) => {
      if (ridMap[oldId]) s.week[d] = ridMap[oldId]
    })
  }
  return { routines: bundle.routines.length }
}


const esc = str => String(str == null ? '' : str)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function scheme(e, unit) {
  const sets = e.sets || 1
  const mode = modeOf(e)
  if (mode === 'cardio') {
    const body = `${e.min || 20} min @ ${fmtNum(e.speed || 8)} km/h`
    return sets > 1 ? `${sets} × ${body}` : body
  }
  let s = mode === 'time' ? `${sets} × ${fmtSec(e.sec || 45)}` : `${sets} × ${e.reps ?? 10}`
  if (e.weight) s += ` · ${isBw(e) ? fmtSigned(e.weight) : fmtNum(e.weight)} ${unit}`
  if (mode !== 'time' && isPerSide(e)) s += ` · ${t('{0}/side', fmtNum(sideReps(e.reps ?? 10)))}`
  return s
}

function units(ex) {
  const out = []
  ex.forEach((e, i) => {
    const prev = ex[i - 1]
    if (i > 0 && e.sg && prev?.sg === e.sg) out[out.length - 1].push(e)
    else out.push([e])
  })
  return out
}

function routineHTML(r, unit) {
  const rows = units(r.ex).map(u => {
    const items = u.map(e => {
      const ex = EXIDX[e.id]
      const name = ex ? ex.n : t('Unknown exercise')
      const part = ex && ex.bp && ex.bp !== 'cardio' ? `<span class="part">${esc(ex.bp)}</span>` : ''
      return `<div class="ex"><div class="ex-n">${esc(name)}${part}</div><div class="ex-s">${esc(scheme(e, unit))}</div></div>`
    }).join('')
    return u.length > 1
      ? `<div class="ss"><div class="ss-tag">${esc(t('Superset'))}</div><div class="ss-items">${items}</div></div>`
      : items
  }).join('')
  const count = exCount(r.ex.length)
  return `<section class="routine">
    <div class="r-head"><h2>${esc(r.name)}</h2><span class="r-count">${esc(count)}</span></div>
    <div class="ex-list">${rows || `<div class="ex empty">${esc(t('No exercises yet.'))}</div>`}</div>
  </section>`
}

function weekHTML(S) {
  const rows = WEEK_ORDER.map(d => {
    const r = S.routines.find(x => x.id === S.week?.[d])
    const val = r ? esc(r.name) : `<span class="rest">${esc(t('Rest'))}</span>`
    return `<div class="w-row"><div class="w-day">${esc(t(DAYN[d]))}</div><div class="w-r">${val}</div></div>`
  }).join('')
  return `<div class="week">${rows}</div>`
}

/**
 * Builds the full self-contained HTML document for the print and Save-as-PDF view.
 * @param {Object} S - Profile state with `routines`, `week`, and `unit`; routines without exercises are omitted.
 * @param {string} owner - Owner name printed in the header; falsy omits the byline.
 * @returns {string} Complete standalone HTML page with inline styles.
 */
export function planPrintHTML(S, owner) {
  const unit = S.unit || 'kg'
  const routines = (S.routines || []).filter(r => r.ex && r.ex.length)
  const body = routines.length
    ? routines.map(r => routineHTML(r, unit)).join('')
    : `<p class="none">${esc(t('No routines yet.'))}</p>`
  const sub = [owner, todayISO()].filter(Boolean).map(esc).join(' · ')
  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(t('Weekly Training Plan'))}</title>
<style>
  @page { margin: 16mm 15mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0; color: #16181d; background: #fff;
    font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-variant-numeric: tabular-nums;
  }
  .doc { max-width: 720px; margin: 0 auto; }
  header { border-bottom: 2px solid #16181d; padding-bottom: 12px; margin-bottom: 20px; }
  header .kicker { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #6a7a3a; font-weight: 600; }
  header h1 { font-size: 27px; letter-spacing: -.02em; margin: 3px 0 0; }
  header .sub { color: #6b7180; font-size: 13px; margin-top: 4px; }

  h3.block { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #5a6272; margin: 0 0 8px; font-weight: 600; }

  .week { border: 1px solid #e4e6ec; border-radius: 10px; overflow: hidden; margin-bottom: 26px; break-inside: avoid; page-break-inside: avoid; }
  .w-row { display: flex; align-items: baseline; padding: 8px 14px; border-top: 1px solid #eef0f4; }
  .w-row:first-child { border-top: 0; }
  .w-day { width: 116px; font-weight: 600; color: #16181d; flex: none; }
  .w-r { text-transform: capitalize; }
  .rest, .w-r .rest { color: #5a6272; text-transform: none; }

  .routine { break-inside: avoid; page-break-inside: avoid; margin-bottom: 20px; padding: 14px 16px; border: 1px solid #e4e6ec; border-radius: 12px; }
  .r-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; border-bottom: 1px solid #eef0f4; padding-bottom: 8px; margin-bottom: 8px; break-after: avoid; page-break-after: avoid; }
  .r-head h2 { font-size: 18px; letter-spacing: -.01em; margin: 0; text-transform: capitalize; }
  .r-count { font-size: 12px; color: #5a6272; white-space: nowrap; }

  .ex-list { display: flex; flex-direction: column; }
  .ex { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; padding: 6px 0; break-inside: avoid; page-break-inside: avoid; }
  .ex + .ex, .ss + .ex, .ex + .ss { border-top: 1px solid #f2f3f6; }
  .ex-n { text-transform: capitalize; font-weight: 500; }
  .ex-n .part { text-transform: capitalize; color: #5a6272; font-weight: 400; font-size: 12px; margin-left: 8px; }
  .ex-s { color: #3d424e; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .ex.empty, .none { color: #5a6272; }

  .ss { break-inside: avoid; page-break-inside: avoid; border: 1px solid #e4e6ec; border-radius: 8px; padding: 8px 12px; margin: 6px 0; background: #fafafc; }
  .ss-tag { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #55662a; font-weight: 600; margin-bottom: 2px; }
  .ss .ex:first-of-type { padding-top: 2px; }

  footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #eef0f4; color: #5a6272; font-size: 11px; text-align: center; }
</style></head>
<body><div class="doc">
  <header>
    <div class="kicker">Sky</div>
    <h1>${esc(t('Weekly Training Plan'))}</h1>
    ${sub ? `<div class="sub">${sub}</div>` : ''}
  </header>
  <h3 class="block">${esc(t('Week schedule'))}</h3>
  ${weekHTML(S)}
  <h3 class="block">${esc(t('Routines'))}</h3>
  ${body}
  <footer>${esc(t('Made with Sky'))}</footer>
</div></body></html>`
}
