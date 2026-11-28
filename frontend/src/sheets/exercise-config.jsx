import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { isCardio, isBodyweightEq } from '../lib/exercises.js'
import { fmtNum } from '../lib/format.js'
import { defaultConfig, modeOf, isBw, isPerSide, sideReps, ownRest, REST_CHOICES, ROW_DEFAULTS, pickTargetFields } from '../lib/workout-model.js'
import { t } from '../lib/i18n.js'
import Media from '../components/Media.jsx'
import { Button, Switch, Segmented, SelectRow, Row, TextArea, Stepper } from '../components/ui.jsx'
import { primaryMuscleName } from '../lib/muscles.js'
import { policyFor, defaultIncrement, POLICIES_FOR, POLICY_NAME, POLICY_DESC, MAX_BW_SETS } from '../lib/progression.js'
import { confirmSheet } from './confirm.jsx'
import { customExSheet } from './custom-exercise.jsx'
import { ui } from './store-helpers.js'

/** @typedef {import('../lib/types.js').CustomExercise} CustomExercise */
/** @typedef {import('../lib/types.js').Target} Target */
/** @typedef {import('../lib/types.js').Routine} Routine */

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
      {active === 'double' && <Stepper label={t('Reps from')} value={c.repsMin || Math.max(1, (c.reps || ROW_DEFAULTS.reps.reps) - 2)}
        step={1} decimal={false} onChange={v => setC(x => ({ ...x, repsMin: v }))} />}
    </div>}
  </>
}

/** The exercise's Rest duration: Default follows the Profile's, as Settings sets it. */
function RestRow({ c, setC, profileRest }) {
  const own = ownRest(c)
  const choices = own == null || REST_CHOICES.includes(own) ? REST_CHOICES : [...REST_CHOICES, own].sort((a, b) => a - b)
  return <SelectRow icon="timer" title={t('Rest duration')} value={own ?? ''} onChange={v => setC(x => ({ ...x, rest: v || undefined }))}
    options={[{ value: '', label: t('Default ({0})', t('{0}s', profileRest)) }, ...choices.map(v => ({ value: v, label: t('{0}s', v) }))]} />
}

/**
 * The number in a field, or null when the field holds none.
 * @param {unknown} v
 * @returns {number | null}
 */
const typedNumber = v => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)
/**
 * A count shown on screen: a 0 saves as 1, the nearest valid value; only a missing one takes `fallback`.
 * @param {unknown} v
 * @param {number} fallback
 * @returns {number}
 */
const countOr = (v, fallback) => { const n = typedNumber(v); return n === null ? fallback : Math.max(1, Math.round(n)) }

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
    const sets = countOr(c.sets, cardio ? 1 : 3)
    const typed = countOr(c.reps, ROW_DEFAULTS.reps.reps)
    const reps = perSide ? Math.ceil(typed / 2) * 2 : typed
    const weight = Math.max(0, c.weight || 0)
    const double = mode === 'reps' && policyFor({ ...c, id: ex.id }, routine, 'reps') === 'double'
    const trimmedNotes = typeof c.notes === 'string' ? c.notes.trim().slice(0, 500) : ''
    onSave(pickTargetFields({
      sets,
      mode: cardio ? undefined : mode,
      min: countOr(c.min, ROW_DEFAULTS.cardio.min),
      speed: Math.max(0, typedNumber(c.speed) ?? ROW_DEFAULTS.cardio.speed),
      sec: countOr(c.sec, ROW_DEFAULTS.time.sec),
      reps,
      weight,
      side: perSide || undefined,
      bodyweight: !cardio && bw !== isBodyweightEq(ex.id) ? bw : undefined,
      prog: c.prog || undefined,
      inc: c.inc > 0 ? c.inc : undefined,
      repsMin: double ? Math.min(reps, Math.max(1, Math.round(c.repsMin) || Math.max(1, reps - 2))) : undefined,
      repsMax: bw && !(weight > 0) && c.repsMax > 0 ? Math.max(reps, Math.round(c.repsMax)) : undefined,
      rest: ownRest(c),
      notes: trimmedNotes || undefined,
    }, mode))
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
    <div className="sect-b cfg-note-sm">
      <RestRow c={c} setC={setC} profileRest={st.restSec} />
      {!cardio && <Row icon="figureStrength" title={t('Bodyweight')}
        subtitle={bw ? t('No weight to enter — just log the reps.') : t('Ask for a weight on every set.')}>
        <Switch checked={bw} label={t('Bodyweight')} onChange={v => setC(x => ({ ...x, bodyweight: v, weight: v ? 0 : x.weight }))} />
      </Row>}
      {!cardio && mode === 'reps' && <Row icon="shuffle" title={t('Reps per side')}
        subtitle={perSide ? t('You still log the total: {0} is {1} per side.', c.reps || 0, fmtNum(sideReps(c.reps))) : t('For lunges, single-arm rows and the like.')}>
        <Switch checked={perSide} label={t('Reps per side')} onChange={v => setC(x => ({ ...x, side: v || undefined, reps: v ? Math.ceil((x.reps || 0) / 2) * 2 : x.reps }))} />
      </Row>}
    </div>
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
    {onDelete && <><div className="gap8" /><Button variant="danger" onClick={() => confirmSheet({
      title: t('Remove {0}?', ex.n),
      message: t('This removes the exercise from the routine.'),
      confirmText: t('Remove'),
      danger: true,
      onConfirm: () => { close(); onDelete() },
    })}>{t('Remove from routine')}</Button></>}
  </>
}
/**
 * Options for `exConfigSheet`.
 * @typedef {Object} ExConfigOptions
 * @property {Target} [existing] - The Routine Entry being edited; omit for a new one.
 * @property {Function} [onSave] - Called with the chosen configuration.
 * @property {Function} [onDelete] - Shows a Remove action when given.
 * @property {Routine} [routine] - The Routine the Entry belongs to, for its progression policy.
 * @property {Partial<Target>} [initial] - Seed values for a new Entry.
 * @property {Function} [onReplace] - Shows a Replace action when given.
 * @property {string} [actionLabel] - Overrides the save button's label.
 */
/**
 * Opens the exercise configuration sheet.
 * @param {CustomExercise} ex - The exercise being configured.
 * @param {ExConfigOptions} [options]
 */
export const exConfigSheet = (ex, { existing, onSave, onDelete, routine, initial, onReplace, actionLabel } = {}) => ui().openSheet(close => <ExConfig ex={ex} existing={existing} initial={initial} onSave={onSave} onDelete={onDelete} routine={routine} onReplace={onReplace} actionLabel={actionLabel} close={close} />)
