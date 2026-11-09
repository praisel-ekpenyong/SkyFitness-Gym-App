import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXIDX } from '../lib/exercises.js'
import { fmtNum, fmtVol, fmtDur, fmtDate } from '../lib/format.js'
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
import { bestKnownWeight, heaviestSetWeight, peekWeightCommit } from '../lib/active-workout.js'

/** Reads the shared store state. */
const S = () => useStore.getState().S
/** Applies a draft mutation to the shared store state. */
const update = (...a) => useStore.getState().update(...a)
/** Reads the UI store state. */
const ui = () => useUI.getState()
/** Shows a transient toast message. */
const toast = m => ui().toast(m)
/** Reads the sound toggle. */
const snd = () => S().sound

/* ============================ injected hub seams ============================ */
// The weigh-in sheet arrives as an injected seam wired by the hub, so no
// session-to-body-weight dependency exists. Confirm stays the hub's interface
// and the shared weight input currently lives in the hub (moving with the
// body-weight sheets in a later step) — both are injected for the same reason:
// the hub re-exports this module, so importing the hub back would be circular.
let _bwSheet = null
let _confirmSheet = null
let _WeightInput = null
/**
 * Wires the weigh-in, confirm, and weight-input seams for session sheets.
 *
 * @param {Function} bwSheet Weigh-in sheet opener.
 * @param {Function} confirmSheet Hub confirm dialog.
 * @param {Function} WeightInput Shared weight picker component.
 */
export function configureSessionSheets({ bwSheet, confirmSheet, WeightInput }) {
  if (bwSheet) _bwSheet = bwSheet
  if (confirmSheet) _confirmSheet = confirmSheet
  if (WeightInput) _WeightInput = WeightInput
}

/* ============================ workout lifecycle ============================ */
export function startFlow(routineId) {
  if (!_bwSheet) throw new Error('session sheets not wired: missing bwSheet')
  _bwSheet({ required: true, onDone: bw => beginWorkout(routineId, bw) })
}
/**
 * Starts the session for a routine and navigates to the workout view.
 *
 * @param {string} routineId Routine to start, if any.
 * @param {number} bw Weighed-in body weight, if any.
 */
export function beginWorkout(routineId, bw) {
  // Thin caller over the deep lifecycle seam — prescription, target freezing
  // and set construction live in lib/active-workout.js, not in the sheet.
  useStore.getState().beginSession(routineId, bw)
  useUI.getState().stopRest()
  nav('/workout')
}
/**
 * Top-weight confirmation; saving records the working weight for next time.
 *
 * @param {number} entryIdx Active entry index.
 * @param {Function} close Closes the sheet.
 */
function TopWeight({ entryIdx, close }) {
  const st = useStore(s => s.S)
  const A = st.active
  // The workout can end underneath this sheet: finishing from the last exercise clears
  // `active`, and this re-renders before the sheet is torn down. Everything below is
  // read defensively and the sheet dismisses itself — reading A.entries straight took
  // the whole app down with it. Hooks still run unconditionally, so the bail-out has
  // to sit after every one of them.
  const entry = A ? A.entries[entryIdx] : null
  const ex = entry && EXIDX[entry.id]
  const maxSet = entry ? heaviestSetWeight(entry) : 0
  const prevBest = entry ? bestKnownWeight(st, entry.id) : 0
  const [v, setV] = useState(entry ? (Math.max(maxSet, prevBest) || entry.target.weight || 0) : 0)
  useEffect(() => { if (!entry) close() }, [!entry])

  // Advance/finish navigation is decided behind the toggle seam: the same
  // geometry the toggle already computed, previewed here for button labels.
  // The work-sets-only rule (unticked warm-ups never block) lives there too.
  const peek = entry ? peekWeightCommit(st, entryIdx) : null
  const unitDone = peek ? peek.unitDone : false
  const isLastUnit = peek ? peek.isLastUnit : false
  const unitSize = peek ? peek.unitSize : 0
  if (!entry || !ex) return null
  const WeightInput = _WeightInput
  if (!WeightInput) return null

  const commit = advance => {
    const n = Math.round((v || 0) * 10) / 10
    if (!isFinite(n) || n < 0) { toast(t('Enter a valid weight')); return }
    // Recording and deciding share one domain call, so the Active workout
    // can never change between them (the finish-under-sheet teardown race).
    const next = useStore.getState().commitWorkingWeight(entryIdx, n)
    close()
    if (advance && next) {
      if (next.kind === 'topweight-then-finish') { workoutCompleteSheet(); return }
      if (next.kind === 'topweight-then-advance' && next.targetIdx != null) {
        useStore.getState().setActiveIndex(next.targetIdx)
        return
      }
    }
    toast(t('Tracked — next time starts at {0}', fmtNum((S().exWeights[entry.id] || {}).w ?? n) + ' ' + st.unit))
  }
  return <>
    <h3>{t('{0} done', ex.n)}</h3>
    <div className="sheet-sub">{t('Confirm the weight you worked with — your highest becomes the default next time.')}{!unitDone && unitSize > 1 ? ' ' + t('Then finish the superset partner.') : ''}</div>
    <WeightInput value={v} setValue={setV} unit={st.unit} />
    <div className="gap8" />
    {prevBest > 0 ? <div className="small dim cal-sum tw-best">{t('Previous best:')} {fmtNum(prevBest)} {st.unit}{maxSet > prevBest && <span className="tw-new"> — {t('new record!')}</span>}</div> : <div className="gap8" />}
    {unitDone ? <>
      <Button variant="primary" trailingIcon={isLastUnit ? null : 'chevronRight'} onClick={() => commit(true)}>{isLastUnit ? t('Save') : t('Save & next exercise')}</Button>
      <div className="gap8" /><Button variant="ghost" className="dim" onClick={() => commit(false)}>{t('Just close')}</Button>
    </> : <Button variant="primary" onClick={() => commit(false)}>{t('Save weight')}</Button>}
  </>
}
/** Opens the top-weight confirmation for the given entry. */
export const topWeightSheet = entryIdx => ui().openSheet(close => <TopWeight entryIdx={entryIdx} close={close} />)

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
      placeholder={t('Notes, cues, or machine setup...')}
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
/** Opens the exercise note sheet for the given active entry. */
export const exerciseNoteSheet = entryIdx => ui().openSheet(close => <ExerciseNoteSheet entryIdx={entryIdx} close={close} />)

