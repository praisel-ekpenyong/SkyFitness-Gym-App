import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXIDX } from '../lib/exercises.js'
import { fmtNum, fmtVol, fmtDur } from '../lib/format.js'
import { setsDone, setsDoneActive, supersetUnits, unitOf, workSetsDone } from '../lib/history.js'
import { playWorkoutComplete } from '../lib/sound.js'
import { t } from '../lib/i18n.js'
import { nav } from '../lib/nav.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import BodyMap from '../components/BodyMap.jsx'
import { loadOfWorkouts } from '../lib/muscles.js'
import { bestKnownWeight, heaviestSetWeight } from '../lib/active-workout.js'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)
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
export function beginWorkout(routineId, bw) {
  // Thin caller over the deep lifecycle seam — prescription, target freezing
  // and set construction live in lib/active-workout.js, not in the sheet.
  useStore.getState().beginSession(routineId, bw)
  useUI.getState().stopRest()
  nav('/workout')
}
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

  const units = supersetUnits(A ? A.entries : [])
  const unit = entry ? unitOf(units, entryIdx) : []
  const unitDone = !!entry && unit.every(i => A.entries[i].sets.every(s => s.done))
  const unitIdx = units.findIndex(u => u === unit)
  const isLastUnit = unitIdx === units.length - 1
  if (!entry || !ex) return null
  const WeightInput = _WeightInput
  if (!WeightInput) return null

  const commit = advance => {
    const n = Math.round((v || 0) * 10) / 10
    if (!isFinite(n) || n < 0) { toast(t('Enter a valid weight')); return }
    useStore.getState().recordWorkingWeight(entryIdx, n)
    close()
    if (advance && unitDone) {
      if (isLastUnit) workoutCompleteSheet()               // whole workout done → finish/continue prompt
      else update(s => { s.active.cur = units[unitIdx + 1][0] })
    } else toast(t('Tracked — next time starts at {0}', fmtNum((S().exWeights[entry.id] || {}).w ?? n) + ' ' + st.unit))
  }
  return <>
    <h3 className="capitalize row" style={{ gap: 8 }}><Icon name="checkCircle" style={{ color: 'var(--acc)' }} />{t('{0} done', ex.n)}</h3>
    <div className="muted small">{t('Confirm the weight you worked with — your highest becomes the default next time.')}{!unitDone && unit.length > 1 ? ' ' + t('Then finish the superset partner.') : ''}</div>
    <WeightInput value={v} setValue={setV} unit={st.unit} />
    <div style={{ height: 10 }} />
    {prevBest > 0 ? <div className="small dim" style={{ textAlign: 'center', marginBottom: 12 }}>{t('Previous best:')} {fmtNum(prevBest)} {st.unit}{maxSet > prevBest && <span style={{ color: 'var(--yellow)' }}> — {t('new record!')}</span>}</div> : <div style={{ height: 4 }} />}
    {unitDone ? <>
      <Button variant="primary" trailingIcon={isLastUnit ? null : 'chevronRight'} onClick={() => commit(true)}>{isLastUnit ? t('Save') : t('Save & next exercise')}</Button>
      <div style={{ height: 8 }} /><Button variant="ghost" className="dim" onClick={() => commit(false)}>{t('Just close')}</Button>
    </> : <Button variant="primary" onClick={() => commit(false)}>{t('Save weight')}</Button>}
  </>
}
export const topWeightSheet = entryIdx => ui().openSheet(close => <TopWeight entryIdx={entryIdx} close={close} />)

// Shown when the last exercise's last set is checked — finish, or keep going.
function WorkoutComplete({ close }) {
  return <div style={{ textAlign: 'center', padding: '8px 0' }}>
    <div style={{ fontSize: 44, display: 'flex', justifyContent: 'center', color: 'var(--acc)' }}><Icon name="checkCircle" /></div>
    <h3 style={{ margin: '8px 0' }}>{t("That's the whole workout!")}</h3>
    <div className="muted small" style={{ marginBottom: 16 }}>{t('Every exercise done — great work. Finish up, or keep going and add another exercise.')}</div>
    <Button variant="primary" icon="flag" onClick={() => { close(); finishWorkout() }}>{t('Finish workout')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={() => { close(); useUI.getState().toast(t('Keep going — tap “+ Add exercise” below')) }}>{t('Continue workout')}</Button>
  </div>
}
export const workoutCompleteSheet = () => ui().openSheet(close => <WorkoutComplete close={close} />, { kind: 'center' })

function FinishSummary({ w, prs, e1prs = [], close }) {
  const st = useStore(s => s.S)
  return <div style={{ textAlign: 'center', padding: '8px 0' }}>
    <div style={{ fontSize: 44, display: 'flex', justifyContent: 'center', color: 'var(--acc)' }}><Icon name="trophy" /></div>
    <h3 style={{ margin: '8px 0' }}>{t('Workout complete!')}</h3>
    <div className="tiles" style={{ textAlign: 'left' }}>
      <div className="tile"><div className="l">{t('Duration')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{fmtDur(w.end - w.start)}</div></div>
      <div className="tile"><div className="l">{t('Volume')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{fmtVol(w.vol, st.unit)}</div></div>
      <div className="tile"><div className="l">{t('Sets')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{t('{0} sets · {1} work', setsDone(w), workSetsDone(w))}</div></div>
      <div className="tile"><div className="l">{t('PRs')}</div><div className="v" style={{ fontSize: 20 }}>{prs.length || '—'}</div></div>
    </div>
    {(prs.length > 0 || e1prs.length > 0) && <div style={{ textAlign: 'left', marginBottom: 12 }}>
      {prs.map(id => <div key={id} className="small accent capitalize row" style={{ gap: 5 }}><Icon name="trophy" style={{ fontSize: 13 }} />{t('New PR:')} {(EXIDX[id] || {}).n || id}</div>)}
      {e1prs.map(p => <div key={p.id} className="small accent capitalize row" style={{ gap: 5 }}><Icon name="chartLine" style={{ fontSize: 13 }} />{t('Best estimated 1RM:')} {(EXIDX[p.id] || {}).n || p.id} · {fmtNum(p.est)} {st.unit}</div>)}
    </div>}
    <h4 className="sec" style={{ textAlign: 'left' }}>{t('What you just trained')}</h4>
    <BodyMap load={loadOfWorkouts([w])} body={st.body} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={() => { close(); nav('/home') }}>{t('Nice!')}</Button>
  </div>
}
export function finishWorkout() {
  const A = S().active
  if (!A) return
  const done = setsDoneActive(A)
  const total = A.entries.reduce((n, e) => n + e.sets.length, 0)
  if (!_confirmSheet) throw new Error('session sheets not wired: missing confirmSheet')
  if (!done) { _confirmSheet({ title: t('Nothing logged yet'), message: t('You haven’t checked off any sets. Finish the workout anyway?'), confirmText: t('Finish anyway'), onConfirm: doFinishWorkout }); return }
  if (done < total) { _confirmSheet({ title: t('Finish early?'), message: t(total - done === 1 ? '{0} set still unchecked. Finish the workout now?' : '{0} sets still unchecked. Finish the workout now?', total - done), confirmText: t('Finish workout'), onConfirm: doFinishWorkout }); return }
  doFinishWorkout()
}
function doFinishWorkout() {
  const result = useStore.getState().finishSession()
  if (!result) return
  const { workout: w, prs, e1prs } = result
  useUI.getState().stopRest()
  playWorkoutComplete(snd())
  ui().openSheet(close => <FinishSummary w={w} prs={prs} e1prs={e1prs} close={close} />, { kind: 'center', locked: true })
}
