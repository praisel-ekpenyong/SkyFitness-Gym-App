import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXIDX, isCardio, isBodyweightEq, allExercises } from '../lib/exercises.js'
import { fmtDate, fmtNum, exCount, uid, setLabel, sentenceCase } from '../lib/format.js'
import { best as bestOf, best1RM, lastSession } from '../lib/training-log.js'
import { defaultConfig, modeOf, isBw, isPerSide, sideReps } from '../lib/workout-model.js'
import * as catalogueWrites from '../lib/catalogue-writes.js'
import { t, instrFor } from '../lib/i18n.js'
import { nav } from '../lib/nav.js'
import Media, { Thumb } from '../components/Media.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Switch, Segmented, SelectRow, Row, SearchField, TextArea, Stepper } from '../components/ui.jsx'
import { glyphOf, DEFAULT_GLYPH } from '../lib/glyphs.js'
import { FILTER_MUSCLES, PICKABLE_MUSCLES, MUSCLES, MUSCLE_NAME, primaryMuscleOf, primaryMuscleName, secondaryMusclesOf } from '../lib/muscles.js'
import { queryCatalogue } from '../lib/catalogue-query.js'
import { estimate1RM, REP_CAP } from '../lib/onerm.js'
import { policyFor, defaultIncrement, POLICIES_FOR, POLICY_NAME, POLICY_DESC, MAX_BW_SETS } from '../lib/progression.js'
import { strengthLevelOf } from '../lib/strength-level.js'
import { ExerciseStrengthLine } from '../components/StrengthLine.jsx'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)

let _confirmSheet = null
/**
 * Wires the confirm-sheet seam for catalogue sheets.
 *
 * @param {Function} confirmSheet Hub confirm dialog.
 */
export function configureCatalogueSheets({ confirmSheet }) {
  if (confirmSheet) _confirmSheet = confirmSheet
}

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
      {t('From your log:')} <b className="record">{fmtNum(best.est)} {st.unit}</b>
      <span className="dim"> · {t('{0} × {1} on {2}', fmtNum(best.w) + ' ' + st.unit, best.r, fmtDate(best.d, true))}</span>
    </div>}
    <div className="row cfgrow onerm-in">
      <Stepper label={t('Weight ({0})', st.unit)} value={w} step={2.5} onChange={setW} />
      <Stepper label={t('Reps')} value={r} step={1} decimal={false} onChange={setR} />
    </div>
    <div className="row between onerm-out">
      <span className="muted small">{t('Estimate')}</span>
      <b className="onerm-est">{est === null ? '—' : fmtNum(est) + ' ' + st.unit}</b>
    </div>
    <div className="small dim">{est === null
      ? t('Enter a weight and 1–{0} reps — beyond that an estimate is guesswork.', REP_CAP)
      : t('Epley formula — a calculation from one set, not a tested max.')}</div>
  </>
}

