// Active workout view: orchestrates live workout execution and logging.
// Owns the active workout screen, set row rendering, rest and hold timer
// coordination, and interactive bottom sheets for exercise reordering,
// replacement, and removal. Delegates domain calculations and set row
// transformations to lib/workout-model.js and active state to store/useStore.js.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { effectiveRoutine, hasEffectiveOverride } from '../lib/history.js'
import { lastEntryFor, freestyleConfig, defaultConfig, sessionProgress, modeOf, isBw, isPerSide, sideReps, repStep, workSets, doneWorkSets } from '../lib/workout-model.js'
import { supersetUnits, unitOf } from '../lib/supersetFlow.js'
import { setLabel } from '../lib/format.js'
import { EFFORT, effortOf, stepEffort, capEffort } from '../lib/effort.js'
import { bestKnownWeight } from '../lib/active-workout.js'
import { fmtNum, fmtDate, fmtSec, fmtElapsed, todayISO, exCount, DAYN } from '../lib/format.js'
import { playSetComplete } from '../lib/sound.js'
import { t } from '../lib/i18n.js'
import Media, { Thumb } from '../components/Media.jsx'
import { startFlow, exercisePicker, exConfigSheet, exerciseDetailSheet, topWeightSheet, finishWorkout, workoutCompleteSheet, confirmSheet, exerciseNoteSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import Barbell, { loadsOnBar } from '../components/Barbell.jsx'
import { Button, Check, NumberField } from '../components/ui.jsx'
import { glyphOf } from '../lib/glyphs.js'
import { isWarmupRow, isPerformed, seedForReplacement } from '../lib/workout-model.js'
import { evaluateSetMilestone } from '../lib/progression.js'

/* ---------- start chooser (no active workout) ---------- */
function StartChooser() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const todayR = effectiveRoutine(S, todayISO())
  const todayOvr = hasEffectiveOverride(S, todayISO())
  const others = S.routines.filter(r => r !== todayR)
  return <div className="narrow">
    <div className="hdr"><div><h1>{t('Start workout')}</h1><div className="sub">{t(DAYN[new Date().getDay()])} — {todayR ? t('today is {0}', todayR.name) : t('rest day, but no one’s stopping you')}</div></div></div>
    {todayR && <section className="card start-today">
      <h2 className="accent">{t("Today's plan")}{todayOvr ? ' · ' + t('rescheduled') : ''}</h2>
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

/* ---------- elapsed clock (isolated so the workout tree doesn't re-render every second) ---------- */
function Elapsed({ start }) {
  const [t, setT] = useState('0:00')
  useEffect(() => {
    const tick = () => setT(fmtElapsed((Date.now() - start) / 1000))
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv)
  }, [start])
  return <span>{t}</span>
}

/* ---------- one exercise block (reps: weight×reps · time: a held duration · cardio: duration+speed) ---------- */
// The set ladder is the whole point of the app, so its layout follows how it is used: the set in
// front of you is one large console (big figure over two big keys, the bar drawn, one key to log
// it) and every other set is a single readable line, still typeable, one tap from opening up.
function ExerciseBlock({ entryIdx, compact, isCurrent = true, arrived = false, onToggle, onField, onAddSet, onRemoveSet, onAddWarmup, onRemoveSetAt, onStartTimed, onReplace }) {
  const S = useStore(s => s.S)
  const working = useUI(s => s.work)
  const holding = useUI(s => !!s.work)
  const entry = S.active.entries[entryIdx]
  const ex = exOr(entry.id)
  const mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const cardio = mode === 'cardio'
  const timed = mode === 'time'
  const last = lastEntryFor(S, entry.id)
  // The same number the "confirm your working weight" sheet calls your best, so the two
  // never disagree inside one session: heaviest logged set, or the working weight you kept.
  const best = cardio ? 0 : bestKnownWeight(S, entry.id)
  // What the progression policy decided for this session, and why (issue #17). Computed when
  // the session was built so the reason matches the numbers already in the rows.
  const plan = entry.plan
  // A bodyweight set has no weight to type, so the column is not there (issue #32) — one
  // stepper instead of two, which is the whole point of the flag. Adding a belt weight in the
  // config brings it back, now labelled as the addition it is.
  const cfg = { ...(entry.target || {}), id: entry.id }
  const bw = !cardio && isBw(cfg)
  const added = bw && entry.sets.some(s => s.w > 0)
  const loadCol = { f: 'w', step: 2.5, dec: true, hd: bw ? t('Added ({0})', S.unit) : t('Weight ({0})', S.unit), unit: S.unit }
  // The reps column is the total in every mode, unilateral included — the stepper walks in
  // twos there so the number you land on is one you can actually split evenly.
  const repCol = { f: 'r', step: repStep(cfg), dec: false, hd: t('Reps'), unit: t('reps') }
  const col1 = cardio ? { f: 'min', step: 1, dec: false, hd: t('Duration (min)'), unit: t('min') }
    : timed ? { f: 'sec', step: 5, dec: false, hd: t('Seconds'), unit: t('sec') }
      : (bw && !added) ? repCol : loadCol
  const col2 = cardio ? { f: 'speed', step: 0.5, dec: true, hd: t('Speed (km/h)'), unit: t('km/h') }
    : timed ? ((bw && !added) ? null : loadCol)
      : (bw && !added) ? null : repCol
  // Effort (RIR or RPE, whichever the profile logs) only makes sense for weighted rep sets,
  // not cardio/timed holds, and is opt-in since it adds a third stepper to every row. `opt`
  // because an unlogged effort is not the same as 0 — RIR 0 says the set went to failure.
  const kind = effortOf(S)
  const eff = EFFORT[kind]
  const col3 = mode === 'reps' && eff ? { ...eff, eff: kind, dec: true, opt: true, hd: t(eff.hd), unit: t(eff.hd) } : null

  // The open set: wherever the lifter tapped, else the first one not yet logged — on the
  // exercise being worked, so a superset partner stays folded until its turn comes round.
  const firstOpen = entry.sets.findIndex(s => !s.done)
  const place = entry.id + ':' + firstOpen
  const [picked, setPicked] = useState(null)
  const [pickedAt, setPickedAt] = useState(place)
  if (place !== pickedAt) { setPickedAt(place); setPicked(null) }
  const openRow = picked ?? (isCurrent ? firstOpen : -1)
  // Each logged set folds to one line and pushes the next console down the page, so by the last
  // set the Log key would sit under the fold or the rest dock. Follow it; a new exercise starts
  // from the top of its page first. Deferred a frame: a log may have just opened the rest dock,
  // whose scroll padding this measures against, and closing a sheet restores the old position.
  const openRef = useRef(null)
  const anchor = entry.id + ':' + openRow
  // Seeded with the open set, so opening the workout screen leaves the page where it is. A block
  // that mounts because the lifter moved to it (a single exercise after a superset: the two
  // layouts are separate components) starts unseeded, so that move goes to the top as well.
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

  // The effort column walks its own scale — see stepEffort. Weight and reps step up from 0
  // with no ceiling, as they always did.
  const bump = (s, i, col, dir) => {
    if (col.eff) return onField(i, col.f, stepEffort(col.eff, s[col.f], dir))
    onField(i, col.f, Math.max(0, Math.round(((s[col.f] || 0) + dir * col.step) * 100) / 100))
  }
  // Uses the shared stepper markup so a set row picks up the same control styling
  // as every other +/- field in the app.
  const cell = (s, i, col, cls, phaseNum, warm) => {
    const phasePrefix = warm ? t('Warm-up set {0}', phaseNum) : t('Set {0}', phaseNum)
    const fieldLabel = `${phasePrefix} ${col.hd}`
    return (
      <div className={'stp ' + cls}>
        <button className="stp-dec" aria-label={`${t('Decrease')} ${fieldLabel}`} onClick={() => bump(s, i, col, -1)}><Icon name="minus" /></button>
        {/* a typed effort is capped — there is no RPE 12, and 12 reps in reserve is a warm-up */}
        <span className="val"><NumberField decimal={col.dec} nullable={col.opt} value={s[col.f] ?? ''}
          aria-label={fieldLabel} placeholder={col.opt ? '—' : undefined}
          onChange={v => onField(i, col.f, col.eff ? capEffort(col.eff, v) : v)} /><i>{col.unit}</i></span>
        <button className="stp-inc" aria-label={`${t('Increase')} ${fieldLabel}`} onClick={() => bump(s, i, col, 1)}><Icon name="plus" /></button>
      </div>
    )
  }
  return <section className={'exblock' + (compact ? ' compact' : '')}>
    <div className="exhead">
      <div className="exhead-t">
        <h2 className={'d' + (ex.n.length > 26 ? ' long' : '')}>{ex.n}</h2>
        <div className="row extags">
          {cardio && <span className="tag">{t('Cardio')}</span>}
          {/* You log the total; this is the split, so the set in front of you is unambiguous
              without the rep count having to mean two different things (issue #31). */}
          {!cardio && !timed && isPerSide(cfg) && <span className="tag nocap">{t('{0} per side', fmtNum(sideReps(entry.sets.find(s => !s.done)?.r ?? entry.sets[0]?.r)))}</span>}
          {(ex.tg || ex.bp) && <span className="tag">{t(ex.tg || ex.bp)}</span>}
          {ex.eq && <span className="tag">{t(ex.eq)}</span>}
          {best > 0 && <span className="tag nocap ex-best">{t('Best:')} {fmtNum(best)} {S.unit}</span>}
        </div>
        <div className="extools">
          {!entry.notes && (
            <button className="iconbtn bare" aria-label={t('Add note')} title={t('Add note')} onClick={() => exerciseNoteSheet(entryIdx)}><Icon name="clipboard" /></button>
          )}
          <button className="iconbtn bare" aria-label={t('Replace exercise')} title={t('Replace exercise')} disabled={holding} onClick={() => onReplace(entryIdx)}><Icon name="shuffle" /></button>
          <button className="iconbtn bare" aria-label={t('Details')} onClick={() => exerciseDetailSheet(ex)}><Icon name="info" /></button>
        </div>
      </div>
      <Media ex={ex} key={entry.id} compact={compact} minimizable />
    </div>
    {last && <div className="small dim ex-last">{t('Last time')} ({fmtDate(last.d)}): {last.sets.map(s => setLabel(entry.id, s, last.target)).join(', ')}</div>}
    {plan && plan.why && plan.kind !== 'off' && <div className={'progline' + (plan.kind === 'deload' ? ' warn' : '')}>
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
        // Numbering restarts per phase: with two warm-ups the first work set reads 1, not 3.
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
            {/* A timed set is started, not typed: the timer counts the hold down and checks the
                set off itself. The checkbox stays for anyone who timed it on their own watch. */}
            {timed && <button className="setgo" aria-label={t('Start set')} disabled={s.done || !!working}
              onClick={() => onStartTimed(i)}><Icon name="play" /><span className="setgo-l">{t('Start set')}</span></button>}
            {warm && <button className="iconbtn bare set-x" aria-label={t('Remove set')}
              disabled={entry.sets.length <= 1} onClick={() => onRemoveSetAt(i)}><Icon name="xmark" /></button>}
            <Check checked={s.done} aria-label={`${t('Complete')} ${warm ? t('warm-up set {0}', phaseNum) : t('set {0}', phaseNum)}`} onChange={() => onToggle(i)}>
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
export function removeActiveExercise(idx) {
  // Clear the work callback before indexes can shift. This also protects a confirmation sheet
  // that was opened first and confirmed after a timed hold started.
  useUI.getState().stopWork()
  useStore.getState().removeActiveExercise(idx)
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
        useStore.getState().replaceActiveExercise(idx, newEx.id, cfg)
      }, null, routine, seed, null, t('Replace'))
    })
  }

  const hasDone = (entry.sets || []).some(isPerformed)
  if (hasDone) {
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
  const units = supersetUnits(entries)
  const unitFirst = new Set(units.filter(u => u.length > 1).map(u => u[0]))
  const inSuperset = new Set(units.filter(u => u.length > 1).flat())

  const move = (idx, dir) => {
    useStore.getState().moveActiveExercise(idx, dir)
  }
  const select = idx => {
    useStore.getState().setActiveIndex(idx)
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
        const done = doneWorkSets(entry).length
        const total = workSets(entry).length
        return <div key={idx}>
          {unitFirst.has(idx) && <div className="ss-label"><Icon name="link" />{t('Superset')}</div>}
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

/** Active-workout route body; logs sets for the running session. */
function ActiveWorkout() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const startRest = useUI(s => s.startRest)
  const stopRest = useUI(s => s.stopRest)
  const resting = useUI(s => !!s.timer)
  const holding = useUI(s => !!s.work)
  const A = S.active
  const units = supersetUnits(A.entries)
  const cur = Math.min(A.cur, Math.max(0, A.entries.length - 1))
  const unit = A.entries.length ? unitOf(units, cur) : []
  const unitIdx = units.findIndex(u => u === unit)
  const isSuperset = unit.length > 1
  // Whether the lifter has moved off the exercise this screen opened on. ExerciseBlock follows
  // moves itself, except when it is mounted by one; this tells it that it arrived.
  const unitKey = unit.map(i => i + ':' + A.entries[i].id).join('+')
  const [shown, setShown] = useState({ key: unitKey, moved: false })
  if (shown.key !== unitKey) setShown({ key: unitKey, moved: true })
  // Superset flow: keep the active exercise in view - completing a set scrolls to the
  // next exercise in the group, then back up to the first exercise of the next round.
  const exRefs = useRef({})
  useEffect(() => {
    if (!isSuperset) return
    const el = exRefs.current[cur]
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [cur, isSuperset, A.entries.length])

  const prog = sessionProgress(A)

  const setField = (idx, i, field, v) => useStore.getState().updateActiveSetField(idx, i, field, v)
  const addSet = idx => useStore.getState().addActiveSet(idx)
  const removeSet = idx => useStore.getState().removeActiveSet(idx)
  const addWarmup = idx => useStore.getState().addActiveWarmup(idx)
  const removeSetAt = (idx, i) => useStore.getState().removeActiveSet(idx, i)
  const pairAt = (first, second) => useStore.getState().pairActiveSuperset(first, second)
  const unpairAt = idx => useStore.getState().unpairActiveSuperset(idx)
  const onPairPrev = !isSuperset && cur > 0 ? () => pairAt(cur - 1, cur) : null
  const onPairNext = !isSuperset && cur < A.entries.length - 1 ? () => pairAt(cur, cur + 1) : null

  // Remove a whole exercise from the session. The confirmation always asks first; in a
  // superset it asks WHICH exercise of the group to remove.
  const removeExercise = removeActiveExercise
  const confirmRemoveExercise = idx => {
    const e = A.entries[idx]
    if (!e) return
    const hasDone = (e.sets || []).some(isPerformed)
    confirmSheet({
      title: t('Remove {0}?', exOr(e.id).n),
      message: hasDone
        ? t('The sets you logged for this exercise in this session will be lost.')
        : t('This removes the exercise from your current session.'),
      confirmText: t('Remove'), danger: true, onConfirm: () => removeExercise(idx)
    })
  }
  const removeExerciseSheet = () => {
    if (unit.length > 1) {
      useUI.getState().openSheet(close => (
        <div>
          <h3>{t('Remove exercise')}</h3>
          <div className="sheet-sub">{t('Which exercise in this superset do you want to remove?')}</div>
          <div className="list">
            {unit.map(idx => <div key={idx} className="item" onClick={() => { close(); confirmRemoveExercise(idx) }}>
              <div className="grow"><div className="tt">{exOr(A.entries[idx]?.id).n}</div></div>
              <Icon name="chevronRight" />
            </div>)}
          </div>
        </div>
      ))
    } else confirmRemoveExercise(cur)
  }

  const replaceExerciseSheet = () => {
    if (unit.length > 1) {
      useUI.getState().openSheet(close => (
        <div>
          <h3>{t('Replace exercise')}</h3>
          <div className="sheet-sub">{t('Which exercise in this superset do you want to replace?')}</div>
          <div className="list">
            {unit.map(idx => <div key={idx} className="item" onClick={() => { close(); replaceActiveExerciseFlow(idx) }}>
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

  // A timed set is held, not typed. The Hold timer records what was actually held — an early
  // finish logs 0:38 of a 0:45 target rather than crediting the full prescription — and then
  // checks the set off through the normal path, so rest, supersets and the finish prompt all
  // behave exactly as they do for a reps set.
  const startTimed = (idx, i) => {
    const e = A.entries[idx]
    useUI.getState().startWork(e.sets[i].sec || 45, exOr(e.id).n, elapsed => {
      useStore.getState().updateActiveSetField(idx, i, 'sec', elapsed)
      if (!useStore.getState().S.active?.entries?.[idx]?.sets?.[i]?.done) toggle(idx, i)
    })
  }

  const toggle = (idx, i) => {
    const res = useStore.getState().toggleActiveSet(idx, i)
    if (!res) return

    if (res.checked) {
      playSetComplete(S.sound)
    }

    if (res.next.kind === 'open-topweight') topWeightSheet(idx)
    else if (res.next.kind === 'open-finish') workoutCompleteSheet()
    else if (res.notice === 'cardio') useUI.getState().toast(t('Cardio logged'))
    else if (res.notice === 'timed') useUI.getState().toast(t('Hold logged'))

    // Rest start/stop is gated on genuinely new progress inside the domain (see
    // toggleActiveSet) — don't add caller-side gating here.
    if (res.rest.stop) stopRest()
    if (res.rest.start) startRest(S.restSec)
  }

  const discard = () => confirmSheet({ title: t('Discard workout?'), message: t('The sets you logged in this session will be lost.'), confirmText: t('Discard'), danger: true, onConfirm: () => { useStore.getState().discardSession(); stopRest(); nav('/home') } })

  return <div className="workout">
    <header className="hdr wk-hdr">
      <button className="iconbtn bare wk-min" aria-label={t('Minimize workout')} onClick={() => nav('/home')}><Icon name="chevronDown" /></button>
      <div className="wk-title"><h1>{A.name}</h1><div className="sub"><Elapsed start={A.start} /> · {t('{0} sets', prog.done + '/' + prog.total)}</div></div>
      <button className="btn sm plain wk-finish" aria-label={t('Finish')} onClick={finishWorkout}>{t('Finish')}</button>
      {/* One segment per exercise, filling as its work sets are logged: where you are in the
          session at a glance, and a one-thumb jump to anywhere in it. */}
      {units.length > 0 && <div className="lad" role="group" aria-label={t('Exercises in this workout')}>
        {units.map((u, k) => {
          const total = u.reduce((n, i) => n + workSets(A.entries[i]).length, 0)
          const done = u.reduce((n, i) => n + doneWorkSets(A.entries[i]).length, 0)
          return <button key={u[0]} className={'lad-s' + (k === unitIdx ? ' on' : '')} aria-current={k === unitIdx ? 'step' : undefined}
            aria-label={t('Go to {0}', u.map(i => exOr(A.entries[i].id).n).join(' + '))}
            onClick={() => useStore.getState().setActiveIndex(u[0])}>
            <span className="lad-b"><i style={{ transform: `scaleX(${total ? done / total : 0})` }} /></span>
          </button>
        })}
      </div>}
    </header>

    {A.entries.length ? <>
      {/* A rest can also be started by hand, between sets or exercises, without logging a
          set that did not happen. Disabled — never hidden — while either countdown runs, so
          the line keeps its place and a tap can never restart or shadow the active timer. */}
      <div className="wk-meta">
        <div className="muted small">{isSuperset ? t('Superset {0} / {1}', unitIdx + 1, units.length) : t('Exercise {0} / {1}', unitIdx + 1, units.length)}</div>
        <Button size="sm" variant="ghost" icon="timer" disabled={resting || holding} onClick={() => startRest(S.restSec)}>
          {t('Rest {0}', fmtSec(S.restSec))}
        </Button>
      </div>
      {isSuperset ? (
        <div className="ss-card">
          <div className="ss-hd">
            <span className="row"><Icon name="link" />{t('Superset · do these back-to-back, rest when done')}</span>
            <Button size="xs" variant="ghost" icon="link" title={t('Unpair')} onClick={() => unpairAt(cur)}>{t('Unpair')}</Button>
          </div>
          {unit.map((idx, k) => <div key={idx} ref={el => { exRefs.current[idx] = el }} className="ss-ex" data-exidx={idx}>
            {k > 0 && <div className="ss-amp"><Icon name="plus" /></div>}
            <ExerciseBlock entryIdx={idx} compact isCurrent={idx === cur}
              onToggle={i => toggle(idx, i)} onField={(i, f, v) => setField(idx, i, f, v)} onAddSet={() => addSet(idx)} onRemoveSet={() => removeSet(idx)} onAddWarmup={() => addWarmup(idx)} onRemoveSetAt={i => removeSetAt(idx, i)} onStartTimed={i => startTimed(idx, i)}
              onReplace={replaceActiveExerciseFlow} />
          </div>)}
        </div>
      ) : (
        <ExerciseBlock entryIdx={cur} arrived={shown.moved} onToggle={i => toggle(cur, i)} onField={(i, f, v) => setField(cur, i, f, v)} onAddSet={() => addSet(cur)} onRemoveSet={() => removeSet(cur)} onAddWarmup={() => addWarmup(cur)} onRemoveSetAt={i => removeSetAt(cur, i)} onStartTimed={i => startTimed(cur, i)}
          onReplace={replaceActiveExerciseFlow} />
      )}
    </> : <div className="empty"><div className="ico"><Icon name="shuffle" /></div>{t('Freestyle workout — add your first exercise.')}</div>}

    <div className="wk-nav">
      <Button icon="chevronLeft" disabled={unitIdx <= 0} onClick={() => useStore.getState().setActiveIndex(units[unitIdx - 1][0])}>{t('Prev')}</Button>
      <Button trailingIcon="chevronRight" disabled={unitIdx < 0 || unitIdx >= units.length - 1} onClick={() => useStore.getState().setActiveIndex(units[unitIdx + 1][0])}>{t('Next')}</Button>
    </div>
    <Button onClick={() => exercisePicker(ex => {
      const routine = S.routines.find(r => r.id === A.routineId)
      const freestyle = !A.routineId
      const seed = freestyle ? freestyleConfig(S, { id: ex.id, ...defaultConfig(ex.id) }) : null
      exConfigSheet(ex, null, cfg => {
        useStore.getState().addActiveExercise(ex.id, cfg)
      }, null, routine, seed)
    })} icon="plus">{t('Add exercise')}</Button>
    {A.entries.length > 0 && <div className="wk-manage">
      <Button size="sm" variant="ghost" icon="list" disabled={holding || A.entries.length < 2} onClick={reorderExerciseSheet}>{t('Reorder exercises')}</Button>
      <Button size="sm" variant="ghost" icon="shuffle" disabled={holding} onClick={replaceExerciseSheet}>{t('Replace exercise')}</Button>
      {onPairPrev && <Button size="sm" variant="ghost" icon="link" title={t('Make superset with previous')} onClick={onPairPrev}>{t('Make superset with previous')}</Button>}
      {onPairNext && <Button size="sm" variant="ghost" icon="link" title={t('Make superset with next')} onClick={onPairNext}>{t('Make superset with next')}</Button>}
      <Button size="sm" variant="ghost" icon="minus" className="wk-danger" disabled={holding} onClick={removeExerciseSheet}>{t('Remove exercise')}</Button>
    </div>}
    <div className="gap12" />
    <button className={prog.allDone ? 'btn primary go' : 'btn plain'} onClick={finishWorkout}>
      {prog.allDone ? t('Finish workout') : t('Finish workout early · {0} exercises', prog.exDone + '/' + prog.exTotal)}
    </button>
    <button className="btn ghost wk-discard" aria-label={t('Discard')} onClick={discard}>{t('Discard workout')}</button>
  </div>
}

/** Workout route; shows the active session or the start chooser. */
export default function Workout() {
  const active = useStore(s => s.S.active)
  return active ? <ActiveWorkout /> : <StartChooser />
}
