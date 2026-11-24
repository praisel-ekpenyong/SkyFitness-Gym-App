import { useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { exOr } from '../lib/exercises.js'
import { exLine } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { routineView } from '../lib/routines.js'
import { Thumb } from '../components/Media.jsx'
import { glyphPicker } from '../sheets/routine.jsx'
import { exercisePicker, exConfigSheet } from '../sheets/catalogue.jsx'
import { confirmSheet } from '../sheets/confirm.jsx'
import Icon, { ICON_NAMES } from '../components/Icon.jsx'
import { glyphOf } from '../lib/glyphs.js'
import { Button, SelectRow } from '../components/ui.jsx'
import { POLICIES_FOR, POLICY_NAME, POLICY_DESC } from '../lib/progression.js'
import BodyMap from '../components/BodyMap.jsx'
import { loadOfRoutine, rankOf, MUSCLE_NAME } from '../lib/muscles.js'
import { seedForReplacement } from '../lib/workout-model.js'

export default function RoutineEdit() {
  const nav = useNavigate()
  const { id } = useParams()
  const S = useStore(s => s.S)
  const actRoutine = useStore(s => s.actRoutine)
  const r = S.routines.find(x => x.id === id)
  useEffect(() => { if (!r) nav('/plan') }, [!!r])
  if (!r) return null

  const move = (i, dir) => actRoutine({ type: 'moveExercise', routineId: id, index: i, dir })
  const toggleLink = i => actRoutine({ type: 'toggleSuperset', routineId: id, index: i - 1 })

  const view = routineView(r)

  return <div className="narrow routine-edit">
    <h1 className="sr-only">{r.name}</h1>
    <div className="hdr hdr-back">
      <button className="iconbtn" onClick={() => nav('/plan')} aria-label={t('Plan')}><Icon name="chevronLeft" /></button>
      <div className="grow">
        <input className="input rt-title d" defaultValue={r.name} aria-label={t('Routine name')} placeholder={t('Routine name')}
          onChange={e => actRoutine({ type: 'rename', routineId: id, name: e.target.value.trim() || t('Routine') })} />
      </div>
      <button className="btn sm plain hdr-act" aria-label={t('Pick an icon')} onClick={() => glyphPicker(r.emoji, g => actRoutine({ type: 'setGlyph', routineId: id, emoji: g }))}><Icon name={glyphOf(r.emoji, ICON_NAMES)} />{t('Icon')}</button>
    </div>

    {view.entries.length > 0 && (() => {
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
        value={r.prog || 'linear'} onChange={v => actRoutine({ type: 'setProgression', routineId: id, prog: v })}
        options={POLICIES_FOR.reps.map(p => ({ value: p, label: t(POLICY_NAME[p]), subtitle: t(POLICY_DESC[p]) }))} />
    </div>
    <div className="small dim rt-prog-note">
      {t('Applies to every exercise in this routine that does not set its own rule.')}
    </div>

    {view.entries.length ? <div className="list">{view.entries.map((item, i) => {
      const ex = exOr(item.id)
      return <div key={i}>
        {item.isFirstInSuperset && <div className="ss-label"><Icon name="link" />{t('Superset')}</div>}
        <div className={'item rt-ex' + (item.inSuperset ? ' in-ss' : '')} onClick={() => {
          exConfigSheet(ex, {
            existing: item.entry,
            onSave: cfg => actRoutine({ type: 'replaceExercise', routineId: id, index: i, exId: ex.id, target: cfg }),
            onDelete: () => actRoutine({ type: 'removeExercise', routineId: id, index: i }),
            routine: r,
            onReplace: () => exercisePicker(newEx => {
              const initial = seedForReplacement(S, newEx.id, id, item.sets)
              exConfigSheet(newEx, {
                onSave: cfg => actRoutine({
                  type: 'replaceExercise',
                  routineId: id,
                  index: i,
                  exId: newEx.id,
                  target: cfg,
                }),
                routine: r,
                initial,
              })
            }),
          })
        }}>
          <Thumb ex={ex} />
          <div className="grow">
            <div className="tt capitalize">{ex.n}</div>
            <div className="ss">{exLine(item, S.unit)}</div>
            {item.hasNote && <div className="small dim rt-note"><Icon name="clipboard" size={13} /><span>{item.notes}</span></div>}
          </div>
          <div className="rt-tools">
            {i > 0 && <button className={'rt-link' + (item.isLinkedPrev ? ' on-ss' : '')} aria-label={t('Superset with exercise above')} aria-pressed={item.isLinkedPrev} onClick={ev => { ev.stopPropagation(); toggleLink(i) }}><Icon name="link" /><span>{t('Superset with above')}</span></button>}
            <button className="iconbtn bare" aria-label={t('Move up')} onClick={ev => { ev.stopPropagation(); move(i, -1) }}><Icon name="chevronUp" /></button>
            <button className="iconbtn bare" aria-label={t('Move down')} onClick={ev => { ev.stopPropagation(); move(i, 1) }}><Icon name="chevronDown" /></button>
          </div>
        </div>
      </div>
    })}</div> : <div className="empty"><div className="ico"><Icon name="dumbbell" /></div>{t('No exercises yet — add your first one.')}</div>}

    <Button variant="primary" onClick={() => exercisePicker(ex => exConfigSheet(ex, { onSave: cfg => actRoutine({ type: 'addExercise', routineId: id, exId: ex.id, target: cfg }), routine: r }))} icon="plus">{t('Add exercise')}</Button>
    <Button variant="ghost" className="rt-delete" onClick={() => confirmSheet({
      title: t('Delete routine?'), message: t('“{0}” and its exercises will be removed.', r.name), confirmText: t('Delete'), danger: true,
      onConfirm: () => {
        actRoutine({ type: 'delete', routineId: id })
        nav('/plan')
      }
    })}>{t('Delete routine')}</Button>
  </div>
}
