import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXIDX, isCardio, isBodyweightEq, allExercises } from '../lib/exercises.js'
import { fmtDate, fmtNum, exCount, uid } from '../lib/format.js'
import { lastEntryFor, setLabel, defaultConfig, cleanupSg, modeOf, isBw, isPerSide, sideReps, bestWeightFor } from '../lib/history.js'
import { t, instrFor } from '../lib/i18n.js'
import { nav } from '../lib/nav.js'
import Media, { Thumb } from '../components/Media.jsx'
import Stepper from '../components/Stepper.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Switch, Segmented, SelectRow, Row, SearchField } from '../components/ui.jsx'
import { glyphOf, DEFAULT_GLYPH } from '../lib/glyphs.js'
import { FILTER_MUSCLES, MUSCLES, MUSCLE_NAME, primaryMuscleOf, secondaryMusclesOf, bodypartForMuscle, exerciseMuscleSnapshot } from '../lib/muscles.js'
import { queryCatalogue } from '../lib/catalogue-query.js'
import { estimate1RM, best1RM, REP_CAP } from '../lib/onerm.js'
import { policyFor, defaultIncrement, POLICIES_FOR, POLICY_NAME, POLICY_DESC, MAX_BW_SETS } from '../lib/progression.js'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)

/* ============================ injected hub seams ============================ */
// The confirm dialog remains the hub's interface for the duration of the
// migration; all domains keep calling it rather than owning their own. The hub
// re-exports this module, so importing the hub back would be circular.
let _confirmSheet = null
export function configureCatalogueSheets({ confirmSheet }) {
  if (confirmSheet) _confirmSheet = confirmSheet
}

/* ============================ exercise detail ============================ */
// Estimated 1RM for one exercise (issue #18): what the log already implies, plus a calculator
// for a set you have not done — so the number is reachable before there is any history.
function OneRM({ ex }) {
  const st = useStore(s => s.S)
  const best = best1RM(st, ex.id)
  const [w, setW] = useState(best ? best.w : (st.exWeights[ex.id] || {}).w || 20)
  const [r, setR] = useState(best ? best.r : 5)
  const est = estimate1RM(w, r)
  return <>
    <h4 className="sec">{t('Estimated 1RM')}</h4>
    {best && <div className="small" style={{ marginBottom: 8 }}>
      {t('From your log:')} <b className="accent">{fmtNum(best.est)} {st.unit}</b>
      <span className="dim"> · {t('{0} × {1} on {2}', fmtNum(best.w) + ' ' + st.unit, best.r, fmtDate(best.d, true))}</span>
    </div>}
    <div className="row cfgrow" style={{ marginBottom: 10 }}>
      <Stepper label={t('Weight ({0})', st.unit)} value={w} step={2.5} onChange={setW} />
      <Stepper label={t('Reps')} value={r} step={1} decimal={false} onChange={setR} />
    </div>
    <div className="row between" style={{ marginBottom: 4 }}>
      <span className="muted small">{t('Estimate')}</span>
      <b className="accent" style={{ fontSize: 20 }}>{est === null ? '—' : fmtNum(est) + ' ' + st.unit}</b>
    </div>
    <div className="small dim">{est === null
      ? t('Enter a weight and 1–{0} reps — beyond that an estimate is guesswork.', REP_CAP)
      : t('Epley formula — a calculation from one set, not a tested max.')}</div>
  </>
}

