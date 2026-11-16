
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { effectiveRoutine, hasEffectiveOverride } from '../lib/history.js'
import { freestyleConfig, defaultConfig, modeOf, isBw, isPerSide, sideReps, repStep } from '../lib/workout-model.js'
import { setLabel } from '../lib/format.js'
import { EFFORT, effortOf, stepEffort, capEffort } from '../lib/effort.js'
import { sessionView } from '../lib/active-workout.js'
import { best as bestOf, lastSession } from '../lib/training-log.js'
import { fmtNum, fmtDate, fmtSec, fmtElapsed, todayISO, exCount, DAYN, sentenceCase } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Media, { Thumb } from '../components/Media.jsx'
import { startFlow, exercisePicker, exConfigSheet, exerciseDetailSheet, finishWorkout, workoutCompleteSheet, confirmSheet, exerciseNoteSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import Barbell, { loadsOnBar } from '../components/Barbell.jsx'
import { Button, Check, NumberField, dotted } from '../components/ui.jsx'
import { glyphOf } from '../lib/glyphs.js'
import { isWarmupRow, seedForReplacement } from '../lib/workout-model.js'
import { evaluateSetMilestone } from '../lib/progression.js'
import { primaryMuscleName } from '../lib/muscles.js'

function StartChooser() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const todayR = effectiveRoutine(S, todayISO())
  const todayOvr = hasEffectiveOverride(S, todayISO())
  const others = S.routines.filter(r => r !== todayR)
  return <div className="narrow">
    <div className="hdr"><div><h1>{t('Start workout')}</h1><div className="sub">{t(DAYN[new Date().getDay()])} · {todayR ? t('today is {0}', todayR.name) : (S.routines.length ? t('rest day on your plan') : t('no plan yet'))}</div></div></div>
    {todayR && <section className="card start-today">
      <h2>{t("Today's plan")}{todayOvr ? ' · ' + t('rescheduled') : ''}</h2>
      <div className="start-today-name d">{todayR.name}</div>
      <div className="muted small start-today-meta">{exCount(todayR.ex.length)}</div>
      <Button variant="primary" className="go" icon="play" onClick={() => startFlow(todayR.id)}>{t('Start {0}', todayR.name)}</Button>
    </section>}
    {others.length > 0 && <><h2 className="sec">{t('Other routines')}</h2>
      <div className="list">{others.map(r => <div key={r.id} className="item pad" role="button" tabIndex={0} onClick={() => startFlow(r.id)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startFlow(r.id) } }}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        <span className="tag">{t('Start')}</span></div>)}</div></>}
    <div className="gap12" />
    <Button icon="shuffle" onClick={() => startFlow(null)}>{t('Freestyle workout (pick as you go)')}</Button>
    {!S.routines.length && <><div className="gap8" /><Button variant="primary" onClick={() => nav('/plan')}>{t('Build a plan first')}</Button></>}
  </div>
}

function Elapsed({ start }) {
  const [t, setT] = useState('0:00')
  useEffect(() => {
    const tick = () => setT(fmtElapsed((Date.now() - start) / 1000))
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv)
  }, [start])
  return <span>{t}</span>
}