/**
 * Exercise-detail sheet; Add opens the routine picker and Edit opens the custom form.
 *
 * @param {Object} ex Dataset exercise.
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
    {best > 0 && <div className="small row best-line"><Icon name="trophy" /><span>{t('Best')} <b>{fmtNum(best)} {st.unit}</b>{last ? ` · ${t('last {0} · {1}', fmtDate(last.d), last.sets.map(s => setLabel(ex.id, s, last.target)).join(', '))}` : ''}</span></div>}
    {strength && <ExerciseStrengthLine reading={strength} unit={st.unit} />}
    <div className="gap8" />
    <Button variant="primary" icon="plus" onClick={() => addToRoutineSheet(ex)}>{t('Add to my plan')}</Button>
    {ex.custom && <div className="split">
      <Button icon="pencil" onClick={() => { close(); customExSheet(ex) }}>{t('Edit')}</Button>
      <Button variant="danger" icon="trash" onClick={() => deleteCustomEx(ex, close)}>{t('Delete')}</Button>
    </div>}
    {!isCardioEx && <OneRM ex={ex} />}
    {instrFor(ex).length > 0 && <><h4 className="sec">{t('How to')}</h4><ol className="steps-list">{instrFor(ex).map((s, i) => <li key={i}>{s}</li>)}</ol></>}
  </>
}
export const exerciseDetailSheet = ex => ui().openSheet(close => <ExerciseDetail ex={ex} close={close} />)

function AddToRoutine({ ex, close }) {
  const st = useStore(s => s.S)
  const pick = rid => {
    close()
    const isNew = rid === '_new'
    exConfigSheet(ex, null, cfg => {
      update(s => {
        let r = isNew ? { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] } : s.routines.find(x => x.id === rid)
        if (isNew) s.routines.push(r)
        if (r) r.ex.push({ id: ex.id, ...cfg })
      })
      const r = isNew ? S().routines[S().routines.length - 1] : st.routines.find(x => x.id === rid)
      toast(t('“{0}” added to {1}', ex.n, r ? r.name : t('routine')))
      if (isNew && r) nav('/plan/r/' + r.id)
    }, null, isNew ? null : st.routines.find(x => x.id === rid))
  }
  return <>
    <h3>{t('Add “{0}”', ex.n)}</h3>
    <div className="sheet-sub">{t('Pick a routine — sets, reps and weight come next.')}</div>
    <div className="list">
      {st.routines.map(r => <div key={r.id} className="item" onClick={() => pick(r.id)}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        {r.ex.some(e => e.id === ex.id) && <span className="tag">{t('already in')}</span>}<Icon name="plus" className="chev" />
      </div>)}
      <div className="item" onClick={() => pick('_new')}><span className="lrow-i"><Icon name="sparkles" /></span>
        <div className="grow"><div className="tt">{t('New routine')}</div><div className="ss">{t('Create one and start with this exercise')}</div></div><Icon name="plus" className="chev" /></div>
    </div>
  </>
}
/** Opens the add-to-routine picker for the given exercise. */
export const addToRoutineSheet = ex => ui().openSheet(close => <AddToRoutine ex={ex} close={close} />)

