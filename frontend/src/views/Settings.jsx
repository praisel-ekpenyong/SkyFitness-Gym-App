import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, DEF, hasData } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { ACCENTS, todayISO, localTZ } from '../lib/format.js'
import { effortOf } from '../lib/effort.js'
import { wakeLockSupported } from '../lib/wakelock.js'
import { t } from '../lib/i18n.js'
import { MOBILE, shareExport, syncReminder } from '../lib/mobile.js'
import { backupDue, validateBackup } from '../lib/storage.js'
import { restoreFromBackup, resetProfile } from '../lib/restore.js'
import { loadStarterPlan, loadHypertrophyPlan, confirmSheet, importFromApp, displayNameSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import Mark from '../components/Mark.jsx'
import { Section, Row, SelectRow, Switch, Segmented } from '../components/ui.jsx'

export default function Settings() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const { update } = useStore()
  const toast = useUI(s => s.toast)
  const fileRef = useRef(null)
  const importRef = useRef(null)
  const wakeOK = wakeLockSupported()
  const IS_ANDROID = /android/i.test(navigator.userAgent)

  const stampExported = () => update(s => { s.lastExport = Date.now() })
  const doExport = async () => {
    const json = JSON.stringify(S, null, 2)
    const name = 'sky-backup-' + todayISO() + '.json'
    // WKWebView can't download blob URLs — the native build hands the file to the share sheet.
    if (MOBILE) {
      try { await shareExport(json, name); toast(t('Backup exported')); stampExported() } catch (e) {}
      return
    }
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
    toast(t('Backup exported'))
    stampExported()
  }
  const doImport = ev => {
    const f = ev.target.files[0]; if (!f) return
    const rd = new FileReader()
    rd.onload = () => {
      try {
        const data = JSON.parse(rd.result)
        validateBackup(data)
        confirmSheet({ title: t('Import backup?'), message: t('This replaces all current data with the backup file.'), confirmText: t('Import'), danger: true, onConfirm: () => { restoreFromBackup(data) } })
      } catch (e) { toast(t('Import failed: {0}', e.message)) }
    }
    rd.readAsText(f)
  }

  return <div className="narrow settings">
    <div className="hdr hdr-back">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div className="grow"><h1>{t('Settings')}</h1></div>
    </div>

    <Section title={t('Your data')}>
      <Row icon="lock" title={t('All data stays on this device')}
        subtitle={t('No account, no cloud — back it up anytime with Export below.')} />
      {hasData(S) && backupDue(S.lastExport, Date.now()) && (
        <Row icon="shield" title={t('Time for a backup?')}
          subtitle={t("It's been a while since your last export — take one so a lost phone can't take your log with it.")}
          accessory="chevron" onClick={doExport} />
      )}
    </Section>
    <Section title={t('Profile')}>
      <Row icon="person" title={t('Display name')}
        subtitle={S.displayName ? t('Shown in the greeting on Home') : t('Not set — Home says “Hi there”')}
        value={S.displayName || ''} accessory="chevron" onClick={displayNameSheet} />
    </Section>
    <Section title={t('General')} footer={t('Note: switching units only changes the label — logged numbers are not converted.')}>
      <Row icon="scale" title={t('Weight unit')}>
        <Segmented className="seg-inline" label={t('Weight unit')}
          options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]}
          value={S.unit} onChange={v => update(s => { s.unit = v })} />
      </Row>
    </Section>

    <Section title={t('During a workout')}>
      <SelectRow icon="timer" title={t('Rest duration')}
        value={S.restSec} onChange={v => update(s => { s.restSec = v })}
        options={[60, 90, 120, 150, 180].map(v => ({ value: v, label: v + 's' }))} />
      {(wakeOK || !MOBILE) && (
        <Row icon="sun" title={t('Keep screen awake')}
          subtitle={wakeOK ? t('The screen stays on while a workout is running, so you don’t have to unlock your phone between sets.') : t('Not supported in this browser.')}>
          <Switch checked={wakeOK && S.keepAwake !== false} disabled={!wakeOK} label={t('Keep screen awake')}
            onChange={v => update(s => { s.keepAwake = v })} />
        </Row>
      )}
      <Row icon="bell" title={t('Sounds')}>
        <Switch checked={!!S.sound} label={t('Sounds')} onChange={v => update(s => { s.sound = v })} />
      </Row>
      <Row icon="target" title={t('Effort per set')}>
        <button className="helpbtn" aria-label={t('What are RIR and RPE?')} onClick={effortHelpSheet}><Icon name="info" /></button>
        <Segmented className="seg-inline" label={t('Effort per set')}
          options={[{ value: 'none', label: t('Off') }, { value: 'rir', label: t('RIR') }, { value: 'rpe', label: t('RPE') }]}
          value={effortOf(S)} onChange={v => update(s => { s.effort = v })} />
      </Row>
    </Section>

    <NotificationsCard S={S} update={update} toast={toast} />

    <Section title={t('Appearance')}>
      <Row icon="moon" title={t('Theme')}>
        <Segmented
          className="seg-inline" label={t('Theme')}
          options={[{ value: 'dark', icon: 'moon', label: t('Dark') }, { value: 'light', icon: 'sun', label: t('Light') }]}
          value={S.theme === 'light' ? 'light' : 'dark'}
          onChange={v => update(s => { s.theme = v })}
        />
      </Row>
      <Row icon="figureStrength" title={t('Body diagram')}>
        <Segmented
          className="seg-inline" label={t('Body diagram')}
          options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]}
          value={S.body === 'female' ? 'female' : 'male'}
          onChange={v => update(s => { s.body = v })}
        />
      </Row>
      <div className="lrow accent-row">
        <span className="lrow-t" id="accent-label">{t('Accent color')}</span>
        <div className="swatches" role="radiogroup" aria-labelledby="accent-label">
          {Object.entries(ACCENTS).map(([k, c]) => {
            const on = (S.accent || 'lime') === k
            return (
              <button key={k} className={'swatch' + (on ? ' on' : '')}
                style={{ background: c }} onClick={() => update(s => { s.accent = k })}
                role="radio" aria-checked={on}
                aria-label={t('Accent {0}', k)} />
            )
          })}
        </div>
      </div>
    </Section>

    <Section title={t('Data')}>
      <Row icon="calendar" title={t('Load starter plan')} subtitle={t('Push / Pull / Legs, three days a week')} accessory="chevron" onClick={loadStarterPlan} />
      <Row icon="calendar" title={t('Load 5-day hypertrophy plan')} subtitle={t('Upper / Lower / Push / Pull / Legs, five days a week')} accessory="chevron" onClick={loadHypertrophyPlan} />
      <Row icon="shuffle" title={t('Import from another app')}
        subtitle={t('FitNotes, Strong, Hevy — or body weight from Apple Health')}
        accessory="chevron" onClick={() => importRef.current.click()} />
      <Row icon="upload" title={t('Import backup')} accessory="chevron" onClick={() => fileRef.current.click()} />
      <Row icon="download" title={t('Export backup (JSON)')} accessory="chevron" onClick={doExport} />
      <Row icon="trash" title={t('Reset everything')} danger onClick={() => confirmSheet({ title: t('Reset everything?'), message: t('Deletes your plan, workouts and body weight on this device. This cannot be undone.'), confirmText: t('Delete everything'), danger: true, onConfirm: () => { resetProfile(); nav('/home'); toast(t('All data reset')) } })} />
    </Section>
    <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={doImport} />
    <input ref={importRef} type="file" accept=".csv,.xml,text/csv,text/xml" hidden
      onChange={ev => { const f = ev.target.files[0]; if (f) importFromApp(f); ev.target.value = '' }} />

    {!MOBILE && <Section title={t('Tip')}>
      <Row icon="lightbulb"
        title={IS_ANDROID ? t('In Chrome: ⋮ menu → Add to Home screen') : t('In Safari: Share → Add to Home Screen')}
        subtitle={t('to install Sky as a full-screen app. Your data never leaves this device, so export a backup now and then.')} />
    </Section>}

    <div className="dim small settings-about"><Mark size={12} /> Sky · {t('free and open source (MIT)')}</div>
  </div>
}