function ExerciseBlock({ entryIdx, compact, isCurrent = true, arrived = false, restKey = null, onToggle, onField, onAddSet, onRemoveSet, onAddWarmup, onRemoveSetAt, onStartTimed, onReplace }) {
  const S = useStore(s => s.S)
  const working = useUI(s => s.work)
  const holding = useUI(s => !!s.work)
  const entry = S.active.entries[entryIdx]
  const ex = exOr(entry.id)
  const mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const cardio = mode === 'cardio'
  const timed = mode === 'time'
  const last = lastSession(S, entry.id)
  const best = cardio ? 0 : bestOf(S, entry.id)
  const plan = entry.plan
  const cfg = { ...(entry.target || {}), id: entry.id }
  const bw = !cardio && isBw(cfg)
  const added = bw && entry.sets.some(s => s.w > 0)
  const loadCol = { f: 'w', step: 2.5, dec: true, hd: bw ? t('Added ({0})', S.unit) : t('Weight ({0})', S.unit), unit: S.unit }
  const repCol = { f: 'r', step: repStep(cfg), dec: false, hd: t('Reps'), unit: t('reps') }
  const col1 = cardio ? { f: 'min', step: 1, dec: false, hd: t('Duration (min)'), unit: t('min') }
    : timed ? { f: 'sec', step: 5, dec: false, hd: t('Seconds'), unit: t('sec') }
      : (bw && !added) ? repCol : loadCol
  const col2 = cardio ? { f: 'speed', step: 0.5, dec: true, hd: t('Speed (km/h)'), unit: t('km/h') }
    : timed ? ((bw && !added) ? null : loadCol)
      : (bw && !added) ? null : repCol
  const kind = effortOf(S)
  const eff = EFFORT[kind]
  const col3 = mode === 'reps' && eff ? { ...eff, eff: kind, dec: true, opt: true, hd: t(eff.hd), unit: t(eff.hd) } : null

  const firstOpen = entry.sets.findIndex(s => !s.done)
  const place = entry.id + ':' + firstOpen
  const [picked, setPicked] = useState(null)
  const [pickedAt, setPickedAt] = useState(place)
  if (place !== pickedAt) { setPickedAt(place); setPicked(null) }
  const openRow = picked ?? (isCurrent ? firstOpen : -1)
  const openRef = useRef(null)
  const anchor = entry.id + ':' + openRow
  const anchorAt = useRef(arrived && !compact ? null : anchor)
  useEffect(() => {
    if (anchorAt.current === anchor || typeof requestAnimationFrame !== 'function') return
    const newExercise = !anchorAt.current?.startsWith(entry.id + ':')
    anchorAt.current = anchor
    const raf = requestAnimationFrame(() => {
      if (newExercise && !compact) window.scrollTo(0, 0)
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      openRef.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' })
    })
    return () => cancelAnimationFrame(raf)
  }, [anchor, entry.id, compact])
  const workTotal = entry.sets.filter(s => !isWarmupRow(s)).length

  const bump = (s, i, col, dir) => {
    if (col.eff) return onField(i, col.f, stepEffort(col.eff, s[col.f], dir))
    onField(i, col.f, Math.max(0, Math.round(((s[col.f] || 0) + dir * col.step) * 100) / 100))
  }
  const cell = (s, i, col, cls, phaseNum, warm) => {
    const phasePrefix = warm ? t('Warm-up set {0}', phaseNum) : t('Set {0}', phaseNum)
    const fieldLabel = t('{0} {1}', phasePrefix, col.hd)
    return (
      <div className={'stp ' + cls}>
        <button className="stp-dec" aria-label={t('Decrease {0}', fieldLabel)} onClick={() => bump(s, i, col, -1)}><Icon name="minus" /></button>
        <span className="val"><NumberField decimal={col.dec} nullable={col.opt} value={s[col.f] ?? ''}
          aria-label={fieldLabel} placeholder={col.opt ? '—' : undefined}
          onChange={v => onField(i, col.f, col.eff ? capEffort(col.eff, v) : v)} /><i>{col.unit}</i></span>
        <button className="stp-inc" aria-label={t('Increase {0}', fieldLabel)} onClick={() => bump(s, i, col, 1)}><Icon name="plus" /></button>
      </div>
    )
  }
  const muscleName = cardio ? '' : primaryMuscleName(ex)
  return <section className={'exblock' + (compact ? ' compact' : '')}>
    <div className="exhead">
      <div className="exhead-t">
        <h2 className={'d' + (ex.n.length > 26 ? ' long' : '')}>{ex.n}</h2>
        <div className="extags small muted">{dotted([
          cardio && <span className="tag">{t('Cardio')}</span>,
          !cardio && !timed && isPerSide(cfg) && <span className="tag nocap">{t('{0} per side', fmtNum(sideReps(entry.sets.find(s => !s.done)?.r ?? entry.sets[0]?.r)))}</span>,
          muscleName && <span className="tag nocap">{sentenceCase(t(muscleName))}</span>,
          ex.eq && <span className="tag nocap">{sentenceCase(t(ex.eq))}</span>,
          best > 0 && <span className="tag nocap ex-best">{t('Best')} {fmtNum(best)} {S.unit}</span>,
        ])}</div>
      </div>
      <Media ex={ex} key={entry.id} compact={compact} minimizable />
      <div className="extools">
        {!entry.notes && (
          <Button size="xs" icon="clipboard" aria-label={t('Add note')} onClick={() => exerciseNoteSheet(entryIdx)}>{t('Note')}</Button>
        )}
        <Button size="xs" icon="shuffle" aria-label={t('Replace exercise')} disabled={holding} onClick={() => onReplace(entryIdx)}>{t('Replace')}</Button>
        <Button size="xs" icon="info" aria-label={t('Details')} onClick={() => exerciseDetailSheet(ex)}>{t('Details')}</Button>
        {restKey}
      </div>
    </div>
    {last && <div className="small dim ex-last">{t('Last time')} {fmtDate(last.d)} · {last.sets.map(s => setLabel(entry.id, s, last.target)).join(', ')}</div>}
    {plan && plan.why && plan.kind !== 'off' && <div className={'progline' + (plan.kind === 'deload' ? ' warn' : plan.kind === 'up' ? ' up' : '')}>
      <Icon name={plan.kind === 'up' ? 'arrowUp' : plan.kind === 'deload' ? 'arrowDown' : 'lightbulb'} />
      <span>{t(...plan.why)}</span>
    </div>}
    {entry.notes && (
      <div className="exnote" role="button" tabIndex={0} aria-label={t('Edit note')} onClick={() => exerciseNoteSheet(entryIdx)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') exerciseNoteSheet(entryIdx) }}>
        <Icon name="clipboard" size={16} />
        <div className="grow">{entry.notes}</div>
        <Icon name="pencil" size={13} />
      </div>
    )}
    <div className="ladder">
      {entry.sets.map((s, i) => {
        const warm = isWarmupRow(s)
        const warmBefore = i > 0 && isWarmupRow(entry.sets[i - 1])
        const isFirstWarmup = warm && !warmBefore
        const phaseNum = entry.sets.slice(0, i + 1).filter(x => isWarmupRow(x) === warm).length
        const milestone = evaluateSetMilestone(entry, i, { state: S })
        const open = i === openRow
        const rowName = warm ? t('Warm-up set {0}', phaseNum) : t('Set {0} of {1}', phaseNum, workTotal)
        return <div key={i}>
          {isFirstWarmup && <div className="setph">{t('Warm-up')}</div>}
          {!warm && warmBefore && <div className="setph">{t('Working sets')}</div>}
          <div ref={open ? openRef : undefined} className={'setrow' + (s.done ? ' done' : '') + (open ? ' cur' : '') + (warm ? ' warm' : '') + (col2 ? '' : ' solo') + (col3 ? ' eff3' : '') + (timed ? ' timed' : '')}
            onClick={e => { if (!open && !e.target.closest('input,button')) setPicked(i) }}>
            <button className="n" aria-label={rowName} aria-expanded={open} onClick={() => setPicked(open ? -1 : i)}>
              <b>{phaseNum}</b><span className="n-l">{rowName}</span>
            </button>
            {cell(s, i, col1, 'w', phaseNum, warm)}
            {col2 && cell(s, i, col2, 'r', phaseNum, warm)}
            {col3 && cell(s, i, col3, 'eff', phaseNum, warm)}
            {open && !cardio && loadsOnBar(ex.eq) && s.w > 0 && <Barbell weight={s.w} unit={S.unit} />}
            {timed && <button className="setgo" aria-label={t('Start set')} disabled={s.done || !!working}
              onClick={() => onStartTimed(i)}><Icon name="play" /><span className="setgo-l">{t('Start set')}</span></button>}
            {warm && <button className="iconbtn bare set-x" aria-label={t('Remove set')}
              disabled={entry.sets.length <= 1 || !!working} onClick={() => onRemoveSetAt(i)}><Icon name="xmark" /></button>}
            <Check checked={s.done} aria-label={t('Complete {0}', warm ? t('warm-up set {0}', phaseNum) : t('set {0}', phaseNum))} onChange={() => onToggle(i)}>
              {open && <span className="chk-l">{s.done ? t('Logged') : t('Log set')}</span>}
            </Check>
            {milestone && (
              <span className="milestone-badge" role="status" aria-label={t('Milestone: {0}', milestone.label)}>
                {milestone.label}
              </span>
            )}
          </div>
        </div>
      })}
      <div className="ladder-tools">
        <Button size="sm" variant="ghost" icon="flame" onClick={onAddWarmup}>{t('Add warm-up set')}</Button>
        <Button size="sm" variant="ghost" icon="minus" disabled={entry.sets.length <= 1} onClick={onRemoveSet}>{t('Remove set')}</Button>
        <Button size="sm" variant="ghost" icon="plus" onClick={onAddSet}>{t('Add set')}</Button>
      </div>
    </div>
  </section>
}

/* ---------- active workout ---------- */
// Opens the finish sheet on open-finish, including when a hold this sent completes the last set.
const send = command => {
  const res = useStore.getState().act(command, send)
  if (res.effects.some(e => e.type === 'open-finish')) workoutCompleteSheet()
  return res
}

function removeActiveExercise(idx) {
  send({ type: 'removeExercise', entry: idx })
}

/**
 * Interactive flow to replace an exercise at `idx` in the active workout.
 *
 * Prompts for confirmation when sets have already been performed to avoid
 * accidental data loss, stops any running work timer, then opens the exercise
 * picker and configuration sheet before committing the replacement in store.
 *
 * @param {number} idx - Index of the exercise entry in active workout entries.
 */
export function replaceActiveExerciseFlow(idx) {
  const S = useStore.getState().S
  const A = S?.active
  if (!A) return
  const entry = A.entries?.[idx]
  if (!entry) return

  const proceedToPicker = () => {
    if (useUI.getState().work) useUI.getState().stopWork()
    exercisePicker(newEx => {
      if (!newEx) return
      const curS = useStore.getState().S
      const curA = curS?.active
      const routine = curS?.routines?.find(r => r.id === curA?.routineId)
      const plannedCount = (entry.sets || []).filter(s => !isWarmupRow(s)).length || (entry.sets || []).length
      const seed = seedForReplacement(curS, newEx.id, curA?.routineId, plannedCount)
      delete seed.notes
      exConfigSheet(newEx, null, cfg => {
        send({ type: 'replaceExercise', entry: idx, exId: newEx.id, target: cfg })
      }, null, routine, seed, null, t('Replace'))
    })
  }

  if (sessionView(A).hasPerformed[idx]) {
    confirmSheet({
      title: t('Replace {0}?', exOr(entry.id).n),
      message: t('The sets you logged for this exercise in this session will be lost.'),
      confirmText: t('Replace'),
      danger: true,
      onConfirm: proceedToPicker,
    })
  } else {
    proceedToPicker()
  }
}

/** Bottom sheet listing active workout entries for sequential reordering and fast navigation. */
function ReorderExercisesSheet({ close }) {
  const entries = useStore(s => s.S.active?.entries || [])
  const view = sessionView({ entries })
  const supersets = view.steps.filter(s => s.entries.length > 1).map(s => s.entries)
  const supersetFirst = new Set(supersets.map(s => s[0]))
  const inSuperset = new Set(supersets.flat())

  const move = (idx, dir) => {
    send({ type: 'moveExercise', entry: idx, dir })
  }
  const select = idx => {
    send({ type: 'goTo', entry: idx })
    close()
  }

  return <div>
    <div className="row between">
      <h3 className="flush">{t('Reorder exercises')}</h3>
      <button className="iconbtn" onClick={close} aria-label={t('Close')}><Icon name="xmark" /></button>
    </div>
    <div className="sheet-sub">{t('Move exercises up or down, or tap to jump.')}</div>
    <div className="list">
      {entries.map((entry, idx) => {
        const ex = exOr(entry.id)
        const { done, total } = view.entryProgress[idx]
        return <div key={idx}>
          {supersetFirst.has(idx) && <div className="ss-label"><Icon name="link" />{t('Superset')}</div>}
          <div className={'item' + (inSuperset.has(idx) ? ' in-ss' : '')} role="button" tabIndex={0} aria-label={ex.n}
            onClick={() => select(idx)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(idx) } }}>
            <Thumb ex={ex} />
            <div className="grow">
              <div className="tt capitalize">{ex.n}</div>
              <div className="ss">{total ? t('{0} sets', done + '/' + total) : ''}</div>
            </div>
            <div className="item-move" onClick={e => e.stopPropagation()}>
              <button className="iconbtn" aria-label={t('Move {0} up', ex.n)} disabled={idx === 0} onClick={() => move(idx, -1)}>
                <Icon name="chevronUp" />
              </button>
              <button className="iconbtn" aria-label={t('Move {0} down', ex.n)} disabled={idx === entries.length - 1} onClick={() => move(idx, 1)}>
                <Icon name="chevronDown" />
              </button>
            </div>
          </div>
        </div>
      })}
    </div>
  </div>
}

