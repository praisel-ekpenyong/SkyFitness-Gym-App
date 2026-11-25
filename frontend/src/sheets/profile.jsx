import { useState } from 'react'
import { sanitizeDisplayName } from '../store/useStore.js'
import { cleanBirthYear } from '../lib/birth-year.js'
import { Button } from '../components/ui.jsx'
import { t } from '../lib/i18n.js'
import { S, update, ui, toast } from './store-helpers.js'

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
  return (
    <>
      <h3>{t('Your name')}</h3>
      <div className="sheet-sub">{t('Shown as “Hi, {0}” on Home. Only on this device.', clean || 'there')}</div>
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
      <div className="small dim char-count">{v.trim().length}/24</div>
      <div className="gap16" />
      <Button variant="primary" onClick={save} disabled={!canSave}>{t('Save')}</Button>
      {canClear && <><div className="gap8" /><Button variant="ghost" onClick={clear}>{t('Clear')}</Button></>}
    </>
  )
}
export const displayNameSheet = () => ui().openSheet(close => <DisplayNameSheet close={close} />)

/** Sets one optional Profile field, closes its sheet and confirms with a toast. Shared by the Profile field sheets. */
function setProfileField(close, field, value, message) {
  update(s0 => { s0[field] = value })
  close()
  toast(message)
}

/** The ghost clear action under a Profile field sheet's primary button; absent while nothing is set. */
function ClearFieldButton({ show, label, onClick }) {
  return !!show && <><div className="gap8" /><Button variant="ghost" onClick={onClick}>{label}</Button></>
}

function SexSheet({ close }) {
  const st = S()
  const choose = value => setProfileField(close, 'sex', value, value ? t('Sex saved') : t('Sex cleared'))
  return (
    <>
      <h3>{t('Sex')}</h3>
      <div className="sheet-sub">{t('Only used to pick the strength standards. Stays on this device.')}</div>
      <div className="gap16" />
      <Button variant="primary" onClick={() => choose('male')}>{t('Male')}</Button>
      <div className="gap8" />
      <Button variant="primary" onClick={() => choose('female')}>{t('Female')}</Button>
      <ClearFieldButton show={st.sex} label={t('Clear')} onClick={() => choose(null)} />
    </>
  )
}
/** Opens the sex sheet (strength standards only). */
export const sexSheet = () => ui().openSheet(close => <SexSheet close={close} />)

function BirthYearSheet({ close }) {
  const st = S()
  const [v, setV] = useState(st.birthYear ? String(st.birthYear) : '')
  const clean = /^\d{4}$/.test(v) ? cleanBirthYear(Number(v), Date.now()) : null
  const future = /^\d{4}$/.test(v) && Number(v) > new Date(Date.now()).getFullYear()
  const hint = future ? t("Birth year can't be in the future") : (v && clean === null ? t('Enter a four-digit year') : null)
  const save = () => {
    if (clean === null) { toast(t('Enter a four-digit year')); return }
    setProfileField(close, 'birthYear', clean, t('Birth year saved'))
  }
  const clear = () => setProfileField(close, 'birthYear', null, t('Birth year cleared'))
  return (
    <>
      <h3>{t('Birth year')}</h3>
      <div className="sheet-sub">{t('Adjusts strength levels from age 40. Stays on this device.')}</div>
      <input
        className="input"
        inputMode="numeric"
        placeholder="1990"
        aria-label={t('Birth year')}
        value={v}
        maxLength={4}
        autoFocus
        onChange={e => setV(e.target.value.replace(/\D/g, ''))}
        onKeyDown={e => { if (e.key === 'Enter') save() }}
      />
      {hint && <div className="small dim" role="alert">{hint}</div>}
      <div className="gap16" />
      <Button variant="primary" onClick={save} disabled={clean === null}>{t('Save')}</Button>
      <ClearFieldButton show={st.birthYear} label={t('Clear')} onClick={clear} />
    </>
  )
}
/** Opens the birth year sheet (age adjustment for strength levels only). */
export const birthYearSheet = () => ui().openSheet(close => <BirthYearSheet close={close} />)