export function CustomExForm({ existing, prefill, onDone, close }) {
  const [name, setName] = useState(existing ? existing.n : (prefill || ''))
  const [initialPick] = useState(() => ({
    primary: existing ? (primaryMuscleOf(existing) || '') : '',
    secondaries: existing ? (secondaryMusclesOf(existing) || []) : [],
  }))
  const [primary, setPrimary] = useState(initialPick.primary)
  const [secondaries, setSecondaries] = useState(initialPick.secondaries)
  const [desc, setDesc] = useState(existing ? (existing.desc || '') : '')

  const selectPrimary = m => {
    setPrimary(m)
    if (m === 'cardio') {
      setSecondaries([])
    } else {
      setSecondaries(prev => prev.filter(s => s !== m))
    }
  }

  const toggleSecondary = m => {
    if (!primary || m === primary || primary === 'cardio') return
    setSecondaries(prev => prev.includes(m) ? prev.filter(s => s !== m) : [...prev, m])
  }

  const save = () => {
    const trimmedName = name.trim()
    if (!trimmedName) { toast(t('Give it a name')); return }
    if (!primary) { toast(t('Pick a primary muscle')); return }
    const dup = allExercises(S()).find(e => e.n.toLowerCase() === trimmedName.toLowerCase() && e.id !== (existing || {}).id)
    if (dup) { toast(t('“{0}” already exists', dup.n)); return }
    const trimmedDesc = desc.trim().slice(0, 1000)
    const finalSm = primary === 'cardio' ? [] : secondaries
    // The form shows a stored plain Shoulders (or a bodypart-only legacy
    // exercise) as the muscles it counts for. Save those back only when the
    // lifter changes the pick, so untouched muscles stay as stored (ADR 0024).
    const pickChanged = primary !== initialPick.primary
      || finalSm.length !== initialPick.secondaries.length
      || finalSm.some(m => !initialPick.secondaries.includes(m))
    const muscles = existing && !pickChanged ? { tg: existing.tg, sm: existing.sm } : { tg: primary, sm: finalSm }
    let id
    update(s => {
      id = catalogueWrites.upsertCustomEx(s, { id: existing ? existing.id : null, n: trimmedName, ...muscles, desc: trimmedDesc })
    })
    close()
    toast(existing ? t('Saved') : t('“{0}” created', trimmedName))
    onDone && onDone(EXIDX[id])
  }

  return <>
    <h3>{existing ? t('Edit custom exercise') : t('Create your own exercise')}</h3>
    <div className="sheet-sub">{t('Name it and pick its primary and secondary muscles — it behaves like any other exercise, just without an animation.')}</div>
    <input className="input" placeholder={t('Exercise name')} aria-label={t('Exercise name')} value={name} onChange={e => setName(e.target.value)} />

    <div className="field-l">{t('Primary muscle')}</div>
    <div className="chips">
      {PICKABLE_MUSCLES.map(m => (
        <button
          key={m}
          className={'chip nocap' + (primary === m ? ' on' : '')}
          onClick={() => selectPrimary(m)}
        >
          {sentenceCase(t(MUSCLE_NAME[m] || m))}
        </button>
      ))}
    </div>

    {primary === 'cardio' ? (
      <div className="small dim dim-note">
        {t('Cardio exercises log time and speed instead of weight × reps.')}
      </div>
    ) : primary ? (
      <>
        <div className="field-l">{t('Secondary muscles (optional)')}</div>
        <div className="chips">
          {MUSCLES.filter(m => m !== primary).map(m => {
            const on = secondaries.includes(m)
            return (
              <button
                key={m}
                className={'chip nocap' + (on ? ' on' : '')}
                onClick={() => toggleSecondary(m)}
              >
                {sentenceCase(t(MUSCLE_NAME[m] || m))}
              </button>
            )
          })}
        </div>
      </>
    ) : null}

    <div className="gap12" />
    <textarea className="input" rows={4} maxLength={1000} placeholder={t('Description (optional) — setup, cues, anything you want to remember')}
      value={desc} onChange={e => setDesc(e.target.value)} />
    <div className="gap16" />
    <Button variant="primary" onClick={save}>{existing ? t('Save') : t('Create exercise')}</Button>
    {existing && <><div className="gap8" /><Button variant="danger" icon="trash" onClick={() => { close(); deleteCustomEx(existing) }}>{t('Delete exercise')}</Button></>}
  </>
}
/**
 * Opens the custom-exercise form; saving creates or updates the exercise.
 *
 * @param {Object} existing Exercise being edited, if any.
 * @param {Function} onDone Called with the saved exercise.
 * @param {string} prefill Initial name for a new exercise.
 */
export const customExSheet = (existing, onDone, prefill) => ui().openSheet(close => <CustomExForm existing={existing} prefill={prefill} onDone={onDone} close={close} />)
/**
 * Confirms then deletes a custom exercise from routines and catalogue.
 *
 * @param {Object} ex Custom exercise to delete.
 * @param {Function} afterDelete Runs after deletion.
 */
export function deleteCustomEx(ex, afterDelete) {
  if (S().active?.entries.some(e => e.id === ex.id)) { toast(t('Finish your current workout first')); return }
  if (!_confirmSheet) throw new Error('catalogue sheets not wired: missing confirmSheet')
  let res = null
  _confirmSheet({
    title: t('Delete “{0}”?', ex.n),
    message: t('It will be removed from your routines. Already-logged workouts keep their sets.'),
    confirmText: t('Delete'), danger: true,
    onConfirm: () => {
      update(s => { res = catalogueWrites.deleteCustomEx(s, ex) })
      if (!res.ok) { toast(t('Finish your current workout first')); return }
      toast(t('Exercise deleted'))
      afterDelete && afterDelete()
    }
  })
}