function EditWorkoutSheet({ close, name, count, onReorder, onReplace, onPairPrev, onPairNext, onRemove }) {
  const holding = useUI(s => !!s.work)
  const run = fn => () => { close(); fn() }
  return <div>
    <div className="row between">
      <h3 className="flush">{t('Edit workout')}</h3>
      <button className="iconbtn" onClick={close} aria-label={t('Close')}><Icon name="xmark" /></button>
    </div>
    <div className="sheet-sub capitalize">{name}</div>
    <div className="sect-b">
      <button className="lrow tap" disabled={holding || count < 2} onClick={run(onReorder)}>
        <span className="lrow-i"><Icon name="list" /></span><span className="lrow-m"><span className="lrow-t">{t('Reorder exercises')}</span></span>
      </button>
      <button className="lrow tap" disabled={holding} onClick={run(onReplace)}>
        <span className="lrow-i"><Icon name="shuffle" /></span><span className="lrow-m"><span className="lrow-t">{t('Replace exercise')}</span></span>
      </button>
      {onPairPrev && <button className="lrow tap" onClick={run(onPairPrev)}>
        <span className="lrow-i"><Icon name="link" /></span><span className="lrow-m"><span className="lrow-t">{t('Make superset with previous')}</span></span>
      </button>}
      {onPairNext && <button className="lrow tap" onClick={run(onPairNext)}>
        <span className="lrow-i"><Icon name="link" /></span><span className="lrow-m"><span className="lrow-t">{t('Make superset with next')}</span></span>
      </button>}
      <button className="lrow tap danger" disabled={holding} onClick={run(onRemove)}>
        <span className="lrow-i"><Icon name="trash" /></span><span className="lrow-m"><span className="lrow-t">{t('Remove exercise')}</span></span>
      </button>
    </div>
  </div>
}

