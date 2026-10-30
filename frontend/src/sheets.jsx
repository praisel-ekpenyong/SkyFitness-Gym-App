import { useRef, useState } from 'react'
import { useStore, sanitizeDisplayName } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { EXIDX } from './lib/exercises.js'
import { fmtDate, fmtNum, fmtVol, fmtDur, durPart, todayISO, exCount, DAYN, MONTHS_LONG, monthKey, setLabel } from './lib/format.js'
import { effectiveRoutineId, hasEffectiveOverride, deleteWorkout } from './lib/history.js'
import { setsDone, tonnageOf } from './lib/workout-model.js'
import { effortOf } from './lib/effort.js'
import { setDayOverride, assignWeekday, dayStatus } from './lib/schedule.js'
import { recordWeighIn, deleteWeighIn, latestWeighIn } from './lib/bodyweight.js'
import { t } from './lib/i18n.js'
import { nav } from './lib/nav.js'
import { applyStarterPlan } from './lib/starter.js'
import { Thumb } from './components/Media.jsx'
import Icon from './components/Icon.jsx'
import { Button, Slider, Switch } from './components/ui.jsx'
import { glyphOf, GLYPH_GROUPS } from './lib/glyphs.js'
import { parseImport, mergeImport, importPreview } from './lib/import-csv.js'
import { buildPlanBundle, parsePlan, mergePlan, printPlan } from './lib/plan-share.js'
import { monthRecap } from './lib/recap.js'
import { MOBILE, shareExport } from './lib/mobile.js'
import { configureSessionSheets } from './sheets/session.jsx'
import { configureCatalogueSheets } from './sheets/catalogue.jsx'

/** Reads the shared store state. */
const S = () => useStore.getState().S
/** Applies a draft mutation to the shared store state. */
const update = (...a) => useStore.getState().update(...a)
/** Reads the UI store state. */
const ui = () => useUI.getState()
/** Shows a transient toast message. */
const toast = m => ui().toast(m)

/* ============================ custom confirm dialog ============================ */
function ConfirmDialog({ title, message, confirmText, cancelText, danger, onConfirm, close }) {
  return <div style={{ textAlign: 'center', padding: '4px 0' }}>
    {title && <h3 style={{ marginBottom: 8 }}>{title}</h3>}
    <div className="muted" style={{ marginBottom: 18, lineHeight: 1.5 }}>{message}</div>
    <button className={'btn ' + (danger ? 'danger' : 'primary')} onClick={() => { close(); onConfirm && onConfirm() }}>{confirmText || t('Confirm')}</button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{cancelText || t('Cancel')}</Button>
  </div>
}
// Themed replacement for window.confirm — callback-based (no blocking).
export function confirmSheet(opts) {
  ui().openSheet(close => <ConfirmDialog {...opts} close={close} />, { kind: 'center' })
}

/**
 * Load the built-in Push/Pull/Legs starter plan into the store.
 *
 * Appends three routines and assigns them to Mon/Wed/Fri, then shows a confirmation toast.
 */
export function loadStarterPlan() {
  update(st => { applyStarterPlan(st) })
  toast(t('Starter plan loaded — Mon Push · Wed Pull · Fri Legs'))
}

/* ============================ weight picker (shared: body weight + goal) ============================ */
// Fixed range, not a moving window — a window that resizes itself mid-drag (the previous
// attempt) makes the thumb's position unpredictable: every time it grows, everything already
// placed on it shifts toward one side. A static range never has that problem, at the cost of
// coarser precision per pixel — the +/- buttons cover exact values.
// The ceiling follows the profile's unit: 300 covers a body weight or a working weight in
// kg, but as pounds it cut off at 136 kg — below plenty of people's body weight, and well
// below an everyday squat.
const W_LO = 1
/** Weight-slider ceiling for the given unit. */
const wHi = unit => (unit === 'lb' ? 660 : 300)
/**
 * Weight picker with slider and step buttons.
 *
 * @param {number} value Current weight.
 * @param {Function} setValue Updates the weight.
 * @param {string} unit Display unit.
 */
