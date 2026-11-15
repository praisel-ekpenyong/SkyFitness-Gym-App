import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXIDX } from '../lib/exercises.js'
import { fmtNum, fmtDurParts, fmtDate, todayISO } from '../lib/format.js'
import { latestWeighIn } from '../lib/bodyweight.js'
import { setsDone, workSetsDone, sessionProgress, isPerformed, isWarmupRow, tonnageOf } from '../lib/workout-model.js'
import { sessionProgressionItems } from '../lib/progression.js'
import { playWorkoutComplete } from '../lib/sound.js'
import { t } from '../lib/i18n.js'
import { nav } from '../lib/nav.js'
import Icon from '../components/Icon.jsx'
import { Button, Switch, TextArea } from '../components/ui.jsx'
import BodyMap from '../components/BodyMap.jsx'
import SessionMuscleDistribution from '../components/SessionMuscleDistribution.jsx'
import { loadOfWorkouts, MUSCLE_NAME } from '../lib/muscles.js'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)
const snd = () => S().sound

let _bwSheet = null
let _confirmSheet = null
/**
 * Wires the weigh-in and confirm seams for session sheets.
 *
 * @param {Function} bwSheet Weigh-in sheet opener.
 * @param {Function} confirmSheet Hub confirm dialog.
 */
export function configureSessionSheets({ bwSheet, confirmSheet }) {
  if (bwSheet) _bwSheet = bwSheet
  if (confirmSheet) _confirmSheet = confirmSheet
}

export function startFlow(routineId) {
  if (!_bwSheet) throw new Error('session sheets not wired: missing bwSheet')
  const weighed = latestWeighIn(useStore.getState().S)
  if (weighed && weighed.d === todayISO()) return beginWorkout(routineId, weighed.w)
  _bwSheet({ required: true, onDone: bw => beginWorkout(routineId, bw) })
}
/**
 * Starts the session for a routine and navigates to the workout view.
 *
 * @param {string} routineId Routine to start, if any.
 * @param {number} bw Weighed-in body weight, if any.
 */
export function beginWorkout(routineId, bw) {
  useStore.getState().beginSession(routineId, bw)
  useUI.getState().stopRest()
  nav('/workout')
}
/**
 * In-session exercise note sheet: allows reading, editing, or clearing an exercise's setup/cues.
 *
 * @param {number} entryIdx Active entry index.
 * @param {Function} close Closes the sheet.
 */
export function ExerciseNoteSheet({ entryIdx, close }) {
  const st = useStore(s => s.S)
  const A = st.active
  const entry = A?.entries?.[entryIdx]
  const ex = entry && (EXIDX[entry.id] || { n: entry.id })
  const [val, setVal] = useState(entry?.notes || '')
  useEffect(() => { if (!entry) close() }, [!entry, close])

  if (!entry || !ex) return null

  const save = () => {
    useStore.getState().updateActiveExerciseNote(entryIdx, val)
    close()
  }

  const clear = () => {
    useStore.getState().updateActiveExerciseNote(entryIdx, '')
    close()
  }

  return <>
    <h3>{t('Note')} · {ex.n}</h3>
    <TextArea
      autoFocus
      aria-label={t('Exercise note')}
      placeholder={t('Notes, cues, or machine setup…')}
      maxLength={500}
      value={val}
      onChange={e => setVal(e.target.value)}
    />
    <div className="small dim char-count">{val.length}/500</div>
    <Button variant="primary" onClick={save}>{t('Save note')}</Button>
    {entry.notes ? <>
      <div className="gap8" />
      <Button variant="ghost" className="dim" onClick={clear}>{t('Clear note')}</Button>
    </> : null}
  </>
}
export const exerciseNoteSheet = entryIdx => ui().openSheet(close => <ExerciseNoteSheet entryIdx={entryIdx} close={close} />)

