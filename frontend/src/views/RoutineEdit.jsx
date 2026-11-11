import { useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { exOr } from '../lib/exercises.js'
import { exLine } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { supersetUnits, cleanupSg, pairAdjacent, unpairSuperset } from '../lib/supersetFlow.js'
import { detachRoutine } from '../lib/schedule.js'
import { Thumb } from '../components/Media.jsx'
import { glyphPicker, exercisePicker, exConfigSheet, confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { glyphOf } from '../lib/glyphs.js'
import { Button, SelectRow } from '../components/ui.jsx'
import { POLICIES_FOR, POLICY_NAME, POLICY_DESC } from '../lib/progression.js'
import BodyMap from '../components/BodyMap.jsx'
import { loadOfRoutine, rankOf, MUSCLE_NAME } from '../lib/muscles.js'
import { seedForReplacement } from '../lib/workout-model.js'

/** Routine editor route; renames, configures, and orders one routine's exercises. */
export default function RoutineEdit() {
  const nav = useNavigate()
  const { id } = useParams()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const r = S.routines.find(x => x.id === id)
  useEffect(() => { if (!r) nav('/plan') }, [!!r])
  if (!r) return null

  const edit = fn => update(s => {
    const r = s.routines.find(x => x.id === id)
    const next = fn(r.ex)
    // Seam fns return the next list (immutable); in-place tweaks return nothing.
    if (Array.isArray(next)) r.ex = next
  })
  const move = (i, dir) => edit(ex => {
    const j = i + dir
    if (j < 0 || j >= ex.length) return
    const next = [...ex]
    ;[next[i], next[j]] = [next[j], next[i]]
    cleanupSg(next)
    return next
  })
  const toggleLink = i => edit(ex => {
    if (i < 1 || i >= ex.length) return
    const cur = ex[i], prev = ex[i - 1]
    if (cur.sg && prev.sg && cur.sg === prev.sg) return unpairSuperset(ex, i)
    return pairAdjacent(ex, i - 1, i)
  })

  const units = supersetUnits(r.ex)
  const unitFirst = new Set(units.filter(u => u.length > 1).map(u => u[0]))
  const inSS = new Set(units.filter(u => u.length > 1).flat())

  return <div className="narrow routine-edit">
    {/* The name is edited in place, so its input stands where the title would: say so to a screen reader. */}
    <h1 className="sr-only">{r.name}</h1>
    <div className="hdr hdr-back">
      <button className="iconbtn" onClick={() => nav('/plan')} aria-label={t('Plan')}><Icon name="chevronLeft" /></button>
      <div className="grow">
        <input className="input rt-title d" defaultValue={r.name} aria-label={t('Routine name')} placeholder={t('Routine name')}
          onChange={e => update(s => { s.routines.find(x => x.id === id).name = e.target.value.trim() || t('Routine') })} />
      </div>
      <button className="btn sm plain hdr-act" aria-label={t('Pick an icon')} onClick={() => glyphPicker(r.emoji, g => update(s => { s.routines.find(x => x.id === id).emoji = g }))}><Icon name={glyphOf(r.emoji)} />{t('Icon')}</button>
    </div>

    {/* Coverage of the routine as planned, so a gap shows up while you're building it
        rather than after a month of training around it. */}
    {r.ex.length > 0 && (() => {
      const load = loadOfRoutine(r)
      const { worked } = rankOf(load)
      return <section className="card rt-cover">
        <div className="rt-cover-text">
          <h2>{t('What this session hits')}</h2>
          <div className="mchips">
            {worked.slice(0, 6).map(m => <span key={m} className="mchip">{t(MUSCLE_NAME[m])}</span>)}
          </div>
        </div>
        <BodyMap load={load} body={S.body} />
      </section>
    })()}

    <div className="sect-b rt-prog">
      <SelectRow icon="chartLine" title={t('Progression')} sheetTitle={t('Progression')}
        value={r.prog || 'linear'} onChange={v => update(s => { s.routines.find(x => x.id === id).prog = v })}
        options={POLICIES_FOR.reps.map(p => ({ value: p, label: t(POLICY_NAME[p]), subtitle: t(POLICY_DESC[p]) }))} />
    </div>
    <div className="small dim rt-prog-note">
      {t('Applies to every exercise in this routine that does not set its own rule.')}
    </div>

    {r.ex.length ? <div className="list">{r.ex.map((e, i) => {
      // An unresolvable id is shown rather than skipped — hiding it left an entry you
      // could neither see nor delete, but that still turned up in the workout.
      const ex = exOr(e.id)
      const linkedPrev = i > 0 && e.sg && r.ex[i - 1].sg === e.sg
      return <div key={i}>
        {unitFirst.has(i) && <div className="ss-label"><Icon name="link" />{t('Superset')}</div>}
        <div className={'item rt-ex' + (inSS.has(i) ? ' in-ss' : '')} onClick={() => {
          exConfigSheet(
            ex,
            e,
            cfg => edit(x => { x[i] = { id: x[i].id, sg: x[i].sg, ...cfg } }),
            () => edit(x => { x.splice(i, 1); cleanupSg(x) }),
            r,
            null,
            () => exercisePicker(newEx => {
              const initial = seedForReplacement(S, newEx.id, id, e.sets)
              if (initial) delete initial.notes
              exConfigSheet(
                newEx,
                null,
                cfg => edit(x => {
                  const next = { id: newEx.id, sg: e.sg, ...cfg }
                  if (!e.sg) delete next.sg
                  x[i] = next
                }),
                null,
                r,
                initial
              )
            })
          )
        }}>
          <Thumb ex={ex} />
          <div className="grow">
            <div className="tt capitalize">{ex.n}</div>
            <div className="ss">{exLine(e, S.unit)}</div>
            {e.notes && <div className="small dim rt-note"><Icon name="clipboard" size={13} /><span>{e.notes}</span></div>}
          </div>
          <div className="rt-tools">
            {i > 0 && <button className={'extool rt-link' + (linkedPrev ? ' on-ss' : '')} aria-label={t('Superset with exercise above')} aria-pressed={!!linkedPrev} onClick={ev => { ev.stopPropagation(); toggleLink(i) }}><Icon name="link" /><span>{t('Superset with above')}</span></button>}
            <button className="iconbtn bare" aria-label="Move up" onClick={ev => { ev.stopPropagation(); move(i, -1) }}><Icon name="chevronUp" /></button>
            <button className="iconbtn bare" aria-label="Move down" onClick={ev => { ev.stopPropagation(); move(i, 1) }}><Icon name="chevronDown" /></button>
          </div>
        </div>
      </div>
    })}</div> : <div className="empty"><div className="ico"><Icon name="dumbbell" /></div>{t('No exercises yet — add your first one.')}</div>}

    <Button variant="primary" onClick={() => exercisePicker(ex => exConfigSheet(ex, null, cfg => edit(x => { x.push({ id: ex.id, ...cfg }) }), null, r))} icon="plus">{t('Add exercise')}</Button>
    <div className="gap8" />
    <Button variant="danger" onClick={() => confirmSheet({
      title: t('Delete routine?'), message: t('“{0}” and its exercises will be removed.', r.name), confirmText: t('Delete'), danger: true,
      onConfirm: () => {
        update(s => {
          s.routines = s.routines.filter(x => x.id !== id)
          detachRoutine(s, id)
        })
        nav('/plan')
      }
    })}>{t('Delete routine')}</Button>
  </div>
}