// Shown when the last exercise's last set is checked — finish, or keep going.
function WorkoutComplete({ close }) {
  return <div className="confirm">
    <h3>{t("That's the whole workout!")}</h3>
    <div className="confirm-msg">{t('Every exercise done — great work. Finish up, or keep going and add another exercise.')}</div>
    <Button variant="primary" className="go" icon="flag" onClick={() => { close(); finishWorkout() }}>{t('Finish workout')}</Button>
    <div className="gap8" />
    <Button onClick={() => { close(); useUI.getState().toast(t('Keep going — tap “+ Add exercise” below')) }}>{t('Continue workout')}</Button>
  </div>
}
/** Opens the workout-complete prompt to finish or continue. */
export const workoutCompleteSheet = () => ui().openSheet(close => <WorkoutComplete close={close} />, { kind: 'center' })
/** Re-exports pure session progression selector. */
export const getProgressionItems = sessionProgressionItems


/**
 * Finish summary; shows duration, volume, PRs, and trained muscles.
 *
 * @param {Object} w Finished workout.
 * @param {Array} prs New weight PR exercise ids.
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

  const onDismiss = () => {
    if (syncChecked && routineSync?.routineId && routineSync?.syncedEx) {
      useStore.getState().syncRoutineFromSession(routineSync.routineId, routineSync.syncedEx)
      toast(t('Routine “{0}” updated', routineSync.routineName))
    }
    close()
    nav('/home')
  }

  return <div className="finish">
    <h3 className="finish-title">{t('Workout complete!')}</h3>
    <div className="finish-kicker">{[w.name, fmtDate(w.d, true)].filter(Boolean).join(' · ')}</div>
    <div className="tiles finish-kpis">
      <div className="tile"><div className="l">{t('Duration')}</div><div className="v">{fmtDur(w.end - w.start)}</div></div>
      <div className="tile"><div className="l">{t('Volume')}</div><div className="v">{fmtVol(tonnageOf(w), st.unit)}</div></div>
      <div className="tile"><div className="l">{t('Sets')}</div><div className="v finish-sets">{t('{0} sets · {1} work', setsDone(w), workSetsDone(w))}</div></div>
      <div className="tile"><div className="l">{t('PRs')}</div><div className="v">{prs.length || '—'}</div></div>
    </div>
    {(prs.length > 0 || e1prs.length > 0) && <div className="finish-records">
      {prs.map(id => <div key={id} className="accent capitalize row"><Icon name="trophy" />{t('New PR:')} {(EXIDX[id] || {}).n || id}</div>)}
      {e1prs.map(p => <div key={p.id} className="accent capitalize row"><Icon name="chartLine" />{t('Best estimated 1RM:')} {(EXIDX[p.id] || {}).n || p.id} · {fmtNum(p.est)} {st.unit}</div>)}
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
    <div className="finish-cta"><Button variant="primary" onClick={onDismiss}>{t('Nice!')}</Button></div>
  </div>
}
/** Finishes the workout, confirming first when work sets remain unchecked. */
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
  if (prog.remaining > 0) { _confirmSheet({ title: t('Finish early?'), message: t(prog.remaining === 1 ? '{0} set still unchecked. Finish the workout now?' : '{0} sets still unchecked. Finish the workout now?', prog.remaining), confirmText: t('Finish workout'), onConfirm: doFinishWorkout }); return }
  doFinishWorkout()
}
/** Completes the session and opens the locked finish summary. */
function doFinishWorkout() {
  const result = useStore.getState().finishSession()
  if (!result) return
  const { workout: w, prs, e1prs, routineSync } = result
  useUI.getState().stopRest()
  playWorkoutComplete(snd())
  ui().openSheet(close => <FinishSummary w={w} prs={prs} e1prs={e1prs} routineSync={routineSync} close={close} />, { kind: 'full', locked: true })
}