export function ExerciseDetail({ ex, close }) {
  const st = useStore(s => s.S)
  const last = lastEntryFor(st, ex.id)
  const best = bestWeightFor(st, ex.id)
  const favs = st.favorites || []
  const isFav = favs.includes(ex.id)
  const isCardioEx = isCardio(ex)
  const primary = primaryMuscleOf(ex)
  const primaryName = primary ? (MUSCLE_NAME[primary] || primary) : null
  const secondaries = secondaryMusclesOf(ex)
  return <>
    <div className="row between" style={{ marginBottom: 14 }}>
      <h3 className="capitalize" style={{ margin: 0 }}>{ex.n}</h3>
      <button
        className={'iconbtn' + (isFav ? ' on-ss' : '')}
        style={{ width: 34, height: 34, fontSize: 18, color: isFav ? 'var(--acc)' : 'var(--label-2)' }}
        aria-label={isFav ? t('Remove from favorites') : t('Add to favorites')}
        onClick={() => {
          update(s => {
            const cur = s.favorites || []
            s.favorites = cur.includes(ex.id) ? cur.filter(id => id !== ex.id) : [...cur, ex.id]
          })
        }}
      >
        <Icon name={isFav ? 'starFill' : 'star'} />
      </button>
    </div>
    <Media ex={ex} />
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
      {isCardioEx ? (
        <span className="tag acc"><Icon name="figureRun" />{t('Cardio')}</span>
      ) : (
        primaryName && <span className="tag acc"><Icon name="target" />{t('Primary: {0}', primaryName)}</span>
      )}
      {ex.eq && <span className="tag"><Icon name="dumbbell" />{t(ex.eq)}</span>}
      {!isCardioEx && secondaries.map((s, i) => <span key={i} className="tag">{t('Secondary: {0}', MUSCLE_NAME[s] || s)}</span>)}
    </div>
    {ex.desc && <div className="exnote">{ex.desc}</div>}
    {best > 0 && <div className="small row" style={{ marginBottom: 6, gap: 5 }}><Icon name="trophy" style={{ fontSize: 14, color: 'var(--yellow)' }} />{t('Best:')} <b className="accent">{fmtNum(best)} {st.unit}</b>{last ? ` · ${t('last')} ${fmtDate(last.d)}: ${last.sets.map(s => setLabel(ex.id, s, last.target)).join(', ')}` : ''}</div>}
    <Button variant="primary" icon="plus" style={{ margin: '10px 0 4px' }} onClick={() => addToRoutineSheet(ex)}>{t('Add to my plan')}</Button>
    {ex.custom && <div className="row" style={{ gap: 8, marginTop: 8 }}>
      <Button icon="pencil" style={{ flex: 1 }} onClick={() => { close(); customExSheet(ex) }}>{t('Edit')}</Button>
      <Button variant="danger" icon="trash" style={{ flex: 1 }} onClick={() => deleteCustomEx(ex, close)}>{t('Delete')}</Button>
    </div>}
    {!isCardioEx && <OneRM ex={ex} />}
    {instrFor(ex).length > 0 && <><h4 className="sec">{t('How to')}</h4><ol className="steps-list">{instrFor(ex).map((s, i) => <li key={i}>{s}</li>)}</ol></>}
  </>
}
export const exerciseDetailSheet = ex => ui().openSheet(close => <ExerciseDetail ex={ex} close={close} />)

/* ============================ add to routine ============================ */
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
    <h3 className="capitalize">{t('Add “{0}”', ex.n)}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Pick a routine — sets, reps & weight come next.')}</div>
    <div className="list">
      {st.routines.map(r => <div key={r.id} className="item" onClick={() => pick(r.id)}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        {r.ex.some(e => e.id === ex.id) && <span className="tag">{t('already in')}</span>}<Icon name="plus" className="chev" />
      </div>)}
      <div className="item" onClick={() => pick('_new')}><span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="sparkles" /></span>
        <div className="grow"><div className="tt">{t('New routine')}</div><div className="ss">{t('Create one and start with this exercise')}</div></div><Icon name="plus" className="chev" /></div>
    </div>
  </>
}
export const addToRoutineSheet = ex => ui().openSheet(close => <AddToRoutine ex={ex} close={close} />)