export function ExercisePicker({ onPick }) {
  const st = useStore(s => s.S)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')
  const [eq, setEq] = useState('')
  const [shown, setShown] = useState(50)
  const isFavFilter = filter === 'favorites'
  const isChosenFilter = filter === '★'
  const scope = isFavFilter
    ? { kind: 'favorites' }
    : isChosenFilter ? { kind: 'chosen' }
      : filter ? { kind: 'muscle', muscle: filter } : { kind: 'all' }
  const { rows, equipmentOptions: eqOpts, effectiveEquipment: eqOn, favoriteCount: favCount, chosenCount, catalogueCount } = queryCatalogue({
    profile: st,
    scope,
    search: q,
    equipment: eq,
    ownFirst: true,
  })
  const f = rows
  return <>
    <h3>{t('Add exercise')}</h3>
    <SearchField
      placeholder={t('Search {0} exercises…', fmtNum(catalogueCount))}
      aria-label={t('Search exercises')}
      value={q}
      onChange={e => { setQ(e.target.value); setShown(50) }}
      onClear={() => { setQ(''); setShown(50) }}
    />
    <div className="chips picker-chips">
      {(favCount > 0 || filter === 'favorites') && <button className={'chip chip-i' + (filter === 'favorites' ? ' on' : '')} onClick={() => { setFilter('favorites'); setEq(''); setShown(50) }}><Icon name="starFill" />{t('Favorites')} ({fmtNum(favCount)})</button>}
      {(chosenCount > 0 || filter === '★') && <button className={'chip chip-i' + (filter === '★' ? ' on' : '')} onClick={() => { setFilter('★'); setEq(''); setShown(50) }}><Icon name="check" />{t('Chosen')} ({fmtNum(chosenCount)})</button>}
      <button className={'chip nocap' + (!filter ? ' on' : '')} onClick={() => { setFilter(''); setEq(''); setShown(50) }}>{t('All')}</button>
      {FILTER_MUSCLES.map(m => <button key={m} className={'chip nocap' + (filter === m ? ' on' : '')} onClick={() => { setFilter(m); setEq(''); setShown(50) }}>{sentenceCase(t(MUSCLE_NAME[m] || m))}</button>)}
    </div>
    {eqOpts.length > 1 && <div className="chips picker-chips">
      <button className={'chip nocap' + (!eqOn ? ' on' : '')} onClick={() => { setEq(''); setShown(50) }}>{t('Any equipment')}</button>
      {eqOpts.map(x => <button key={x} className={'chip nocap' + (eqOn === x ? ' on' : '')} onClick={() => { setEq(x); setShown(50) }}>{sentenceCase(t(x))}</button>)}
    </div>}
    <div className="list">
      {filter !== '★' && <div className="item" role="button" tabIndex={0} onClick={() => customExSheet(null, ex => onPick(ex), q.trim())}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); customExSheet(null, ex => onPick(ex), q.trim()) } }}>
        <div className="thumb thumb-x"><Icon name="plus" /></div>
        <div className="grow"><div className="tt">{t('Create your own exercise')}</div><div className="ss">{t('Name and target muscles, no animation')}</div></div>
      </div>}
      {f.slice(0, shown).map(row => {
        const e = row.exercise
        const primary = row.primaryMuscle
        const primaryLabel = (primary && MUSCLE_NAME[primary]) || e.tg || e.bp
        const secondaryMuscle = row.secondaryMatch
        return <div key={e.id} className="item" role="button" tabIndex={0} aria-label={e.n} onClick={() => onPick(e)}
          onKeyDown={ev => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); onPick(e) } }}>
          <Thumb ex={e} />
          <div className="grow">
            <div className="tt capitalize">{e.n}</div>
            <div className="ss">
              {sentenceCase(t(primaryLabel))} · {sentenceCase(t(e.eq))}
              {secondaryMuscle && <span className="tag inline-tag">{t('Secondary: {0}', MUSCLE_NAME[secondaryMuscle] || secondaryMuscle)}</span>}
            </div>
          </div>
          <button
            className={'iconbtn bare' + (row.favorite ? ' on-ss' : '')}
            aria-label={row.favorite ? t('Remove from favorites') : t('Add to favorites')}
            onClick={ev => {
              ev.stopPropagation()
              update(s => { catalogueWrites.toggleFavorite(s, e.id) })
            }}
          >
            <Icon name={row.favorite ? 'starFill' : 'star'} />
          </button>
          <Icon name="plus" className="chev" />
        </div>
      })}
      {f.length === 0 && filter === 'favorites' && favCount === 0 && <div className="empty">{t('No favorites yet — star exercises and they’ll show up here.')}</div>}
      {f.length === 0 && filter === '★' && chosenCount === 0 && <div className="empty">{t('Nothing chosen yet — add exercises and they’ll show up here.')}</div>}
      {f.length === 0 && (filter !== 'favorites' || favCount > 0) && (filter !== '★' || chosenCount > 0) && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
    </div>
    {f.length > shown && <><div className="gap8" /><Button onClick={() => setShown(s => s + 50)}>{t('Show more')}</Button></>}
  </>
}
export const exercisePicker = onPick => ui().openSheet(close => <ExercisePicker onPick={onPick} close={close} />)