const EFFORT_ROWS = [
  ['0', '10', 'Nothing left — went to failure'],
  ['1', '9', 'One more rep in the tank'],
  ['2', '8', 'Two more reps'],
  ['3', '7', 'Three more reps'],
  ['4+', '≤6', 'Easy — warm-up territory'],
]
const EFFORT_TYPICAL = 2

function effortHelpSheet() {
  useUI.getState().openSheet(close => <>
    <h3>{t('Effort per set')}</h3>
    <div className="sheet-sub">
      {t('How hard a set was, logged next to weight and reps. Two scales for the same judgement, counted from opposite ends.')}
    </div>
    <div className="efftbl">
      <div className="r hd"><span className="n">{t('RIR')}</span><span className="n">{t('RPE')}</span><span className="f">{t('How it felt')}</span></div>
      {EFFORT_ROWS.map(([rir, rpe, feel], i) => (
        <div key={rir} className={'r' + (i === EFFORT_TYPICAL ? ' on' : '')}>
          <span className="n">{rir}</span><span className="n">{rpe}</span><span className="f">{t(feel)}</span>
        </div>
      ))}
    </div>
    <div className="dim small eff-notes">
      <div>{t('RIR counts the reps you left; RPE reads the same effort off a 10-point scale — so RPE ≈ 10 − RIR. Pick the one you already think in.')}</div>
      <div>{t('The highlighted row is where most working sets land. Sets you have already logged keep their own scale, and nothing else reads the value — progression and estimated 1RM are unaffected.')}</div>
    </div>
    <div className="gap8" />
  </>)
}

function NotificationsCard({ S, update, toast }) {
  const setReminder = patch => update(s => { s.reminder = { ...(s.reminder || DEF.reminder), ...patch, tz: localTZ() } })
  const toggle = async () => {
    const on = !S.reminder?.on
    if (on) {
      const ok = await syncReminder({ ...S, reminder: { ...(S.reminder || DEF.reminder), on: true } }, true)
      if (!ok) { toast(t('Could not change notification settings')); return }
    }
    setReminder({ on })
  }
  return (
    <Section title={t('Notifications')}
      footer={S.reminder?.on ? t('Reminds you at this time on days that have a routine planned.') : null}>
      <Row icon="calendar" title={t('Workout day reminder')}>
        <Switch checked={!!S.reminder?.on} label={t('Workout day reminder')} onChange={toggle} />
      </Row>
      {S.reminder?.on && (
        <Row icon="clock" title={t('Reminder time')}>
          <input type="time" className="timef" aria-label={t('Reminder time')} value={S.reminder?.time || DEF.reminder.time}
            onChange={e => setReminder({ time: e.target.value })} />
        </Row>
      )}
    </Section>
  )
}