/* ============================ custom exercises (issue #11) ============================ */
// Name + primary muscle is all it takes — the exercise then behaves like any built-in one
// (planning, logging, PRs, stats), just without an animation.
export function CustomExForm({ existing, prefill, onDone, close }) {
  const [name, setName] = useState(existing ? existing.n : (prefill || ''))
  const [primary, setPrimary] = useState(() => existing ? (primaryMuscleOf(existing) || '') : '')
  const [secondaries, setSecondaries] = useState(() => existing ? (secondaryMusclesOf(existing) || []) : [])
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
    const derivedBp = bodypartForMuscle(primary)
    const finalSm = primary === 'cardio' ? [] : secondaries
    let id = existing && existing.id
    if (existing) {
      update(s => {
        const customEntry = (s.customEx || []).find(x => x.id === id)
        if (customEntry) {
          customEntry.n = trimmedName
          customEntry.tg = primary
          customEntry.sm = finalSm
          customEntry.bp = derivedBp
          customEntry.desc = trimmedDesc
        }
      })
    } else {
      id = 'c' + uid()
      update(s => {
        (s.customEx = s.customEx || []).push({
          id,
          n: trimmedName,
          bp: derivedBp,
          tg: primary,
          sm: finalSm,
          desc: trimmedDesc,
          eq: 'custom',
          custom: true,
        })
      })
    }
    close()
    toast(existing ? t('Saved') : t('“{0}” created', trimmedName))
    onDone && onDone(EXIDX[id])
  }

  return <>
    <h3>{existing ? t('Edit custom exercise') : t('Create your own exercise')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Name it and pick its primary and secondary muscles — it behaves like any other exercise, just without an animation.')}</div>
    <input className="input" placeholder={t('Exercise name')} aria-label={t('Exercise name')} value={name} onChange={e => setName(e.target.value)} />
    
    <div className="small muted" style={{ margin: '12px 0 6px' }}>{t('Primary muscle')}</div>
    <div className="chips" style={{ margin: '0 0 10px' }}>
      {FILTER_MUSCLES.map(m => (
        <button
          key={m}
          className={'chip' + (primary === m ? ' on' : '')}
          onClick={() => selectPrimary(m)}
        >
          {t(MUSCLE_NAME[m] || m)}
        </button>
      ))}
    </div>

    {primary === 'cardio' ? (
      <div className="small dim row" style={{ marginBottom: 12, gap: 5 }}>
        <Icon name="figureRun" style={{ fontSize: 13 }} />
        {t('Cardio exercises log time + speed instead of weight × reps.')}
      </div>
    ) : primary ? (
      <>
        <div className="small muted" style={{ margin: '10px 0 6px' }}>{t('Secondary muscles (optional)')}</div>
        <div className="chips" style={{ margin: '0 0 12px' }}>
          {MUSCLES.filter(m => m !== primary).map(m => {
            const on = secondaries.includes(m)
            return (
              <button
                key={m}
                className={'chip' + (on ? ' on' : '')}
                onClick={() => toggleSecondary(m)}
              >
                {t(MUSCLE_NAME[m] || m)}
              </button>
            )
          })}
        </div>
      </>
    ) : null}

    <textarea className="input" rows={4} maxLength={1000} placeholder={t('Description (optional) — setup, cues, anything you want to remember')}
      value={desc} onChange={e => setDesc(e.target.value)} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{existing ? t('Save') : t('Create exercise')}</Button>
    {existing && <><div style={{ height: 8 }} /><Button variant="danger" icon="trash" onClick={() => { close(); deleteCustomEx(existing) }}>{t('Delete exercise')}</Button></>}
  </>
}
export const customExSheet = (existing, onDone, prefill) => ui().openSheet(close => <CustomExForm existing={existing} prefill={prefill} onDone={onDone} close={close} />)

export function deleteCustomEx(ex, afterDelete) {
  if (S().active?.entries.some(e => e.id === ex.id)) { toast(t('Finish your current workout first')); return }
  if (!_confirmSheet) throw new Error('catalogue sheets not wired: missing confirmSheet')
  _confirmSheet({
    title: t('Delete “{0}”?', ex.n),
    message: t('It will be removed from your routines. Already-logged workouts keep their sets.'),
    confirmText: t('Delete'), danger: true,
    onConfirm: () => {
      update(s => {
        // Keep display and muscle metadata in history before the custom catalogue row disappears.
        const snapshot = exerciseMuscleSnapshot(ex)
        s.workouts.forEach(w => w.entries.forEach(e => {
          if (e.id !== ex.id) return
          e.n = ex.n
          if (!e.muscleSnapshot || !Object.keys(e.muscleSnapshot).length) e.muscleSnapshot = snapshot
        }))
        s.customEx = (s.customEx || []).filter(x => x.id !== ex.id)
        s.routines.forEach(r => { r.ex = r.ex.filter(e => e.id !== ex.id); cleanupSg(r.ex) })
        delete s.exWeights[ex.id]
        s.favorites = (s.favorites || []).filter(id => id !== ex.id)
      })
      toast(t('Exercise deleted'))
      afterDelete && afterDelete()
    }
  })
}