function WeightInput({ value, setValue, unit }) {
  const W_HI = wHi(unit)
  const clamp = x => Math.max(W_LO, Math.min(W_HI, Math.round((x || 0) * 10) / 10))
  const sv = Math.max(W_LO, Math.min(W_HI, value))
  const onSlide = v => setValue(clamp(v))
  return <>
    <div className="bwstep">
      <button className="bw-pm" onClick={() => onSlide(value - 0.1)} aria-label={t('Decrease by 0.1 {0}', unit)}><Icon name="minus" /></button>
      <div className="bw-read">{fmtNum(value)}<span className="u"> {unit}</span></div>
      <button className="bw-pm" onClick={() => onSlide(value + 0.1)} aria-label={t('Increase by 0.1 {0}', unit)}><Icon name="plus" /></button>
    </div>
    <div className="chips" style={{ justifyContent: 'center', margin: '8px 0' }}>
      <button className="chip" onClick={() => onSlide(value - 1)} aria-label={t('Decrease by 1 {0}', unit)}>−1</button>
      <button className="chip" onClick={() => onSlide(value - 0.5)} aria-label={t('Decrease by 0.5 {0}', unit)}>−0.5</button>
      <button className="chip" onClick={() => onSlide(value + 0.5)} aria-label={t('Increase by 0.5 {0}', unit)}>+0.5</button>
      <button className="chip" onClick={() => onSlide(value + 1)} aria-label={t('Increase by 1 {0}', unit)}>+1</button>
    </div>
    <Slider value={sv} min={W_LO} max={W_HI} step={0.5} onChange={onSlide} aria-label={t('Weight')} />
  </>
}

/* ============================ body weight ============================ */
function BwSheet({ required, onDone, close }) {
  const st = useStore(s => s.S)
  const unit = st.unit
  const bw = latestWeighIn(st)
  const [v, setV] = useState(bw ? bw.w : 70)
  const save = () => {
    const n = Math.round((v || 0) * 10) / 10
    if (!n || n <= 0) { toast(t('Enter a valid weight')); return }
    update(s => { recordWeighIn(s, { d: todayISO(), w: n, t: Date.now() }) })
    close()
    if (onDone) onDone(n); else toast(t('Weight saved'))
  }
  const recent = [...st.bodyweight].reverse().slice(0, 3)
  const delEntry = d => update(s => { deleteWeighIn(s, d) })
  return <>
    <h3>{required ? t('Quick check-in') : t('Log body weight')}</h3>
    <div className="muted small">{required ? t('Slide or tap to set your weight — tracked before every workout so your curve stays honest.') : t('Today') + ', ' + fmtDate(todayISO(), true)}</div>
    <WeightInput value={v} setValue={setV} unit={unit} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{required ? t('Save & start workout') : t('Save')}</Button>
    {required && <>
      <div style={{ height: 8 }} /><Button variant="ghost" className="dim" onClick={() => { close(); onDone && onDone(null) }}>{t('Start without weighing in')}</Button>
      <div style={{ height: 2 }} /><Button variant="ghost" className="dim" icon="reset" onClick={() => { close(); nav('/workout') }}>{t('Choose a different workout')}</Button>
    </>}
    {!required && recent.length > 0 && <>
      <h4 className="sec">{t('Recent weigh-ins')}</h4>
      <div className="list" style={{ gap: 0 }}>
        {recent.map(b => <div key={b.d} className="row between" style={{ padding: '9px 2px', borderBottom: '1px solid var(--sep)' }}>
          <span className="small muted">{fmtDate(b.d, true)}</span>
          <span className="row" style={{ gap: 12 }}><b>{fmtNum(b.w)} {unit}</b>
            <button className="iconbtn" style={{ width: 32, height: 30, borderRadius: 8, fontSize: 15, color: 'var(--red)' }} onClick={() => delEntry(b.d)} aria-label={t('Delete entry for {0}', fmtDate(b.d, true))}><Icon name="trash" /></button></span>
        </div>)}
      </div>
    </>}
  </>
}
/**
 * Opens the body-weight sheet; saving logs today's weigh-in.
 *
 * @param {Object} opts Sheet options.
 */
export function bwSheet(opts = {}) {
  const h = ui().openSheet(close => <BwSheet {...opts} close={close} />, { locked: !!opts.required })
  return h
}

