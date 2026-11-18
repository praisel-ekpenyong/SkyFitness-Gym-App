import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { fmtNum, fmtSigned, fmtVol } from '../lib/format.js'
import { fmtDate, todayISO } from '../lib/dates.js'
import { recordWeighIn, deleteWeighIn, latestWeighIn } from '../lib/bodyweight.js'
import { t } from '../lib/i18n.js'
import { nav } from '../platform/nav.js'
import Icon from '../components/Icon.jsx'
import { Button, NumberField } from '../components/ui.jsx'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)

/* ============================ weight input (shared: body weight, target weight) ============================ */
const W_LO = 1
const W_STEP = 0.1
/** Ceiling of a weigh-in or target weight, for the given unit. */
const wHi = unit => (unit === 'lb' ? 660 : 300)
/** A weight to the tenth it is stored at. */
const tenth = x => Math.round((x || 0) * 10) / 10
/** A weight to the tenth, held inside the range for the unit. */
const clampW = (x, unit) => Math.max(W_LO, Math.min(wHi(unit), tenth(x)))

/**
 * A typeable weight with a step key either side. A typed figure is held to the range when the
 * field is left; the sheets clamp again on save, so a press of Save without leaving it is held too.
 */
function WeightInput({ value, setValue, unit, label }) {
  const by = dir => setValue(clampW((Number(value) || 0) + dir * W_STEP, unit))
  return (
    <div className="bwstep">
      <button className="bw-pm" onClick={() => by(-1)} aria-label={t('Decrease by {0} {1}', fmtNum(W_STEP), unit)}>
        {fmtSigned(-W_STEP)}
      </button>
      <label className="bw-read">
        <NumberField className="bw-num" value={value} onChange={setValue} onBlur={() => setValue(clampW(value, unit))} aria-label={t('{0} ({1})', label, unit)} />
        <span className="u">{unit}</span>
      </label>
      <button className="bw-pm" onClick={() => by(1)} aria-label={t('Increase by {0} {1}', fmtNum(W_STEP), unit)}>
        {fmtSigned(W_STEP)}
      </button>
    </div>
  )
}

/* ============================ body weight ============================ */
function BwSheet({ required, onDone, close }) {
  const st = useStore(s => s.S)
  const unit = st.unit
  const bw = latestWeighIn(st)
  const [v, setV] = useState(bw ? bw.w : 70)
  const save = () => {
    if (!tenth(v)) { toast(t('Enter a valid weight')); return }
    const n = clampW(v, unit)
    update(s => { recordWeighIn(s, { d: todayISO(), w: n, t: Date.now() }) })
    close()
    if (onDone) onDone(n); else toast(t('Weight saved'))
  }
  const recent = [...st.bodyweight].reverse().slice(0, 3)
  const delEntry = d => update(s => { deleteWeighIn(s, d) })
  return (
    <>
      <h3>{required ? t('Quick check-in') : t('Log body weight')}</h3>
      <div className="sheet-sub">
        {required
          ? t('Asked once a day, before your first workout, so the curve has a point for every training day.')
          : t('{0}, {1}', t('Today'), fmtDate(todayISO(), true))}
      </div>
      <WeightInput value={v} setValue={setV} unit={unit} label={t('Body weight')} />
      <div className="gap16" />
      <Button variant="primary" className={required ? 'go' : undefined} onClick={save}>
        {required ? t('Save and start workout') : t('Save')}
      </Button>
      {required && (
        <>
          <div className="gap8" />
          <Button variant="ghost" className="dim" onClick={() => { close(); onDone && onDone(null) }}>
            {t('Start without weighing in')}
          </Button>
          <Button variant="ghost" className="dim" icon="reset" onClick={() => { close(); nav('/workout') }}>
            {t('Choose a different workout')}
          </Button>
        </>
      )}
      {!required && recent.length > 0 && (
        <>
          <h4 className="sec">{t('Recent weigh-ins')}</h4>
          <div>
            {recent.map(b => (
              <div key={b.d} className="wi-log">
                <span className="small muted">{fmtDate(b.d, true)}</span>
                <span className="row">
                  <b>{fmtNum(b.w)} <span className="u">{unit}</span></b>
                  <button className="iconbtn bare" onClick={() => delEntry(b.d)} aria-label={t('Delete entry for {0}', fmtDate(b.d, true))}>
                    <Icon name="trash" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
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

/* ============================ goal weight ============================ */
function GoalSheet({ close }) {
  const st = S()
  const bw = latestWeighIn(st)
  const [v, setV] = useState(st.targetW || (bw ? bw.w : 70))
  return (
    <>
      <h3>{t('Goal weight')}</h3>
      <div className="sheet-sub">
        {t('Your goal is drawn as a line through the weight charts, and gains/losses are colored by whether they move toward it.')}
      </div>
      <WeightInput value={v} setValue={setV} unit={st.unit} label={t('Goal weight')} />
      <div className="gap16" />
      <Button variant="primary" onClick={() => {
        if (!tenth(v)) { toast(t('Enter a valid weight')); return }
        const n = clampW(v, st.unit)
        update(s => { s.targetW = n })
        close()
        const b = latestWeighIn(S())
        toast(b ? t('Goal set: {0} ({1})', fmtVol(n, st.unit), t('{0} to go', fmtNum(Math.abs(n - b.w)))) : t('Goal set: {0}', fmtVol(n, st.unit)))
      }}>
        {t('Save goal')}
      </Button>
      {st.targetW && (
        <>
          <div className="gap8" />
          <Button variant="danger" onClick={() => { update(s => { s.targetW = null }); close(); toast(t('Goal removed')) }}>
            {t('Remove goal')}
          </Button>
        </>
      )}
    </>
  )
}

/** Opens the target-weight sheet. */
export const goalSheet = () => ui().openSheet(close => <GoalSheet close={close} />)