/* ============================ exercise picker ============================ */
export function ExercisePicker({ onPick, close }) {
  const st = useStore(s => s.S)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')          // '' = all, 'favorites' = favorites, '★' = chosen, else a canonical muscle slug or cardio
  const [eq, setEq] = useState('')              // '' = any equipment
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
  })
  const f = rows
  return <>
    <h3>{t('Add exercise')}</h3>
    <SearchField
      placeholder={t('Search {0} exercises…', catalogueCount)}
      aria-label={t('Search exercises')}
      value={q}
      onChange={e => { setQ(e.target.value); setShown(50) }}
      onClear={() => { setQ(''); setShown(50) }}
    />
    <div className="chips" style={{ margin: eqOpts.length > 1 ? '10px 0 6px' : '10px 0' }}>
      {(favCount > 0 || filter === 'favorites') && <button className={'chip' + (filter === 'favorites' ? ' on' : '')} onClick={() => { setFilter('favorites'); setEq(''); setShown(50) }}><Icon name="starFill" style={{ fontSize: 12, display: 'inline-block', marginRight: 4, verticalAlign: '-1px' }} />{t('Favorites')} ({favCount})</button>}
      {(chosenCount > 0 || filter === '★') && <button className={'chip' + (filter === '★' ? ' on' : '')} onClick={() => { setFilter('★'); setEq(''); setShown(50) }}><Icon name="starFill" style={{ fontSize: 12, display: 'inline-block', marginRight: 4, verticalAlign: '-1px' }} />{t('Chosen')} ({chosenCount})</button>}
      <button className={'chip nocap' + (!filter ? ' on' : '')} onClick={() => { setFilter(''); setEq(''); setShown(50) }}>{t('All')}</button>
      {FILTER_MUSCLES.map(m => <button key={m} className={'chip' + (filter === m ? ' on' : '')} onClick={() => { setFilter(m); setEq(''); setShown(50) }}>{t(MUSCLE_NAME[m] || m)}</button>)}
    </div>
    {eqOpts.length > 1 && <div className="chips" style={{ marginBottom: 10 }}>
      <button className={'chip nocap' + (!eqOn ? ' on' : '')} onClick={() => { setEq(''); setShown(50) }}>{t('Any equipment')}</button>
      {eqOpts.map(x => <button key={x} className={'chip' + (eqOn === x ? ' on' : '')} onClick={() => { setEq(x); setShown(50) }}>{t(x)}</button>)}
    </div>}
    <div className="list">
      {filter !== '★' && <div className="item" role="button" tabIndex={0} onClick={() => customExSheet(null, ex => onPick(ex), q.trim())}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); customExSheet(null, ex => onPick(ex), q.trim()) } }}>
        <div className="thumb thumb-x"><Icon name="sparkles" /></div>
        <div className="grow"><div className="tt">{t('Create your own exercise')}</div><div className="ss">{t('name + target muscles, no animation')}</div></div><Icon name="plus" className="chev" />
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
            <div className="ss capitalize">
              {t(primaryLabel)} · {t(e.eq)}
              {secondaryMuscle && <span className="tag" style={{ marginLeft: 6, fontSize: 11, padding: '1px 5px', verticalAlign: 'middle' }}>{t('Secondary: {0}', MUSCLE_NAME[secondaryMuscle] || secondaryMuscle)}</span>}
            </div>
          </div>
          <button
            className={'iconbtn' + (row.favorite ? ' on-ss' : '')}
            style={{ width: 34, height: 34, fontSize: 16, color: row.favorite ? 'var(--acc)' : 'var(--label-2)' }}
            aria-label={row.favorite ? t('Remove from favorites') : t('Add to favorites')}
            onClick={ev => {
              ev.stopPropagation()
              update(s => {
                const cur = s.favorites || []
                s.favorites = cur.includes(e.id) ? cur.filter(id => id !== e.id) : [...cur, e.id]
              })
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
    {f.length > shown && <><div style={{ height: 8 }} /><Button onClick={() => setShown(s => s + 50)}>{t('Show more')}</Button></>}
  </>
}
export const exercisePicker = onPick => ui().openSheet(close => <ExercisePicker onPick={onPick} close={close} />)

/* ============================ exercise config ============================ */
// Progression settings for one exercise (issue #17). Shown inside the config sheet because
// "how does this lift go up" belongs next to sets and reps, not in a separate screen. Left
// on "follow the routine" it inherits, so most people never touch it.
function ProgressionFields({ ex, mode, c, setC, routine, unit }) {
  const options = POLICIES_FOR[mode] || ['off']
  if (options.length < 2) return null
  const inherited = policyFor({ id: ex.id }, routine, mode)
  const active = policyFor({ ...c, id: ex.id }, routine, mode)
  const inc = c.inc > 0 ? c.inc : (mode === 'time' ? 5 : defaultIncrement(ex.id, unit))
  return <>
    <h4 className="sec">{t('Progression')}</h4>
    <div className="sect-b" style={{ marginBottom: 8 }}>
      <SelectRow title={t('Rule')} sheetTitle={t('Progression')} value={c.prog || ''} onChange={v => setC(x => ({ ...x, prog: v || undefined }))}
        options={[{ value: '', label: t('Follow the routine ({0})', t(POLICY_NAME[inherited])) },
          ...options.map(p => ({ value: p, label: t(POLICY_NAME[p]) }))]} />
    </div>
    <div className="small dim" style={{ marginBottom: active === 'off' ? 18 : 10 }}>{t(POLICY_DESC[active])}</div>
    {active !== 'off' && <div className="row cfgrow" style={{ marginBottom: 18 }}>
      <Stepper label={mode === 'time' ? t('Step (seconds)') : t('Step ({0})', unit)} value={inc}
        step={mode === 'time' ? 5 : 1.25} decimal={mode !== 'time'} onChange={v => setC(x => ({ ...x, inc: v }))} />
      {active === 'double' && <Stepper label={t('Reps from')} value={c.repsMin || Math.max(1, (c.reps || 10) - 2)}
        step={1} decimal={false} onChange={v => setC(x => ({ ...x, repsMin: v }))} />}
    </div>}
  </>
}

function ExConfig({ ex, existing, onSave, onDelete, close, routine, initial }) {
  const st = useStore(s => s.S)
  const cardio = isCardio(ex.id)
  const [c, setC] = useState(existing || initial || defaultConfig(ex.id))
  // Cardio keeps its own duration+speed form; the reps/time choice (issue #16) is offered for
  // everything else, which is where the gap was — planks, hangs, wall sits, loaded carries.
  const mode = cardio ? 'cardio' : modeOf({ ...c, id: ex.id })
  // Both default from the dataset and are then whatever the config says — see isBw.
  const bw = !cardio && isBw({ ...c, id: ex.id })
  const perSide = isPerSide(c)
  // Keep whatever the other mode already had (sets, weight) and fill only what is missing.
  const setMode = m => setC(x => ({ ...defaultConfig(ex.id, m), ...x, mode: m }))
  const save = () => {
    close()
    const sets = Math.max(1, Math.round(c.sets) || (cardio ? 1 : 3))
    // Only carry progression settings that differ from the inherited default, so a plan file
    // stays readable and "follow the routine" keeps meaning exactly that.
    const prog = {}
    if (c.prog) prog.prog = c.prog
    if (c.inc > 0) prog.inc = c.inc
    // Written only when it differs from what the dataset already says, so a barbell config
    // stays exactly the shape it was before these flags existed.
    // `bodyweight` is true of a hold as much as of a set of reps; `side` is not — it counts
    // reps, and a timed hold has none. Switching an exercise to Time therefore drops it
    // rather than carrying a flag nothing downstream can read.
    const flags = {}
    if (bw !== isBodyweightEq(ex.id)) flags.bodyweight = bw
    if (cardio) onSave({ sets, min: Math.max(1, Math.round(c.min) || 20), speed: Math.max(0, c.speed || 8) })
    else if (mode === 'time') onSave({ sets, mode: 'time', sec: Math.max(1, Math.round(c.sec) || 45), weight: Math.max(0, c.weight || 0), ...flags, ...prog })
    else {
      // A unilateral target is stored even: the split has to divide, and a typed 15 would
      // otherwise plan seven reps on one side and eight on the other, every session.
      const typed = Math.max(1, Math.round(c.reps) || 10)
      const reps = perSide ? Math.ceil(typed / 2) * 2 : typed
      const out = { sets, mode: 'reps', reps, weight: Math.max(0, c.weight || 0), ...flags, ...(perSide ? { side: true } : {}), ...prog }
      if (policyFor({ ...c, id: ex.id }, routine, 'reps') === 'double') out.repsMin = Math.min(reps, Math.max(1, Math.round(c.repsMin) || Math.max(1, reps - 2)))
      // A ceiling below the working reps would tell you to add a set on day one.
      if (bw && !(out.weight > 0) && c.repsMax > 0) out.repsMax = Math.max(reps, Math.round(c.repsMax))
      onSave(out)
    }
  }
  return <>
    <h3 className="capitalize">{ex.n}</h3>
    <Media ex={ex} />
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '10px 0 14px' }}>
      {cardio && <span className="tag acc"><Icon name="figureRun" />{t('Cardio')}</span>}
      <span className="tag">{t(ex.tg || ex.bp)}</span><span className="tag">{t(ex.eq)}</span>
    </div>
    {ex.desc && <div className="exnote">{ex.desc}</div>}
    {!cardio && <div style={{ marginBottom: 14 }}>
      <Segmented className="seg-range" value={mode} onChange={setMode}
        options={[{ value: 'reps', label: t('Reps') }, { value: 'time', label: t('Time') }]} />
    </div>}
    <div className="row cfgrow" style={{ marginBottom: mode === 'time' ? 8 : 18 }}>
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
        {/* On bodyweight work the weight stepper is the click #32 is about, so it is not here
            until there is a belt to describe — see the added-weight row below. */}
        {!bw && <Stepper label={t('Weight ({0})', st.unit)} value={c.weight} step={2.5} onChange={v => setC(x => ({ ...x, weight: v }))} />}
      </>}
    </div>
    {mode === 'time' && !bw && <div className="small dim" style={{ marginBottom: 18 }}>
      {t('A timer runs while you hold the set. Leave the weight at 0 for bodyweight holds.')}
    </div>}
    {/* ---------- bodyweight + per side (issues #31/#32/#33) ---------- */}
    {!cardio && <div className="sect-b" style={{ marginBottom: 8 }}>
      <Row icon="figureStrength" iconTint="var(--acc)" title={t('Bodyweight')}
        subtitle={bw ? t('No weight to enter — just log the reps.') : t('Ask for a weight on every set.')}>
        <Switch checked={bw} onChange={v => setC(x => ({ ...x, bodyweight: v, weight: v ? 0 : x.weight }))} />
      </Row>
      {mode === 'reps' && <Row icon="shuffle" iconTint="var(--blue)" title={t('Reps per side')}
        subtitle={perSide ? t('You still log the total: {0} is {1} per side.', c.reps || 0, fmtNum(sideReps(c.reps))) : t('For lunges, single-arm rows and the like.')}>
        {/* Turning it on rounds the target up to an even number, since half of an odd
            total is a rep one side does not get. */}
        <Switch checked={perSide} onChange={v => setC(x => ({ ...x, side: v || undefined, reps: v ? Math.ceil((x.reps || 0) / 2) * 2 : x.reps }))} />
      </Row>}
    </div>}
    {/* A stepper is too wide to sit in a list row next to a label — it squeezes the text to
        one word per line — so added weight gets the same full-width treatment as sets and
        reps, with its explanation underneath. */}
    {bw && <>
      <div className="row cfgrow" style={{ marginBottom: 8 }}>
        <Stepper label={t('Added ({0})', st.unit)} value={c.weight || 0} step={2.5}
          onChange={v => setC(x => ({ ...x, weight: v }))} />
      </div>
      <div className="small dim" style={{ marginBottom: 18 }}>
        {t('For dips or pull-ups with a belt. Progression then follows the weight.')}
      </div>
    </>}
    {/* The rep ceiling only means something when there is no load to add instead. */}
    {mode === 'reps' && bw && !(c.weight > 0) && <div className="row cfgrow" style={{ marginBottom: 18 }}>
      <Stepper label={t('Top of the range')} value={c.repsMax || 0} step={1} decimal={false}
        onChange={v => setC(x => ({ ...x, repsMax: v }))} />
    </div>}
    {mode === 'reps' && bw && !(c.weight > 0) && <div className="small dim" style={{ marginTop: -10, marginBottom: 18 }}>
      {c.repsMax > 0
        ? t('Reps climb to {0}, then a set is added and the reps start over. At {1} sets it asks you to add weight instead.', c.repsMax, MAX_BW_SETS)
        : t('Reps climb by one whenever every set was clean. Set a ceiling to add sets instead of reps forever.')}
    </div>}
    <ProgressionFields ex={ex} mode={mode} c={c} setC={setC} routine={routine} unit={st.unit} />
    <Button variant="primary" onClick={save}>{existing ? t('Save') : t('Add to routine')}</Button>
    {ex.custom && <><div style={{ height: 8 }} /><Button icon="pencil" onClick={() => { close(); customExSheet(ex) }}>{t('Edit or delete this exercise')}</Button></>}
    {onDelete && <><div style={{ height: 8 }} /><Button variant="danger" onClick={() => { close(); onDelete() }}>{t('Remove from routine')}</Button></>}
  </>
}
export const exConfigSheet = (ex, existing, onSave, onDelete, routine, initial) => ui().openSheet(close => <ExConfig ex={ex} existing={existing} initial={initial} onSave={onSave} onDelete={onDelete} routine={routine} close={close} />)