function ProgressionFields({ ex, mode, c, setC, routine, unit }) {
  const options = POLICIES_FOR[mode] || ['off']
  if (options.length < 2) return null
  const inherited = policyFor({ id: ex.id }, routine, mode)
  const active = policyFor({ ...c, id: ex.id }, routine, mode)
  const inc = c.inc > 0 ? c.inc : (mode === 'time' ? 5 : defaultIncrement(ex.id, unit))
  return <>
    <h4 className="sec">{t('Progression')}</h4>
    <div className="sect-b cfg-note-sm">
      <SelectRow title={t('Rule')} sheetTitle={t('Progression')} value={c.prog || ''} onChange={v => setC(x => ({ ...x, prog: v || undefined }))}
        options={[{ value: '', label: t('Follow the routine ({0})', t(POLICY_NAME[inherited])) },
          ...options.map(p => ({ value: p, label: t(POLICY_NAME[p]) }))]} />
    </div>
    <div className={'small dim ' + (active === 'off' ? 'cfg-note' : 'cfg-note-sm')}>{t(POLICY_DESC[active])}</div>
    {active !== 'off' && <div className="row cfgrow cfg-note">
      <Stepper label={mode === 'time' ? t('Step (seconds)') : t('Step ({0})', unit)} value={inc}
        step={mode === 'time' ? 5 : 1.25} decimal={mode !== 'time'} onChange={v => setC(x => ({ ...x, inc: v }))} />
      {active === 'double' && <Stepper label={t('Reps from')} value={c.repsMin || Math.max(1, (c.reps || 10) - 2)}
        step={1} decimal={false} onChange={v => setC(x => ({ ...x, repsMin: v }))} />}
    </div>}
  </>
}

