import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { isCardio, isBodyweightEq } from '../lib/exercises.js'
import { fmtVol, sentenceCase } from '../lib/format.js'
import { fmtDate } from '../lib/dates.js'
import { setLabel } from '../lib/set-label.js'
import { best as bestOf, best1RM, lastSession } from '../lib/training-log.js'
import * as catalogueWrites from '../lib/catalogue-writes.js'
import { t, instrFor } from '../lib/i18n.js'
import Media from '../components/Media.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Stepper } from '../components/ui.jsx'
import { MUSCLE_NAME, primaryMuscleOf, secondaryMusclesOf } from '../lib/muscles.js'
import { estimate1RM, REP_CAP } from '../lib/onerm.js'
import { strengthLevelOf } from '../lib/strength-level.js'
import { ExerciseStrengthLine } from '../components/StrengthLine.jsx'
import { addToRoutineSheet } from './add-to-routine.jsx'
import { customExSheet, deleteCustomEx } from './custom-exercise.jsx'
import { update, ui } from './store-helpers.js'

/** @typedef {import('../lib/types.js').CustomExercise} CustomExercise */

function OneRM({ ex }) {
  const st = useStore(s => s.S)
  const best = best1RM(st, ex.id)
  const [w, setW] = useState(best ? best.w : bestOf(st, ex.id) || 20)
  const [r, setR] = useState(best ? best.r : 5)
  const est = estimate1RM(w, r)
  if (isBodyweightEq(ex) && !best) return null
  return <>
    <h4 className="sec">{t('Estimated 1RM')}</h4>
    {best && <div className="onerm-now">
      {t('From your log:')} <b className="record">{fmtVol(best.est, st.unit)}</b>
      <span className="dim"> · {t('{0} × {1} on {2}', fmtVol(best.w, st.unit), best.r, fmtDate(best.d, true))}</span>
    </div>}
    <div className="row cfgrow onerm-in">
      <Stepper label={t('Weight ({0})', st.unit)} value={w} step={2.5} onChange={setW} />
      <Stepper label={t('Reps')} value={r} step={1} decimal={false} onChange={setR} />
    </div>
    <div className="row between onerm-out">
      <span className="muted small">{t('Estimate')}</span>
      <b className="onerm-est">{est === null ? '—' : fmtVol(est, st.unit)}</b>
    </div>
    <div className="small dim">{est === null
      ? t('Enter a weight and 1–{0} reps — beyond that an estimate is guesswork.', REP_CAP)
      : t('Epley formula — a calculation from one set, not a tested max.')}</div>
  </>
}

/**
 * Exercise-detail sheet; Add opens the routine picker and Edit opens the custom form.
 *
 * @param {CustomExercise} ex Dataset exercise.
 * @param {Function} close Closes the sheet.
 */
export function ExerciseDetail({ ex, close }) {
  const st = useStore(s => s.S)
  const last = lastSession(st, ex.id)
  const best = bestOf(st, ex.id)
  const strength = strengthLevelOf(st, ex.id, Date.now())
  const favs = st.favorites || []
  const isFav = favs.includes(ex.id)
  const isCardioEx = isCardio(ex)
  const primary = primaryMuscleOf(ex)
  const primaryName = primary ? (MUSCLE_NAME[primary] || primary) : null
  const secondaries = secondaryMusclesOf(ex)
  return <>
    <div className="row between sheet-title-row">
      <h3 className="flush">{ex.n}</h3>
      <button
        className={'iconbtn bare' + (isFav ? ' on-ss' : '')}
        aria-label={isFav ? t('Remove from favorites') : t('Add to favorites')}
        onClick={() => {
          update(s => { catalogueWrites.toggleFavorite(s, ex.id) })
        }}
      >
        <Icon name={isFav ? 'starFill' : 'star'} />
      </button>
    </div>
    <Media ex={ex} />
    <div className="row detail-tags">
      {isCardioEx ? (
        <span className="tag strong">{t('Cardio')}</span>
      ) : (
        primaryName && <span className="tag strong nocap">{t('Primary: {0}', sentenceCase(primaryName))}</span>
      )}
      {ex.eq && <span className="tag nocap">{sentenceCase(t(ex.eq))}</span>}
      {!isCardioEx && secondaries.map((s, i) => <span key={i} className="tag nocap">{t('Secondary: {0}', sentenceCase(MUSCLE_NAME[s] || s))}</span>)}
    </div>
    {ex.desc && <div className="exnote">{ex.desc}</div>}
    {best > 0 && <div className="small row best-line"><Icon name="trophy" /><span>{t('Best')} <b>{fmtVol(best, st.unit)}</b>{last ? ` · ${t('last {0} · {1}', fmtDate(last.d), last.sets.map(s => setLabel(ex.id, s, last.target)).join(', '))}` : ''}</span></div>}
    {strength && <ExerciseStrengthLine reading={strength} unit={st.unit} />}
    <div className="gap8" />
    <Button variant="primary" icon="plus" onClick={() => addToRoutineSheet(ex)}>{t('Add to a routine')}</Button>
    {ex.custom && <div className="split">
      <Button icon="pencil" onClick={() => { close(); customExSheet(ex) }}>{t('Edit')}</Button>
      <Button variant="danger" icon="trash" onClick={() => deleteCustomEx(ex, close)}>{t('Delete')}</Button>
    </div>}
    {!isCardioEx && <OneRM ex={ex} />}
    {instrFor(ex).length > 0 && <><h4 className="sec">{t('How to')}</h4><ol className="steps-list">{instrFor(ex).map((s, i) => <li key={i}>{s}</li>)}</ol></>}
  </>
}
export const exerciseDetailSheet = ex => ui().openSheet(close => <ExerciseDetail ex={ex} close={close} />)