/* ============================ import from another app ============================ */
// Shows what a parsed export would actually do before anything is written. An import is
// the one action where "just try it" is expensive — it's someone's entire training
// history — so the numbers, the unit conversion and the exercises we couldn't recognise
// are all on screen before the confirm button.
function ImportSummary({ parsed, close }) {
  const st = useStore(s => s.S)
  // The dry-run totals — exactly what mergeImport returns, so the numbers on
  // screen cannot drift from what the confirm button will actually do.
  const { added: fresh, skipped: have } = importPreview(st, parsed)
  const isBW = parsed.kind === 'bodyweight'

  const doImport = () => {
    let res
    update(s => { res = mergeImport(s, parsed) })
    close()
    toast(isBW
      ? t('{0} weigh-ins imported', res.added)
      : t('{0} workouts imported', res.added))
  }

  return <>
    <h3>{parsed.source ? t('Import from {0}', parsed.source) : t('Import history')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>
      {parsed.from === parsed.to ? fmtDate(parsed.from, true) : fmtDate(parsed.from, true) + ' – ' + fmtDate(parsed.to, true)}
    </div>

    <div className="tiles" style={{ textAlign: 'left' }}>
      {isBW ? <>
        <div className="tile"><div className="l">{t('Weigh-ins')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{parsed.bodyweight.length}</div></div>
        <div className="tile"><div className="l">{t('New')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{fresh}</div></div>
      </> : <>
        <div className="tile"><div className="l">{t('Workouts')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{parsed.workouts.length}</div></div>
        <div className="tile"><div className="l">{t('Sets')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{parsed.sets}</div></div>
        <div className="tile"><div className="l">{t('Exercises matched')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{parsed.matched}</div></div>
        <div className="tile"><div className="l">{t('Added as your own')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{parsed.created}</div></div>
      </>}
    </div>

    {parsed.mixedUnits ? <div className="small" style={{ color: 'var(--yellow)', marginBottom: 10 }}>
      {t('The file mixes kg and lb — each set is converted to {0}.', st.unit)}
    </div> : parsed.converted ? <div className="small" style={{ color: 'var(--yellow)', marginBottom: 10 }}>
      {t('The file is in {0} and your profile is in {1} — weights will be converted.', parsed.fileUnit, st.unit)}
    </div> : null}
    {!isBW && !parsed.fileUnit && !parsed.mixedUnits && <div className="small dim" style={{ marginBottom: 10 }}>
      {t('The file does not say which unit it uses — numbers are imported as they are.')}
    </div>}
    {have > 0 && <div className="small dim" style={{ marginBottom: 10 }}>
      {t('{0} days already have data here and will be left alone.', have)}
    </div>}
    {/* The file rated its sets. Say so: the column is off by default, so the ratings would
        otherwise arrive invisibly and look like they had been dropped. */}
    {!isBW && (parsed.rirSets + parsed.rpeSets) > 0 && <div className="small dim" style={{ marginBottom: 10 }}>
      {t(effortOf(st) === 'none'
        ? '{0} sets bring an {1} with them — switch on Effort per set in Settings to see it.'
        : '{0} sets bring an {1} with them.',
      parsed.rirSets || parsed.rpeSets, parsed.rirSets ? 'RIR' : 'RPE')}
    </div>}
    {!isBW && parsed.unmatchedNames.length > 0 && <>
      <h4 className="sec">{t('Not in the library — added as your own exercises')}</h4>
      <div className="mchips" style={{ marginBottom: 12 }}>
        {parsed.unmatchedNames.slice(0, 12).map(n => <span key={n} className="mchip capitalize">{n}</span>)}
        {parsed.unmatchedNames.length > 12 && <span className="mchip">+{parsed.unmatchedNames.length - 12}</span>}
      </div>
    </>}

    <Button variant="primary" onClick={doImport} disabled={!fresh}>
      {fresh ? t('Import') : t('Nothing new to import')}
    </Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

/** Read a CSV/XML export, then show what it would do. */
export function importFromApp(file, onDone) {
  const rd = new FileReader()
  rd.onload = () => {
    let parsed
    try { parsed = parseImport(String(rd.result), { unit: S().unit }) }
    catch (e) { toast(t('Could not read that file')); return }
    if (parsed.error === 'empty') { toast(t('That file is empty')); return }
    if (parsed.error) { toast(t("That file's columns aren't recognised — see the docs for supported apps.")); return }
    if (parsed.kind === 'bodyweight' ? !parsed.bodyweight.length : !parsed.workouts.length) {
      toast(t('Nothing to import from that file')); return
    }
    ui().openSheet(close => <ImportSummary parsed={parsed} close={close} />)
    onDone && onDone()
  }
  rd.onerror = () => toast(t('Could not read that file'))
  rd.readAsText(file)
}

/* ============================ target weight ============================ */
/**
 * Target-weight sheet; saving stores the goal drawn on weight charts.
 *
 * @param {Function} close Closes the sheet.
 */
function GoalSheet({ close }) {
  const st = S()
  const bw = latestWeighIn(st)
  const [v, setV] = useState(st.targetW || (bw ? bw.w : 70))
  return <>
    <h3>{t('Target weight')}</h3>
    <div className="muted small">{t('Your goal is drawn as a line through the weight charts, and gains/losses are colored by whether they move toward it.')}</div>
    <WeightInput value={v} setValue={setV} unit={st.unit} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={() => {
      const n = Math.round((v || 0) * 10) / 10
      if (!n || n <= 0) { toast(t('Enter a valid weight')); return }
      update(s => { s.targetW = n }); close()
      const b = latestWeighIn(S()); toast(t('Goal set: {0}', fmtNum(n) + ' ' + st.unit) + (b ? ' (' + t('{0} to go', fmtNum(Math.abs(n - b.w))) + ')' : ''))
    }}>{t('Save goal')}</Button>
    {st.targetW && <><div style={{ height: 8 }} /><Button variant="danger" onClick={() => { update(s => { s.targetW = null }); close(); toast(t('Goal removed')) }}>{t('Remove goal')}</Button></>}
  </>
}
/** Opens the target-weight sheet. */
export const goalSheet = () => ui().openSheet(close => <GoalSheet close={close} />)

/* ============================ profile display name ============================ */
function DisplayNameSheet({ close }) {
  const st = S()
  const [v, setV] = useState(st.displayName || '')
  const clean = sanitizeDisplayName(v)
  const canSave = clean !== null
  const canClear = !!st.displayName
  const save = () => {
    if (!clean) { toast(t('Enter a name')); return }
    update(s0 => { s0.displayName = clean })
    close()
    toast(t('Name saved'))
  }
  const clear = () => {
    update(s0 => { s0.displayName = null })
    close()
    toast(t('Name cleared'))
  }
  return <>
    <h3>{t('Your name')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Shown as “Hi, {0}” on Home. Only on this device.', clean || 'there')}</div>
    <input
      className="input"
      placeholder={t('Enter your name')}
      aria-label={t('Your name')}
      value={v}
      maxLength={24}
      autoFocus
      onChange={e => setV(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') save() }}
    />
    <div className="small dim" style={{ textAlign: 'right', marginTop: 6 }}>{v.trim().length}/24</div>
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save} disabled={!canSave}>{t('Save')}</Button>
    {canClear && <><div style={{ height: 8 }} /><Button variant="ghost" onClick={clear}>{t('Clear name')}</Button></>}
  </>
}
/** Opens the display-name sheet; saving stores the Home greeting name. */
export const displayNameSheet = () => ui().openSheet(close => <DisplayNameSheet close={close} />)

/* ============================ glyph picker ============================ */
// Grouped by what the glyph means for a training day, so picking one is a scan
// of four short rows rather than a hunt through twenty loose icons.
export const glyphPicker = (current, onPick) => {
  const cur = glyphOf(current)
  return ui().openSheet(close => <>
    <h3>{t('Pick an icon')}</h3>
    {GLYPH_GROUPS.map(g => (
      <div key={g.key} style={{ marginBottom: 14 }}>
        <div className="sect-t" style={{ padding: '0 2px 7px' }}>{t(g.key)}</div>
        <div className="glyph-grid">
          {g.items.map(n => (
            <button key={n} className={'glyph-cell' + (n === cur ? ' on' : '')}
              onClick={() => { close(); onPick(n) }} aria-label={n}>
              <Icon name={n} />
            </button>
          ))}
        </div>
      </div>
    ))}
    <div style={{ height: 4 }} />
  </>)
}

/* ============================ share / print / import a plan ============================ */
export const planToolsSheet = () => ui().openSheet(close => <PlanTools close={close} />)

/**
 * Plan share sheet; exporting saves a plan file and importing opens the preview.
 *
 * @param {Function} close Closes the sheet.
 */
function PlanTools({ close }) {
  const st = useStore(s => s.S)
  const fileRef = useRef(null)
  const hasRoutines = (st.routines || []).some(r => r.ex && r.ex.length)

  const exportFile = async () => {
    const bundle = buildPlanBundle(st, '')
    const json = JSON.stringify(bundle, null, 2)
    const name = 'sky-plan-' + todayISO() + '.json'
    if (MOBILE) { try { await shareExport(json, name) } catch (e) { /* dismissed */ } close(); return }
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
    close(); toast(t('Plan file saved — send it to a friend'))
  }
  const pickFile = ev => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return
    const rd = new FileReader()
    rd.onload = () => {
      try { const bundle = parsePlan(rd.result); close(); planImportSheet(bundle) }
      catch (e) { toast(t('Import failed: {0}', e.message)) }
    }
    rd.readAsText(f)
  }

  return <>
    <h3>{t('Share your plan')}</h3>
    <div className="muted small" style={{ marginBottom: 16 }}>{t('Send your routines to a friend, or put your week on paper.')}</div>
    <Button variant="primary" icon="upload" onClick={exportFile} disabled={!hasRoutines}>{t('Export plan file')}</Button>
    <div className="dim small" style={{ margin: '7px 2px 0', lineHeight: 1.4 }}>{t('A small file a friend imports into their own Sky — routines only, none of your workouts or weigh-ins.')}</div>
    {!MOBILE && <>
      <div style={{ height: 12 }} />
      <Button variant="tinted" icon="download" onClick={() => { close(); printPlan(st, '') }} disabled={!hasRoutines}>{t('Print / Save as PDF')}</Button>
      <div className="dim small" style={{ margin: '7px 2px 0', lineHeight: 1.4 }}>{t('A clean one-page-per-plan printout — no exercise ever splits across a page.')}</div>
    </>}
    {!hasRoutines && <div className="dim small" style={{ margin: '12px 2px 0' }}>{t('Add an exercise to a routine first — an empty plan has nothing to share.')}</div>}
    <h4 className="sec">{t('Got a plan from a friend?')}</h4>
    <Button variant="ghost" icon="folder" onClick={() => fileRef.current?.click()}>{t('Import a plan file')}</Button>
    <input ref={fileRef} type="file" accept="application/json,.json" onChange={pickFile} hidden />
  </>
}

/** Opens the plan-import preview for the given bundle. */
export const planImportSheet = bundle => ui().openSheet(close => <PlanImport bundle={bundle} close={close} />)
/**
 * Plan-import preview; saving adds the routines without changing existing ones.
 *
 * @param {Object} bundle Parsed plan bundle.
 * @param {Function} close Closes the sheet.
 */
function PlanImport({ bundle, close }) {
  const [schedule, setSchedule] = useState(false)
  const apply = () => {
    update(s => mergePlan(s, bundle, { schedule }))
    close()
    toast(t('Added {0} routines to your plan', bundle.routineCount))
    nav('/plan')
  }
  return <>
    <h3>{bundle.name ? t('Import “{0}”', bundle.name) : t('Import this plan')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {t(bundle.routineCount === 1 ? '{0} routine' : '{0} routines', bundle.routineCount)}
      {' · ' + exCount(bundle.exerciseCount)}
      {bundle.scheduledDays > 0
        ? ' · ' + t(bundle.scheduledDays === 1 ? 'scheduled on {0} day' : 'scheduled on {0} days', bundle.scheduledDays)
        : ''}
    </div>
    <div className="dim small" style={{ marginBottom: 14, lineHeight: 1.4 }}>{t('These are added as new routines — nothing you already have is changed.')}</div>
    {bundle.dropped > 0 && <div className="small" style={{ color: 'var(--yellow)', marginBottom: 14, lineHeight: 1.4 }}>
      {t(bundle.dropped === 1
        ? '{0} exercise in the file isn’t in your library and was left out.'
        : '{0} exercises in the file aren’t in your library and were left out.', bundle.dropped)}
    </div>}
    {bundle.scheduledDays > 0 && <div className="row between" style={{ padding: '10px 2px', borderTop: '1px solid var(--sep)', borderBottom: '1px solid var(--sep)', marginBottom: 16, gap: 12 }}>
      <div><div className="tt" style={{ fontSize: 15 }}>{t('Use this weekly schedule')}</div><div className="small dim">{t('Replaces your current Mon–Sun assignments.')}</div></div>
      <Switch checked={schedule} label={t('Use this weekly schedule')} onChange={setSchedule} />
    </div>}
    <Button variant="primary" onClick={apply}>{t('Add to my plan')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

/**
 * Day-override sheet body: pick what to train on one date.
 *
 * Lists every routine plus rest, marks the effective choice, and writes
 * `dayPlan[iso]` (or clears it for "back to weekly plan") before closing.
 *
 * @param {string} iso - Calendar date in 'YYYY-MM-DD' format.
 * @param {Function} close - Sheet closer.
 */
function DayOverride({ iso, close }) {
  const st = useStore(s => s.S)
  const wd = new Date(iso + 'T12:00:00').getDay()
  const weeklyR = st.routines.find(r => r.id === st.week[wd])
  const hasOvr = st.dayPlan[iso] !== undefined
  const effId = effectiveRoutineId(st, iso)
  const set = v => {
    update(s => setDayOverride(s, iso, v))
    close()
    toast(v === '' ? t('Back to weekly plan') : v === 'rest' ? t('{0} set to rest', fmtDate(iso)) : t('{0} planned for {1}', (st.routines.find(r => r.id === v) || {}).name, fmtDate(iso)))
  }
  return <>
    <h3>{fmtDate(iso, true)}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Weekly plan:')} {weeklyR ? weeklyR.name : t('Rest')}{hasOvr && <span style={{ color: 'var(--orange)' }}> · {t('changed for this day')}</span>}<br />{t('Sick, missed a day or want a different session? Pick what to train instead.')}</div>
    <div className="list">
      {st.routines.map(r => <div key={r.id} className="item" onClick={() => set(r.id)}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        {effId === r.id && <Icon name="check" className="accent" />}</div>)}
      <div className="item" onClick={() => set('rest')}><span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="moon" /></span><div className="grow"><div className="tt">{t('Rest / skip this day')}</div></div>{effId === null && <Icon name="check" className="accent" />}</div>
      {hasOvr && <div className="item" onClick={() => set('')}><span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="reset" /></span><div className="grow"><div className="tt">{t('Back to weekly plan')}</div></div></div>}
    </div>
  </>
}
/** Opens the day-override sheet for the given date. */
export const dayOverrideSheet = iso => ui().openSheet(close => <DayOverride iso={iso} close={close} />)
/**
 * Weekday-assignment sheet; picking stores the routine for that weekday.
 *
 * @param {number} day Weekday index.
 * @param {Function} close Closes the sheet.
 */
function DayAssign({ day, close }) {
  const st = useStore(s => s.S)
  const set = v => { update(s => assignWeekday(s, day, v)); close() }
  return <>
    <h3>{t(DAYN[day])}</h3>
    <div className="list">
      <div className="item" onClick={() => set('')}><span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="moon" /></span><div className="grow"><div className="tt">{t('Rest day')}</div></div>{!st.week[day] && <Icon name="check" className="accent" />}</div>
      {st.routines.map(r => <div key={r.id} className="item" onClick={() => set(r.id)}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        {st.week[day] === r.id && <Icon name="check" className="accent" />}</div>)}
    </div>
  </>
}
/** Opens the weekday-assignment sheet for the given day. */
export const dayAssignSheet = day => ui().openSheet(close => <DayAssign day={day} close={close} />)

/**
 * Completed-workout detail sheet body with per-exercise set labels and delete.
 *
 * @param {Object} w - Completed workout entity from `S.workouts`.
 * @param {Function} close - Sheet closer.
 */
export function WorkoutDetail({ w, close }) {
  const st = useStore(s => s.S)
  return <>
    <h3>{w.name}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{[fmtDate(w.d, true), ...durPart(w.end - w.start), fmtVol(tonnageOf(w), st.unit), ...(w.bw ? [fmtNum(w.bw) + ' ' + st.unit] : [])].join(' · ')}</div>
    {w.entries.map((e, i) => {
      const ex = EXIDX[e.id]
      return <div key={i} className="row" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
        {ex && <Thumb ex={ex} />}
        <div className="grow"><div className="tt capitalize" style={{ fontWeight: 600 }}>{ex ? ex.n : (e.n || e.id)} {w.prs && w.prs.includes(e.id) && <span className="pr"><Icon name="trophy" />PR</span>}</div>
          <div className="ss">{e.sets.filter(s => s.done).map(s => setLabel(e.id, s, e.target)).join('  ·  ') || t('no sets')}</div>
          {e.notes && <div className="exnote" style={{ margin: '6px 0 0', padding: '6px 10px', fontSize: 14, color: 'var(--label-2)', lineHeight: 1.4 }}>{e.notes}</div>}
        </div>
      </div>
    })}
    <Button variant="danger" onClick={() => confirmSheet({ title: t('Delete workout?'), message: t('This removes it from your history for good.'), confirmText: t('Delete'), danger: true, onConfirm: () => { update(s => { deleteWorkout(s, w.id) }); close(); toast(t('Workout deleted')) } })}>{t('Delete workout')}</Button>
  </>
}
/** Opens the completed-workout detail for the given workout. */
export const workoutDetailSheet = w => ui().openSheet(close => <WorkoutDetail w={w} close={close} />)

/**
 * Monthly calendar sheet body for history navigation and day planning.
 *
 * Dots mark trained/planned/rescheduled days. Tapping a trained day opens its
 * detail; tapping any other day opens the day-override sheet.
 *
 * @param {string} [start] - Any date in the initial month ('YYYY-MM-DD'); defaults to today.
 * @param {Function} close - Sheet closer.
 */
function Calendar({ start, close }) {
  const st = useStore(s => s.S)
  const [cur, setCur] = useState(() => { const d = start ? new Date(start) : new Date(); d.setDate(1); return d })
  const y = cur.getFullYear(), mo = cur.getMonth()
  const byDay = {}
  st.workouts.forEach(w => (byDay[w.d] = byDay[w.d] || []).push(w))
  const startOffset = (new Date(y, mo, 1).getDay() + 6) % 7
  const daysIn = new Date(y, mo + 1, 0).getDate()
  const monthWs = st.workouts.filter(w => w.d.startsWith(y + '-' + String(mo + 1).padStart(2, '0')))
  const monthVol = monthWs.reduce((a, w) => a + tonnageOf(w), 0)
  const monthMs = monthWs.reduce((a, w) => a + Math.max(0, (w.end || w.start) - w.start), 0)
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(<div key={'e' + i} />)
  for (let d = 1; d <= daysIn; d++) {
    const iso = y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0')
    const ws = byDay[iso], effId = effectiveRoutineId(st, iso), ovr = hasEffectiveOverride(st, iso)
    const dotCls = dayStatus({ trained: ws, effId, ovr })
    cells.push(<button key={d} className={'cal-d' + (ws ? ' has' : '') + (iso === todayISO() ? ' today' : '')} onClick={() => {
      if (!ws) { close(); dayOverrideSheet(iso); return }
      if (ws.length === 1) { close(); workoutDetailSheet(ws[0]); return }
      close(); ui().openSheet(c2 => <><h3>{fmtDate(iso, true)}</h3><div className="list">{ws.map(w => <WorkoutRow key={w.id} w={w} onClick={() => { c2(); workoutDetailSheet(w) }} />)}</div></>)
    }}><span>{d}</span><i className={dotCls} /></button>)
  }
  return <>
    <div className="row between" style={{ marginBottom: 2 }}>
      <button className="iconbtn" onClick={() => setCur(new Date(y, mo - 1, 1))} aria-label="Previous month"><Icon name="chevronLeft" /></button>
      <h3 style={{ margin: 0 }}>{t(MONTHS_LONG[mo])} {y}</h3>
      <button className="iconbtn" onClick={() => setCur(new Date(y, mo + 1, 1))} aria-label="Next month"><Icon name="chevronRight" /></button>
    </div>
    <div className="small muted" style={{ textAlign: 'center' }}>{monthWs.length ? `${t(monthWs.length === 1 ? '{0} workout' : '{0} workouts', monthWs.length)} · ${fmtDur(monthMs)} · ${fmtVol(monthVol, st.unit)}` : t('No workouts this month')}</div>
    <div className="cal-grid">{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(l => <div key={l} className="cal-h">{t(l)}</div>)}{cells}</div>
    <div className="cal-legend">
      <span><i style={{ background: 'var(--acc)' }} />{t('Trained')}</span>
      <span><i style={{ background: 'var(--label-3)' }} />{t('Planned')}</span>
      <span><i style={{ background: 'var(--orange)' }} />{t('Rescheduled')}</span>
    </div>
    <div className="small dim" style={{ textAlign: 'center', marginTop: 10 }}>{t('Tap a trained day for details · tap any other day to plan a session')}</div>
  </>
}
/** Opens the monthly calendar sheet starting at the given date. */
export const calendarSheet = start => ui().openSheet(close => <Calendar start={start} close={close} />)

/* ============================ monthly recap ============================ */
export function RecapSheet({ start, close }) {
  const st = useStore(s => s.S)
  const [cur, setCur] = useState(() => {
    const d = start ? new Date(monthKey(start) + '-01T12:00:00') : new Date()
    d.setDate(1)
    return d
  })
  const y = cur.getFullYear(), mo = cur.getMonth()
  const ym = y + '-' + String(mo + 1).padStart(2, '0')
  const isCurrent = ym === monthKey(todayISO())
  const rec = monthRecap(st.workouts || [], st.unit, ym)
  const viewedEmpty = rec.workouts === 0

  const deltaBadge = (key) => {
    const v = rec.deltas?.[key]
    if (v == null) return null
    const prevVal = rec.prev?.[key]
    const isAbs = prevVal === 0 || prevVal == null
    let label = ''
    if (isAbs) {
      if (key === 'vol') label = (v > 0 ? '+' : '') + fmtVol(v, st.unit)
      else if (key === 'durationMs') label = v ? (v > 0 ? '+' : '') + fmtDur(v) : '—'
      else label = (v > 0 ? '+' : '') + fmtNum(v)
    } else {
      const pct = Math.round(v)
      label = (pct > 0 ? '+' : '') + pct + '%'
    }
    const color = v > 0 ? 'var(--acc-text)' : v < 0 ? 'var(--red-text)' : 'var(--label-2)'
    return <span className="delta-pill" style={{ color, background: 'color-mix(in srgb, currentColor 14%, transparent)' }}>{label}</span>
  }

  const MetricRow = ({ label, value, deltaKey }) => (
    <div className="lrow" style={{ justifyContent: 'space-between' }}>
      <div className="lrow-m"><div className="lrow-t">{label}</div></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12, flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {deltaBadge(deltaKey)}
      </div>
    </div>
  )

  return <>
    <div className="row between" style={{ marginBottom: viewedEmpty ? 4 : 12 }}>
      <button className="iconbtn" onClick={() => setCur(new Date(y, mo - 1, 1))} aria-label={t('Previous month')}><Icon name="chevronLeft" /></button>
      <h3 style={{ margin: 0, textAlign: 'center' }}>{t(MONTHS_LONG[mo])} {y}{isCurrent ? ' ' + t('so far') : ''}</h3>
      <button className="iconbtn" onClick={() => setCur(new Date(y, mo + 1, 1))} aria-label={t('Next month')}><Icon name="chevronRight" /></button>
    </div>
    {viewedEmpty && (
      <div className="small muted" style={{ textAlign: 'center', marginBottom: 12 }}>{t('No workouts in {0}', `${t(MONTHS_LONG[mo])} ${y}`)}</div>
    )}
    <div className="sect-b" style={{ maxWidth: 360, margin: '0 auto' }}>
      <MetricRow label={t('Workouts')} value={String(rec.workouts)} deltaKey="workouts" />
      <MetricRow label={t('Time trained')} value={rec.durationMs ? fmtDur(rec.durationMs) : '—'} deltaKey="durationMs" />
      <MetricRow label={t('Volume')} value={fmtVol(rec.vol, st.unit)} deltaKey="vol" />
      <MetricRow label={t('Sets')} value={fmtNum(rec.sets)} deltaKey="sets" />
    </div>
    {(rec.prs.length > 0 || rec.e1prs.length > 0) && (
      <div style={{ marginTop: 14, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
        {rec.prs.length > 0 && (
          <>
            <h4 className="sec" style={{ margin: '10px 0 6px' }}><Icon name="trophy" style={{ fontSize: 14, color: 'var(--yellow)', marginRight: 6 }} />{t('Personal records')}</h4>
            <div className="sect-b">
              {rec.prs.map(id => {
                const name = EXIDX[id]?.n || id
                return <div key={id} className="lrow"><div className="lrow-i" style={{ color: 'var(--yellow)' }}><Icon name="trophy" /></div><div className="lrow-m"><div className="lrow-t capitalize">{name}</div></div></div>
              })}
            </div>
          </>
        )}
        {rec.e1prs.length > 0 && (
          <>
            <h4 className="sec" style={{ margin: '12px 0 6px' }}><Icon name="chartLine" style={{ fontSize: 14, color: 'var(--acc)', marginRight: 6 }} />{t('Estimated 1RM records')}</h4>
            <div className="sect-b">
              {rec.e1prs.map((p, i) => {
                const name = EXIDX[p.id]?.n || p.id
                return <div key={p.id + '-' + i} className="lrow">
                  <div className="lrow-i" style={{ color: 'var(--acc)' }}><Icon name="chartLine" /></div>
                  <div className="lrow-m"><div className="lrow-t capitalize">{name}</div><div className="lrow-s nocap">{fmtNum(p.est)} {st.unit} · {fmtNum(p.w)} × {p.r}</div></div>
                  <div className="lrow-v nocap">{fmtDate(p.d, true)}</div>
                </div>
              })}
            </div>
          </>
        )}
      </div>
    )}
    {rec.prs.length === 0 && rec.e1prs.length === 0 && !viewedEmpty && (
      <div className="small muted" style={{ textAlign: 'center', marginTop: 10 }}>{t('No records this month')}</div>
    )}
    <div style={{ textAlign: 'center', marginTop: 14 }}>
      <Button variant="ghost" trailingIcon="calendar" onClick={() => { close(); calendarSheet(ym + '-01') }}>{t('View calendar')}</Button>
    </div>
  </>
}
/**
 * Opens the monthly recap sheet.
 *
 * @param {string} start Any date in the month to show.
 */
export const recapSheet = (start) => ui().openSheet(close => <RecapSheet start={start} close={close} />)

/* shared small workout row (used in lists) */
export function WorkoutRow({ w, onClick }) {
  const st = useStore(s => s.S)
  const glyph = glyphOf((st.routines.find(r => r.id === w.routineId) || {}).emoji)
  return <div className="item" role="button" tabIndex={0}
    aria-label={`${w.name}, ${fmtDate(w.d, true)}, ${t('{0} sets', setsDone(w))}`}
    onClick={onClick}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick && onClick() } }}>
    <span className="lrow-i" style={{ width: 34, height: 34, borderRadius: 8, fontSize: 19 }}><Icon name={glyph} /></span>
    <div className="grow"><div className="tt">{w.name}</div>
      <div className="ss">{[fmtDate(w.d, true), ...durPart(w.end - w.start), t('{0} sets', setsDone(w)), fmtVol(tonnageOf(w), st.unit)].join(' · ')}</div></div>
    {w.prs && w.prs.length > 0 && <span className="pr"><Icon name="trophy" />{w.prs.length} PR</span>}
    <Icon name="chevronRight" className="chev" />
  </div>
}

/* ============================ session sheets (extracted) ============================ */
// Session domain lives in ./sheets/session.jsx. The hub re-exports every entry
// point so existing callers keep working untouched, and performs the one-line
// wiring for the injected weigh-in seam (plus hub-owned confirm + weight input
// to avoid a circular hub↔session import during migration).
export { startFlow, beginWorkout, topWeightSheet, workoutCompleteSheet, finishWorkout, exerciseNoteSheet } from './sheets/session.jsx'
configureSessionSheets({ bwSheet, confirmSheet, WeightInput })

/* ============================ catalogue sheets (extracted) ============================ */
// Catalogue browsing lives in ./sheets/catalogue.jsx. The hub re-exports every
// entry point so existing callers keep working untouched, and performs the
// one-line wiring for the injected confirm seam to avoid a circular
// hub↔catalogue import during migration.
export { ExerciseDetail, exerciseDetailSheet, addToRoutineSheet, CustomExForm, customExSheet, deleteCustomEx, ExercisePicker, exercisePicker, ExConfig, exConfigSheet } from './sheets/catalogue.jsx'
configureCatalogueSheets({ confirmSheet })
