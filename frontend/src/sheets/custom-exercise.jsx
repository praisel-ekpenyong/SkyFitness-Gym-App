import { useState } from 'react'
import { EXIDX, allExercises } from '../lib/exercises.js'
import { sentenceCase } from '../lib/format.js'
import * as catalogueWrites from '../lib/catalogue-writes.js'
import { t } from '../lib/i18n.js'
import { Button } from '../components/ui.jsx'
import { PICKABLE_MUSCLES, MUSCLES, MUSCLE_NAME, primaryMuscleOf, secondaryMusclesOf } from '../lib/muscles.js'
import { confirmSheet } from './confirm.jsx'
import { S, update, ui, toast } from './store-helpers.js'

/** @typedef {import('../lib/types.js').CustomExercise} CustomExercise */

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
    if (onDone) onDone(EXIDX[id])
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
          aria-pressed={primary === m}
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
                aria-pressed={on}
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
    <textarea className="input" rows={4} maxLength={1000} aria-label={t('Description')} placeholder={t('Description (optional) — setup, cues, anything you want to remember')}
      value={desc} onChange={e => setDesc(e.target.value)} />
    <div className="gap16" />
    <Button variant="primary" onClick={save}>{existing ? t('Save') : t('Create exercise')}</Button>
    {existing && <><div className="gap8" /><Button variant="danger" icon="trash" onClick={() => { close(); deleteCustomEx(existing) }}>{t('Delete')}</Button></>}
  </>
}
/**
 * Opens the custom-exercise form; saving creates or updates the exercise.
 *
 * @param {CustomExercise | null | undefined} existing Exercise being edited, if any.
 * @param {Function} onDone Called with the saved exercise.
 * @param {string} prefill Initial name for a new exercise.
 */
export const customExSheet = (existing, onDone, prefill) => ui().openSheet(close => <CustomExForm existing={existing} prefill={prefill} onDone={onDone} close={close} />)
/**
 * Confirms then deletes a custom exercise from routines and catalogue.
 *
 * @param {CustomExercise} ex Custom exercise to delete.
 * @param {Function} afterDelete Runs after deletion.
 */
export function deleteCustomEx(ex, afterDelete) {
  if (S().active?.entries.some(e => e.id === ex.id)) { toast(t('Finish your current workout first')); return }
  let res = null
  confirmSheet({
    title: t('Delete “{0}”?', ex.n),
    message: t('It will be removed from your routines. Already-logged workouts keep their sets.'),
    confirmText: t('Delete'), danger: true,
    onConfirm: () => {
      update(s => { res = catalogueWrites.deleteCustomEx(s, ex) })
      if (!res.ok) { toast(t('Finish your current workout first')); return }
      toast(t('Exercise deleted'))
      if (afterDelete) afterDelete()
    }
  })
}
