import { useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { applyStarterPlan } from '../lib/starter.js'
import { applyHypertrophyPlan } from '../lib/plans/hypertrophy-5day.js'
import { buildPlanBundle, parsePlan, mergePlan } from '../lib/plan-share.js'
import { printPlan } from '../platform/print-plan.js'
import { shareExport, MOBILE } from '../platform/mobile.js'
import { exCount } from '../lib/format.js'
import { todayISO } from '../lib/dates.js'
import { nav } from '../platform/nav.js'
import { Button, Switch } from '../components/ui.jsx'
import { t } from '../lib/i18n.js'

const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)

/**
 * Load the built-in Push/Pull/Legs starter plan into the store.
 *
 * Appends three routines and assigns them to Mon/Wed/Fri, then shows a confirmation toast.
 */
export function loadStarterPlan() {
  update(st => { applyStarterPlan(st) })
  toast(t('Starter plan loaded — Mon Push · Wed Pull · Fri Legs'))
}

/**
 * Adds the 5-day hypertrophy plan's routines and custom exercises, assigns Mon/Tue/Thu/Fri/Sat,
 * and says whether the rest timer moved to 3 minutes.
 */
export function loadHypertrophyPlan() {
  let restChanged = false
  update(st => { restChanged = applyHypertrophyPlan(st).restChanged })
  toast(restChanged
    ? t('5-day plan loaded — Mon Upper · Tue Lower · Thu Push · Fri Pull · Sat Legs. Rest timer set to 3 min.')
    : t('5-day plan loaded — Mon Upper · Tue Lower · Thu Push · Fri Pull · Sat Legs'))
}

export const planToolsSheet = () => ui().openSheet(close => <PlanTools close={close} />)

function PlanTools({ close }) {
  const st = useStore(s => s.S)
  const fileRef = useRef(null)
  const hasRoutines = (st.routines || []).some(r => r.ex && r.ex.length)

  const exportFile = async () => {
    const bundle = buildPlanBundle(st, '')
    const json = JSON.stringify(bundle, null, 2)
    const name = 'sky-plan-' + todayISO() + '.json'
    if (MOBILE) { try { await shareExport(json, name) } catch (e) {} close(); return }
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

  return (
    <>
      <h3>{t('Share your plan')}</h3>
      <div className="sheet-sub">{t('Send your routines to a friend, or put your week on paper.')}</div>
      <Button variant="primary" icon="upload" onClick={exportFile} disabled={!hasRoutines}>{t('Export plan file')}</Button>
      <div className="sheet-note">{t('A small file a friend imports into their own Sky — routines only, none of your workouts or weigh-ins.')}</div>
      {!MOBILE && (
        <>
          <div className="gap12" />
          <Button variant="tinted" icon="download" onClick={() => { close(); printPlan(st, '') }} disabled={!hasRoutines}>{t('Print / Save as PDF')}</Button>
          <div className="sheet-note">{t('A clean one-page-per-plan printout — no exercise ever splits across a page.')}</div>
        </>
      )}
      {!hasRoutines && <div className="sheet-note">{t('Add an exercise to a routine first — an empty plan has nothing to share.')}</div>}
      <h4 className="sec">{t('Got a plan from a friend?')}</h4>
      <Button variant="ghost" icon="folder" onClick={() => fileRef.current?.click()}>{t('Import a plan file')}</Button>
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={pickFile} hidden />
    </>
  )
}

export const planImportSheet = bundle => ui().openSheet(close => <PlanImport bundle={bundle} close={close} />)
function PlanImport({ bundle, close }) {
  const [schedule, setSchedule] = useState(false)
  const apply = () => {
    update(s => mergePlan(s, bundle, { schedule }))
    close()
    toast(t('Added {0} routines to your plan', bundle.routineCount))
    nav('/plan')
  }
  return (
    <>
      <h3>{bundle.name ? t('Import “{0}”', bundle.name) : t('Import this plan')}</h3>
      <div className="sheet-sub">
        {t(bundle.routineCount === 1 ? '{0} routine' : '{0} routines', bundle.routineCount)}
        {' · ' + exCount(bundle.exerciseCount)}
        {bundle.scheduledDays > 0
          ? ' · ' + t(bundle.scheduledDays === 1 ? 'scheduled on {0} day' : 'scheduled on {0} days', bundle.scheduledDays)
          : ''}
      </div>
      <div className="dim-note small dim">{t('These are added as new routines — nothing you already have is changed.')}</div>
      {bundle.dropped > 0 && (
        <div className="warn-note">
          {t(bundle.dropped === 1
            ? '{0} exercise in the file isn’t in your library and was left out.'
            : '{0} exercises in the file aren’t in your library and was left out.', bundle.dropped)}
        </div>
      )}
      {bundle.scheduledDays > 0 && (
        <div className="sheet-toggle">
          <div><div className="tt">{t('Use this weekly schedule')}</div><div className="small dim">{t('Replaces your current Mon–Sun assignments.')}</div></div>
          <Switch checked={schedule} label={t('Use this weekly schedule')} onChange={setSchedule} />
        </div>
      )}
      <Button variant="primary" onClick={apply}>{t('Add to my plan')}</Button>
      <div className="gap8" />
      <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
    </>
  )
}