export function ExConfig({ ex, existing, onSave, onDelete, close, routine, initial, onReplace, actionLabel }) {
  const st = useStore(s => s.S)
  const cardio = isCardio(ex.id)
  const [c, setC] = useState(() => {
    const base = existing || (initial ? { ...defaultConfig(ex.id), ...initial } : defaultConfig(ex.id))
    return {
      ...base,
      notes: existing?.notes || initial?.notes || '',
    }
  })
  const mode = cardio ? 'cardio' : modeOf({ ...c, id: ex.id })
  const bw = !cardio && isBw({ ...c, id: ex.id })
  const perSide = isPerSide(c)
  const setMode = m => setC(x => ({ ...defaultConfig(ex.id, m), ...x, mode: m }))
  const save = () => {
    close()
    const sets = Math.max(1, Math.round(c.sets) || (cardio ? 1 : 3))
    const prog = {}
    if (c.prog) prog.prog = c.prog
    if (c.inc > 0) prog.inc = c.inc
    const flags = {}
    if (bw !== isBodyweightEq(ex.id)) flags.bodyweight = bw
    const trimmedNotes = typeof c.notes === 'string' ? c.notes.trim().slice(0, 500) : ''
    const noteProp = trimmedNotes ? { notes: trimmedNotes } : {}
    if (cardio) onSave({ sets, min: Math.max(1, Math.round(c.min) || 20), speed: Math.max(0, c.speed || 8), ...noteProp })
    else if (mode === 'time') onSave({ sets, mode: 'time', sec: Math.max(1, Math.round(c.sec) || 45), weight: Math.max(0, c.weight || 0), ...flags, ...prog, ...noteProp })
    else {
      const typed = Math.max(1, Math.round(c.reps) || 10)
      const reps = perSide ? Math.ceil(typed / 2) * 2 : typed
      const out = { sets, mode: 'reps', reps, weight: Math.max(0, c.weight || 0), ...flags, ...(perSide ? { side: true } : {}), ...prog, ...noteProp }
      if (policyFor({ ...c, id: ex.id }, routine, 'reps') === 'double') out.repsMin = Math.min(reps, Math.max(1, Math.round(c.repsMin) || Math.max(1, reps - 2)))
      if (bw && !(out.weight > 0) && c.repsMax > 0) out.repsMax = Math.max(reps, Math.round(c.repsMax))
      onSave(out)
    }
  }
  return <>
    <h3>{ex.n}</h3>
    <Media ex={ex} />
    <div className="row detail-tags">
      {cardio && <span className="tag">{t('Cardio')}</span>}
      {!cardio && <span className="tag">{t(primaryMuscleName(ex))}</span>}<span className="tag">{t(ex.eq)}</span>
    </div>
    {ex.desc && <div className="exnote">{ex.desc}</div>}
    {!cardio && <div>
      <Segmented className="seg-range" label={t('Log mode')} value={mode} onChange={setMode}
        options={[{ value: 'reps', label: t('Reps') }, { value: 'time', label: t('Time') }]} />
    </div>}
    <div className={'row cfgrow ' + (mode === 'time' ? 'cfg-note-sm' : 'cfg-note')}>
      {cardio ? <>
        <Stepper label={t('Intervals')} value={c.sets} step={1} decimal={false} onChange={v => setC(x => ({ ...x, sets: v }))} />
        <Stepper label={t('Minutes')} value={c.min} step={1} decimal={false} onChange={v => setC(x => ({ ...x, min: v }))} />
        <Stepper label={t('Speed (km/h)')} value={c.speed} step={0.5} onChange={v => setC(x => ({ ...x, speed: v }))} />
      </> : mode === 'time' ? <>
        <Stepper label={t('Sets')} value={c.sets} step={1} decimal={false} onChange={v => setC(x => ({ ...x, sets: v }))} />
        <Stepper label={t('Seconds')} value={c.sec} step={5} decimal={false} onChange={v => setC(x => ({ ...x, sec: v }))} />
        <Stepper label={t('Weight ({0})', st.unit)} value={c.weight} step={2.5} onChange={v => setC(x => ({ ...x, weight: v }))} />
      </> : <>
        <Stepper label={t('Sets')} value={c.sets} step={1} decimal={false} onChange={v => setC(x => ({ ...x, sets: v }))} />
        <Stepper label={t('Reps')} value={c.reps} step={perSide ? 2 : 1} decimal={false} onChange={v => setC(x => ({ ...x, reps: v }))} />
        {!bw && <Stepper label={t('Weight ({0})', st.unit)} value={c.weight} step={2.5} onChange={v => setC(x => ({ ...x, weight: v }))} />}
      </>}
    </div>
    {mode === 'time' && !bw && <div className="small dim cfg-note">
      {t('A timer runs while you hold the set. Leave the weight at 0 for bodyweight holds.')}
    </div>}
    {!cardio && <div className="sect-b cfg-note-sm">
      <Row icon="figureStrength" title={t('Bodyweight')}
        subtitle={bw ? t('No weight to enter — just log the reps.') : t('Ask for a weight on every set.')}>
        <Switch checked={bw} label={t('Bodyweight')} onChange={v => setC(x => ({ ...x, bodyweight: v, weight: v ? 0 : x.weight }))} />
      </Row>
      {mode === 'reps' && <Row icon="shuffle" title={t('Reps per side')}
        subtitle={perSide ? t('You still log the total: {0} is {1} per side.', c.reps || 0, fmtNum(sideReps(c.reps))) : t('For lunges, single-arm rows and the like.')}>
        <Switch checked={perSide} label={t('Reps per side')} onChange={v => setC(x => ({ ...x, side: v || undefined, reps: v ? Math.ceil((x.reps || 0) / 2) * 2 : x.reps }))} />
      </Row>}
    </div>}
    {bw && <>
      <div className="row cfgrow cfg-note-sm">
        <Stepper label={t('Added ({0})', st.unit)} value={c.weight || 0} step={2.5}
          onChange={v => setC(x => ({ ...x, weight: v }))} />
      </div>
      <div className="small dim cfg-note">
        {t('For dips or pull-ups with a belt. Progression then follows the weight.')}
      </div>
    </>}
    {mode === 'reps' && bw && !(c.weight > 0) && <div className="row cfgrow cfg-note-sm">
      <Stepper label={t('Top of the range')} value={c.repsMax || 0} step={1} decimal={false}
        onChange={v => setC(x => ({ ...x, repsMax: v }))} />
    </div>}
    {mode === 'reps' && bw && !(c.weight > 0) && <div className="small dim cfg-note">
      {c.repsMax > 0
        ? t('Reps climb to {0}, then a set is added and the reps start over. At {1} sets it asks you to add weight instead.', c.repsMax, MAX_BW_SETS)
        : t('Reps climb by one whenever every set was clean. Set a ceiling to add sets instead of reps forever.')}
    </div>}
    <ProgressionFields ex={ex} mode={mode} c={c} setC={setC} routine={routine} unit={st.unit} />
    <TextArea
      aria-label={t('Notes and cues')}
      placeholder={t('Notes, cues, or machine setup…')}
      maxLength={500}
      value={c.notes || ''}
      onChange={e => setC(x => ({ ...x, notes: e.target.value }))}
    />
    <div className="small dim char-count">{(c.notes || '').length}/500</div>
    <Button variant="primary" onClick={save}>{actionLabel || (existing ? t('Save') : t('Add to routine'))}</Button>
    {onReplace && existing && <><div className="gap8" /><Button icon="shuffle" onClick={() => { close(); onReplace() }}>{t('Replace exercise')}</Button></>}
    {ex.custom && <><div className="gap8" /><Button icon="pencil" onClick={() => { close(); customExSheet(ex) }}>{t('Edit or delete this exercise')}</Button></>}
    {onDelete && <><div className="gap8" /><Button variant="danger" onClick={() => { close(); onDelete() }}>{t('Remove from routine')}</Button></>}
  </>
}
export const exConfigSheet = (ex, existing, onSave, onDelete, routine, initial, onReplace, actionLabel) => ui().openSheet(close => <ExConfig ex={ex} existing={existing} initial={initial} onSave={onSave} onDelete={onDelete} routine={routine} onReplace={onReplace} actionLabel={actionLabel} close={close} />)

