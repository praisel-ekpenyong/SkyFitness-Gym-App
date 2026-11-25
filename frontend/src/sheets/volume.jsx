import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { Button, Segmented, Stepper, Section, Row } from '../components/ui.jsx'
import { MUSCLE_NAME } from '../lib/muscles.js'
import {
  STYLE_RANGES, TRAINING_STYLES, RANGED_MUSCLES, RANGE_MAX, trainingStyleOf, volumeRangeOf, validRangeEdit, hasRangeEdits,
  lowPinned, setVolumeRange, clearVolumeRanges, switchTrainingStyle, trainingStyleName,
} from '../lib/volume-ranges.js'
import { confirmSheet } from './confirm.jsx'

const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()

/**
 * One muscle's volume range on top of the training style. A pinned muscle offers only its high end.
 *
 * @param {string} slug Ranged muscle slug.
 * @param {Function} close Closes the sheet.
 */
export function RangeEditSheet({ slug, close }) {
  const st = useStore(s => s.S)
  const style = trainingStyleOf(st)
  const styleRange = STYLE_RANGES[style][slug]
  const { range, edited } = volumeRangeOf(st, slug)
  const pinned = lowPinned(slug)
  const [low, setLow] = useState(range[0])
  const [high, setHigh] = useState(range[1])
  const capped = v => (v == null ? v : Math.min(RANGE_MAX, v))
  const valid = validRangeEdit(slug, [low, high])
  const save = () => {
    if (!valid) return
    update(s => setVolumeRange(s, slug, valid))
    close()
  }
  const useStyle = () => {
    update(s => setVolumeRange(s, slug, styleRange))
    close()
  }
  return <>
    <h3>{t(MUSCLE_NAME[slug])}</h3>
    <div className="sheet-sub">{t('Effective sets a week. The {0} style gives {1} to {2}.', trainingStyleName(style), styleRange[0], styleRange[1])}</div>
    <div className="row cfgrow">
      {!pinned && <Stepper label={t('Low end')} value={low} step={1} decimal={false} onChange={v => setLow(capped(v))} />}
      <Stepper label={t('High end')} value={high} step={1} decimal={false} onChange={v => setHigh(capped(v))} />
    </div>
    <div className="small dim cfg-note">{pinned
      ? t('Whole numbers from 0 to {0}. The low end stays at 0: pressing covers front delts.', RANGE_MAX)
      : t('Whole numbers from 0 to {0}, with the low end no higher than the high end.', RANGE_MAX)}</div>
    <Button variant="primary" onClick={save} disabled={!valid}>{t('Save')}</Button>
    {edited && <><div className="gap8" /><Button variant="ghost" onClick={useStyle}>{t('Use style range')}</Button></>}
  </>
}

/**
 * Training style and per-muscle volume ranges, opened from the weekly volume card.
 */
function VolumeRangesSheet() {
  const st = useStore(s => s.S)
  const style = trainingStyleOf(st)
  const edits = hasRangeEdits(st)
  const pickStyle = next => {
    if (next === style) return
    if (!edits) { update(s => switchTrainingStyle(s, next)); return }
    confirmSheet({
      title: t('Switch to {0}?', trainingStyleName(next)),
      message: t('Switching style clears your edited volume ranges.'),
      confirmText: t('Switch style'),
      onConfirm: () => update(s => switchTrainingStyle(s, next)),
    })
  }
  return <>
    <h3>{t('Volume ranges')}</h3>
    <div className="sheet-sub">{t('Effective sets a week each muscle is aimed at. The training style sets every range; tap a muscle to change its own.')}</div>
    <Segmented className="seg-range" label={t('Training style')} value={style} onChange={pickStyle}
      options={TRAINING_STYLES.map(v => ({ value: v, label: trainingStyleName(v) }))} />
    <Section title={t('Muscles')} footer={t('Defaults follow Schoenfeld’s research: about 4 hard sets a week is enough to grow, and 10 to 20 brings most of the growth. The Pelland et al. meta-regression finds gains keep rising with more sets, at a slowing rate. Strength needs less. No studies count side or rear delts alone, so those ranges are a judgement call.')}>
      {RANGED_MUSCLES.map(slug => {
        const { range, edited } = volumeRangeOf(st, slug)
        return <Row key={slug} title={t(MUSCLE_NAME[slug])} value={t('{0} to {1}', range[0], range[1])} accessory="chevron"
          onClick={() => ui().openSheet(close => <RangeEditSheet slug={slug} close={close} />)}>
          {edited && <span className="tag">{t('edited')}</span>}
        </Row>
      })}
    </Section>
    {edits && <><div className="gap8" /><Button variant="ghost" onClick={() => update(clearVolumeRanges)}>{t('Back to the style’s ranges')}</Button></>}
  </>
}
/** Opens the training style and volume range editor. */
export const volumeRangesSheet = () => ui().openSheet(() => <VolumeRangesSheet />)