function WorkoutComplete({ close }) {
  return <div className="confirm">
    <h3>{t("That's the whole workout!")}</h3>
    <div className="confirm-msg">{t('Every exercise done — great work. Finish up, or keep going and add another exercise.')}</div>
    <Button variant="primary" className="go" icon="flag" onClick={() => { close(); finishWorkout() }}>{t('Finish workout')}</Button>
    <div className="gap8" />
    <Button onClick={() => { close(); useUI.getState().toast(t('Keep going — tap “+ Add exercise” below')) }}>{t('Continue workout')}</Button>
  </div>
}
export const workoutCompleteSheet = () => ui().openSheet(close => <WorkoutComplete close={close} />, { kind: 'center' })
export const getProgressionItems = sessionProgressionItems


function useFigureFit() {
  const ref = useRef(null)
  const [tight, setTight] = useState(false)
  useLayoutEffect(() => {
    if (tight || !ref.current) return
    if ([...ref.current.querySelectorAll('.tile .v')].some(v => v.scrollWidth > v.clientWidth)) setTight(true)
  }, [tight])
  useEffect(() => {
    let width = window.innerWidth
    const onResize = () => { if (window.innerWidth !== width) { width = window.innerWidth; setTight(false) } }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return { ref, tight }
}

/**
 * Finish summary; shows duration, volume, Records, and trained muscles.
 *
 * @param {Object} w Finished workout.
 * @param {Array} prs Exercise ids that made a Record.
 * @param {Array} e1prs New estimated-1RM records.
 * @param {Object|null} routineSync Routine sync descriptor if originating from a routine with changes.
 * @param {Function} close Closes the sheet.
 */
export function FinishSummary({ w, prs, e1prs = [], routineSync = null, close }) {
  const st = useStore(s => s.S)
  const [syncChecked, setSyncChecked] = useState(false)
  const [selectedMuscle, setSelectedMuscle] = useState(null)
  const progressionItems = sessionProgressionItems(w, st)
  const load = loadOfWorkouts([w])
  const warmUps = setsDone(w) - workSetsDone(w)
  const fig = useFigureFit()

  const onDismiss = () => {
    if (syncChecked && routineSync?.routineId && routineSync?.syncedEx) {
      useStore.getState().syncRoutineFromSession(routineSync.routineId, routineSync.syncedEx)
      toast(t('Routine “{0}” updated', routineSync.routineName))
    }
    close()
    nav('/home')
  }

  return <div className="finish">
    <h3 className="finish-title">{t('Workout logged')}</h3>
    <div className="finish-kicker">{[w.name, fmtDate(w.d, true)].filter(Boolean).join(' · ')}</div>
    <div ref={fig.ref} className={'tiles finish-kpis' + (fig.tight ? ' tight' : '')}>
      <div className="tile"><div className="l">{t('Duration')}</div><div className="v">
        {fmtDurParts(w.end - w.start).map(([n, u], i) => <Fragment key={i}>{i > 0 && ' '}{n}<span className="u">{u}</span></Fragment>)}
      </div></div>
      <div className="tile"><div className="l">{t('Volume')}</div><div className="v">{fmtNum(tonnageOf(w))}<span className="u"> {st.unit}</span></div></div>
      <div className="tile"><div className="l">{t('Sets')}</div><div className="v">{fmtNum(workSetsDone(w))}</div>
        {warmUps > 0 && <div className="s">{t(warmUps === 1 ? '{0} warm-up' : '{0} warm-ups', fmtNum(warmUps))}</div>}</div>
      <div className="tile"><div className="l">{t('Records')}</div><div className="v">{fmtNum(prs.length)}</div></div>
    </div>
    {(prs.length > 0 || e1prs.length > 0) && <div className="finish-records">
      {prs.map(id => <div key={id} className="record capitalize row"><Icon name="trophy" />{t('New record:')} {(EXIDX[id] || {}).n || id}</div>)}
      {e1prs.map(p => <div key={p.id} className="record capitalize row"><Icon name="chartLine" />{t('Best estimated 1RM:')} {(EXIDX[p.id] || {}).n || p.id} · {fmtNum(p.est)} {st.unit}</div>)}
    </div>}
    {progressionItems.length > 0 && <>
      <h4 className="sec">{t('Progression')}</h4>
      <div
        className="progression-card progression-summary"
        role="list"
        aria-label={t('Progression summary')}
      >
        {progressionItems.map(item => (
          <div
            key={item.id}
            className="progression-item"
            role="listitem"
            aria-label={item.ariaLabel}
          >
            <div className="row between pi-head">
              <span className="capitalize pi-n">{item.exName}</span>
              <span className="tag nocap" aria-label={t('Progression policy: {0}', item.policyName)}>
                {item.policyName}
              </span>
            </div>
            <div className={'row pi-body' + (item.isAdvance ? ' up' : item.kind === 'deload' ? ' deload' : '')}>
              <Icon name={item.iconName} />
              <span>{item.text}</span>
            </div>
          </div>
        ))}
      </div>
    </>}
    <h4 className="sec">{t('What you just trained')}</h4>
    <div className="finish-map">
      <BodyMap
        className="tappable"
        load={load}
        body={st.body}
        selected={selectedMuscle}
        onMuscle={m => setSelectedMuscle(s => s === m ? null : m)}
        getA11yLabel={slug => {
          const val = load[slug]
          const name = t(MUSCLE_NAME[slug] || slug)
          if (!val) return `${name}, ${t('not trained')}`
          const setsText = Number.isInteger(val) ? `${val}.0 effective sets` : `${fmtNum(val)} effective sets`
          return `${name}, ${setsText}`
        }}
      />
      <div className="gap12" />
      <SessionMuscleDistribution
        workout={w}
        selectedMuscle={selectedMuscle}
        onSelectMuscle={m => setSelectedMuscle(s => s === m ? null : m)}
      />
    </div>
    {routineSync?.hasDiff && (
      <div className="card sync-card">
        <div className="row between">
          <span className="sync-title">
            {t('Update routine “{0}”', routineSync.routineName)}
          </span>
          <Switch
            checked={syncChecked}
            onChange={setSyncChecked}
            label={t('Update routine “{0}”', routineSync.routineName)}
          />
        </div>
        {routineSync.changes?.length > 0 && (
          <div className="row sync-tags">
            {routineSync.changes.map((ch, idx) => (
              <span key={idx} className="tag nocap">
                {ch}
              </span>
            ))}
          </div>
        )}
      </div>
    )}
    <div className="finish-cta"><Button variant="primary" onClick={onDismiss}>{t('Done')}</Button></div>
  </div>
}
export function finishWorkout() {
  const A = S().active
  if (!A) return
  const prog = sessionProgress(A)
  if (!_confirmSheet) throw new Error('session sheets not wired: missing confirmSheet')
  if (!prog.done) {
    const warmOnly = (A.entries || []).some(e => (e.sets || []).some(s => isPerformed(s) && isWarmupRow(s)))
    _confirmSheet(warmOnly
      ? { title: t('Only warm-ups logged so far'), message: t('Only warm-up sets are ticked — finish the workout anyway?'), confirmText: t('Finish anyway'), onConfirm: doFinishWorkout }
      : { title: t('Nothing logged yet'), message: t('You haven’t checked off any sets. Finish the workout anyway?'), confirmText: t('Finish anyway'), onConfirm: doFinishWorkout })
    return
  }
  if (prog.remaining > 0) {
    const sets = t(prog.remaining === 1 ? '{0} set still unchecked' : '{0} sets still unchecked', fmtNum(prog.remaining))
    _confirmSheet({ title: t('Finish early?'), message: t('{0} of {1} exercises done, {2}. Finish the workout now?', fmtNum(prog.exDone), fmtNum(prog.exTotal), sets), confirmText: t('Finish workout'), onConfirm: doFinishWorkout })
    return
  }
  doFinishWorkout()
}
function doFinishWorkout() {
  const result = useStore.getState().finishSession()
  if (!result) return
  const { workout: w, prs, e1prs, routineSync } = result
  useUI.getState().stopRest()
  playWorkoutComplete(snd())
  ui().openSheet(close => <FinishSummary w={w} prs={prs} e1prs={e1prs} routineSync={routineSync} close={close} />, { kind: 'full', locked: true })
}