function NextLabel({ name }) {
  const [before, after = ''] = t('Next: {0}').split('{0}')
  return <span>{before}<span className="capitalize">{name}</span>{after}</span>
}

function ActiveWorkout() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const startRest = useUI(s => s.startRest)
  const resting = useUI(s => !!s.timer)
  const holding = useUI(s => !!s.work)
  const A = S.active
  const view = sessionView(A)
  const { cur, steps, stepIdx, progress: prog } = view
  const step = view.step?.entries ?? []
  const isSuperset = step.length > 1
  const stepKey = step.map(i => i + ':' + A.entries[i].id).join('+')
  const [shown, setShown] = useState({ key: stepKey, moved: false })
  if (shown.key !== stepKey) setShown({ key: stepKey, moved: true })
  const exRefs = useRef({})
  useEffect(() => {
    if (!isSuperset) return
    const el = exRefs.current[cur]
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [cur, isSuperset, A.entries.length])

  const nextIdx = view.nextStep?.entries[0] ?? null

  const setField = (idx, i, field, value) => send({ type: 'editSet', entry: idx, set: i, field, value })
  const addSet = idx => send({ type: 'addSet', entry: idx })
  const removeSet = idx => send({ type: 'removeSet', entry: idx })
  const addWarmup = idx => send({ type: 'addWarmup', entry: idx })
  const removeSetAt = (idx, i) => send({ type: 'removeSet', entry: idx, set: i })
  const pairAt = (first, second) => send({ type: 'pair', first, second })
  const unpairAt = idx => send({ type: 'unpair', entry: idx })
  const goTo = idx => send({ type: 'goTo', entry: idx })
  const onPairPrev = !isSuperset && cur > 0 ? () => pairAt(cur - 1, cur) : null
  const onPairNext = !isSuperset && cur < A.entries.length - 1 ? () => pairAt(cur, cur + 1) : null

  const removeExercise = removeActiveExercise
  const confirmRemoveExercise = idx => {
    const e = A.entries[idx]
    if (!e) return
    confirmSheet({
      title: t('Remove {0}?', exOr(e.id).n),
      message: view.hasPerformed[idx]
        ? t('The sets you logged for this exercise in this session will be lost.')
        : t('This removes the exercise from your current session.'),
      confirmText: t('Remove'), danger: true, onConfirm: () => removeExercise(idx)
    })
  }
  const removeExerciseSheet = () => {
    if (step.length > 1) {
      useUI.getState().openSheet(close => (
        <div>
          <h3>{t('Remove exercise')}</h3>
          <div className="sheet-sub">{t('Which exercise in this superset do you want to remove?')}</div>
          <div className="list">
            {step.map(idx => <div key={idx} className="item" onClick={() => { close(); confirmRemoveExercise(idx) }}>
              <div className="grow"><div className="tt">{exOr(A.entries[idx]?.id).n}</div></div>
              <Icon name="chevronRight" />
            </div>)}
          </div>
        </div>
      ))
    } else confirmRemoveExercise(cur)
  }

  const replaceExerciseSheet = () => {
    if (step.length > 1) {
      useUI.getState().openSheet(close => (
        <div>
          <h3>{t('Replace exercise')}</h3>
          <div className="sheet-sub">{t('Which exercise in this superset do you want to replace?')}</div>
          <div className="list">
            {step.map(idx => <div key={idx} className="item" onClick={() => { close(); replaceActiveExerciseFlow(idx) }}>
              <div className="grow"><div className="tt">{exOr(A.entries[idx]?.id).n}</div></div>
              <Icon name="chevronRight" />
            </div>)}
          </div>
        </div>
      ))
    } else replaceActiveExerciseFlow(cur)
  }

  const reorderExerciseSheet = () => {
    useUI.getState().openSheet(close => <ReorderExercisesSheet close={close} />)
  }

  const editWorkoutSheet = () => {
    const name = step.map(i => exOr(A.entries[i].id).n).join(' + ')
    useUI.getState().openSheet(close => <EditWorkoutSheet close={close} name={name} count={A.entries.length}
      onReorder={reorderExerciseSheet} onReplace={replaceExerciseSheet} onPairPrev={onPairPrev} onPairNext={onPairNext}
      onRemove={removeExerciseSheet} />)
  }

  const startTimed = (idx, i) => send({ type: 'startHold', entry: idx, set: i })

  const toggle = (idx, i) => send({ type: 'toggle', entry: idx, set: i })

  const restKey = <Button size="xs" icon="timer" className="ex-rest" aria-label={t('Rest {0}', fmtSec(S.restSec))} disabled={resting || holding} onClick={() => startRest(S.restSec)}>
    {fmtSec(S.restSec)}
  </Button>

  const discard = () => confirmSheet({ title: t('Discard workout?'), message: t('The sets you logged in this session will be lost.'), confirmText: t('Discard'), danger: true, onConfirm: () => { send({ type: 'discard' }); nav('/home') } })

  return <div className="workout">
    <header className="hdr wk-hdr">
      <button className="iconbtn bare wk-min" aria-label={t('Minimize workout')} onClick={() => nav('/home')}><Icon name="chevronDown" /></button>
      <div className="wk-title"><h1>{A.name}</h1><div className="sub"><Elapsed start={A.start} /> · {t('{0} sets', prog.done + '/' + prog.total)}</div></div>
      <button className={'btn sm wk-finish ' + (prog.allDone ? 'done' : 'plain')} aria-label={t('Finish')} onClick={finishWorkout}>{t('Finish')}</button>
      {steps.length > 0 && <div className="lad" role="group" aria-label={t('Exercises in this workout')}>
        {steps.map(({ entries: u, done, total }, k) => {
          return <button key={u[0]} className={'lad-s' + (k === stepIdx ? ' on' : '')} aria-current={k === stepIdx ? 'step' : undefined}
            aria-label={t('Go to {0}', u.map(i => exOr(A.entries[i].id).n).join(' + '))}
            onClick={() => goTo(u[0])}>
            <span className="lad-b"><i style={{ transform: `scaleX(${total ? done / total : 0})` }} /></span>
          </button>
        })}
      </div>}
    </header>

    {A.entries.length ? <>
      {isSuperset ? (
        <div className="ss-card">
          <div className="ss-hd">
            <span className="row"><Icon name="link" />{t('Superset · do these back-to-back, rest when done')}</span>
            <Button size="xs" variant="ghost" icon="link" title={t('Unpair')} onClick={() => unpairAt(cur)}>{t('Unpair')}</Button>
          </div>
          {step.map((idx, k) => <div key={idx} ref={el => { exRefs.current[idx] = el }} className="ss-ex" data-exidx={idx}>
            {k > 0 && <div className="ss-amp"><Icon name="plus" /></div>}
            <ExerciseBlock entryIdx={idx} compact isCurrent={idx === cur} restKey={k === 0 ? restKey : null}
              onToggle={i => toggle(idx, i)} onField={(i, f, v) => setField(idx, i, f, v)} onAddSet={() => addSet(idx)} onRemoveSet={() => removeSet(idx)} onAddWarmup={() => addWarmup(idx)} onRemoveSetAt={i => removeSetAt(idx, i)} onStartTimed={i => startTimed(idx, i)}
              onReplace={replaceActiveExerciseFlow} />
          </div>)}
        </div>
      ) : (
        <ExerciseBlock entryIdx={cur} arrived={shown.moved} restKey={restKey} onToggle={i => toggle(cur, i)} onField={(i, f, v) => setField(cur, i, f, v)} onAddSet={() => addSet(cur)} onRemoveSet={() => removeSet(cur)} onAddWarmup={() => addWarmup(cur)} onRemoveSetAt={i => removeSetAt(cur, i)} onStartTimed={i => startTimed(cur, i)}
          onReplace={replaceActiveExerciseFlow} />
      )}
      {nextIdx != null && <button className="btn primary wk-next" onClick={() => goTo(nextIdx)}>
        <NextLabel name={exOr(A.entries[nextIdx].id).n} /><Icon name="chevronRight" />
      </button>}
    </> : <div className="empty"><div className="ico"><Icon name="shuffle" /></div>{t('Freestyle workout — add your first exercise.')}</div>}

    <div className="wk-nav">
      <Button icon="chevronLeft" disabled={!view.canPrev} onClick={() => send({ type: 'prev' })}>{t('Prev')}</Button>
      <Button trailingIcon="chevronRight" disabled={!view.canNext} onClick={() => send({ type: 'next' })}>{t('Next')}</Button>
    </div>
    <div className="wk-nav">
      <Button onClick={() => exercisePicker(ex => {
        const routine = S.routines.find(r => r.id === A.routineId)
        const freestyle = !A.routineId
        const seed = freestyle ? freestyleConfig(S, { id: ex.id, ...defaultConfig(ex.id) }) : null
        exConfigSheet(ex, null, cfg => {
          send({ type: 'addExercise', exId: ex.id, target: cfg })
        }, null, routine, seed)
      })} icon="plus">{t('Add exercise')}</Button>
      {A.entries.length > 0 && <Button icon="pencil" onClick={editWorkoutSheet}>{t('Edit workout')}</Button>}
    </div>
    <button className="btn ghost wk-discard" aria-label={t('Discard')} onClick={discard}>{t('Discard workout')}</button>
  </div>
}

export default function Workout() {
  const active = useStore(s => s.S.active)
  return active ? <ActiveWorkout /> : <StartChooser />
}
