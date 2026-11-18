import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXIDX } from '../lib/exercises.js'
import { fmtNum, fmtSigned, fmtVol, fmtDur, durPart } from '../lib/format.js'
import { fmtDate, todayISO, MONTHS_LONG, monthKey, weekKey, isoOf } from '../lib/dates.js'
import { setLabel } from '../lib/set-label.js'
import { effectiveRoutineId, hasEffectiveOverride, deleteWorkout } from '../lib/history.js'
import { loadRecords } from '../lib/training-log.js'
import { workoutSummary, summarizeWorkouts } from '../lib/workout-summary.js'
import { dayStatus } from '../lib/schedule.js'
import { monthRecap } from '../lib/recap.js'
import { streakOf } from '../lib/streak.js'
import {
  weekExplanation,
  markLabel,
  markIcon,
  freezeLine,
  rulePreviewLine,
  ruleSegmentPreview,
  RULE_ORDER,
  RULE_NAME,
} from '../lib/streak-explain.js'
import { loadOfWorkouts, MUSCLE_NAME } from '../lib/muscles.js'
import { glyphOf } from '../lib/glyphs.js'
import { Thumb } from '../components/Media.jsx'
import Icon, { ICON_NAMES } from '../components/Icon.jsx'
import { Button, Segmented } from '../components/ui.jsx'
import BodyMap from '../components/BodyMap.jsx'
import { SessionMuscleDistribution } from '../components/SessionMuscleDistribution.jsx'
import { t } from '../lib/i18n.js'
import { confirmSheet } from './confirm.jsx'
import { dayOverrideSheet } from './schedule.jsx'

const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)

/**
 * Completed-workout detail sheet body with per-exercise set labels and delete.
 *
 * @param {Object} w - Completed workout entity from `S.workouts`.
 * @param {Function} close - Sheet closer.
 */
export function WorkoutDetail({ w, close }) {
  const st = useStore(s => s.S)
  const [selectedMuscle, setSelectedMuscle] = useState(null)
  const workoutLoad = loadOfWorkouts([w])
  const recordIds = loadRecords(st, w).map(r => r.id)
  const sum = workoutSummary(st, w)
  return (
    <>
      <h3>{w.name}</h3>
      <div className="sheet-sub">
        {[fmtDate(w.d, true), ...durPart(sum.durationMs), fmtVol(sum.tonnage, st.unit), ...(w.bw ? [fmtNum(w.bw) + ' ' + st.unit] : [])].join(' · ')}
      </div>
      {w.entries.map((e, i) => {
        const ex = EXIDX[e.id]
        return (
          <div key={i} className="row ex-entry">
            {ex && <Thumb ex={ex} />}
            <div className="grow">
              <div className="tt capitalize">
                {ex ? ex.n : (e.n || e.id)} {recordIds.includes(e.id) && <span className="pr"><Icon name="trophy" />{t('Record')}</span>}
              </div>
              <div className="ss">
                {e.sets.filter(s => s.done).map(s => setLabel(e.id, s, e.target)).join('  ·  ') || t('no sets')}
              </div>
              {e.notes && <div className="exnote">{e.notes}</div>}
            </div>
          </div>
        )
      })}
      <div className="workout-detail-distribution detail-map">
        <BodyMap
          className="tappable compact"
          load={workoutLoad}
          body={st.body}
          selected={selectedMuscle}
          onMuscle={m => setSelectedMuscle(s => s === m ? null : m)}
          getA11yLabel={slug => {
            const val = workoutLoad[slug]
            const name = t(MUSCLE_NAME[slug] || slug)
            if (!val) return t('{0}, {1}', name, t('not trained'))
            const setsText = t('{0} effective sets', Number.isInteger(val) ? `${val}.0` : fmtNum(val))
            return t('{0}, {1}', name, setsText)
          }}
        />
        <div className="gap12" />
        <SessionMuscleDistribution
          workout={w}
          selectedMuscle={selectedMuscle}
          onSelectMuscle={m => setSelectedMuscle(s => s === m ? null : m)}
        />
      </div>
      <Button
        variant="danger"
        onClick={() => confirmSheet({
          title: t('Delete workout?'),
          message: t('This removes it from your history for good.'),
          confirmText: t('Delete'),
          danger: true,
          onConfirm: () => {
            update(s => { deleteWorkout(s, w.id) })
            close()
            toast(t('Workout deleted'))
          },
        })}
      >
        {t('Delete workout')}
      </Button>
    </>
  )
}
export const workoutDetailSheet = w => ui().openSheet(close => <WorkoutDetail w={w} close={close} />)

export function Calendar({ start, close }) {
  const st = useStore(s => s.S)
  const [cur, setCur] = useState(() => { const d = start ? new Date(start) : new Date(); d.setDate(1); return d })
  const [sel, setSel] = useState(null)
  // A new month shows new weeks, so the selected week and its explanation go with the old one.
  const goMonth = d => { setCur(d); setSel(null) }
  const streak = streakOf(st)
  const y = cur.getFullYear(), mo = cur.getMonth()
  const byDay = {}
  st.workouts.forEach(w => (byDay[w.d] = byDay[w.d] || []).push(w))
  const startOffset = (new Date(y, mo, 1).getDay() + 6) % 7
  const daysIn = new Date(y, mo + 1, 0).getDate()
  const monthWs = st.workouts.filter(w => w.d.startsWith(y + '-' + String(mo + 1).padStart(2, '0')))
  const month = summarizeWorkouts(st, monthWs)
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(<div key={'e' + i} />)
  for (let d = 1; d <= daysIn; d++) {
    const iso = y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0')
    const ws = byDay[iso], effId = effectiveRoutineId(st, iso), ovr = hasEffectiveOverride(st, iso)
    const dotCls = dayStatus({ trained: ws, effId, ovr })
    cells.push(
      <button
        key={d}
        className={'cal-d' + (ws ? ' has' : '') + (iso === todayISO() ? ' today' : '')}
        onClick={() => {
          if (!ws) { close(); dayOverrideSheet(iso); return }
          if (ws.length === 1) { close(); workoutDetailSheet(ws[0]); return }
          close()
          ui().openSheet(c2 => (
            <>
              <h3>{fmtDate(iso, true)}</h3>
              <div className="list">
                {ws.map(w => <WorkoutRow key={w.id} w={w} onClick={() => { c2(); workoutDetailSheet(w) }} />)}
              </div>
            </>
          ))
        }}
      >
        <span>{d}</span><i className={dotCls} />
      </button>
    )
  }
  // One row per Monday-first week: seven day cells, then the week's mark (or a gap when it has none).
  const padded = [...cells]
  while (padded.length % 7) padded.push(<div key={'p' + padded.length} />)
  const rows = []
  for (let r = 0; r < padded.length / 7; r++) {
    const monday = new Date(y, mo, 1 - startOffset + r * 7, 12)
    const mondayIso = isoOf(monday)
    const wk = weekKey(mondayIso)
    const rec = streak.weeks[wk]
    const word = rec?.state
    rows.push(
      ...padded.slice(r * 7, r * 7 + 7),
      rec
        ? (
          <button
            key={'m' + r}
            type="button"
            className={'cal-mark ' + word + (sel === wk ? ' on' : '')}
            aria-label={markLabel(fmtDate(mondayIso), word)}
            aria-pressed={sel === wk}
            onClick={() => setSel(wk)}
          >
            {markIcon(word) && <Icon name={markIcon(word)} />}
          </button>
        )
        : <span key={'m' + r} className="cal-mark-gap" />
    )
  }
  const selected = sel ? streak.weeks[sel] : null
  return (
    <>
      <div className="row between sheet-head">
        <button className="iconbtn" onClick={() => goMonth(new Date(y, mo - 1, 1))} aria-label={t('Previous month')}><Icon name="chevronLeft" /></button>
        <h3>{t(MONTHS_LONG[mo])} {y}</h3>
        <button className="iconbtn" onClick={() => goMonth(new Date(y, mo + 1, 1))} aria-label={t('Next month')}><Icon name="chevronRight" /></button>
      </div>
      <div className="small cal-streak">
        <span>{t(streak.current === 1 ? 'Streak {0} week' : 'Streak {0} weeks', fmtNum(streak.current))}</span>
        <span>{t(streak.best === 1 ? 'Best {0} week' : 'Best {0} weeks', fmtNum(streak.best))}</span>
        <span>{t(streak.freezes === 1 ? '{0} freeze banked' : '{0} freezes banked', fmtNum(streak.freezes))}</span>
        <span className="cal-next">{freezeLine(streak)}</span>
      </div>
      <Segmented
        className="cal-rule"
        label={t('Freeze rule')}
        value={streak.rule}
        options={RULE_ORDER.map(v => ({ value: v, label: t(RULE_NAME[v]), sub: ruleSegmentPreview(streak.preview[v]), ariaLabel: rulePreviewLine(v, streak.preview[v]) }))}
        onChange={v => update(s => { s.streakRule = v })}
      />
      <div className="small muted cal-sum">
        {monthWs.length
          ? `${t(monthWs.length === 1 ? '{0} workout' : '{0} workouts', fmtNum(monthWs.length))} · ${fmtDur(month.durationMs)} · ${fmtVol(month.tonnage, st.unit)}`
          : t('No workouts this month')}
      </div>
      <div className="cal-grid">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(l => <div key={l} className="cal-h">{t(l)}</div>)}
        <div className="cal-h" aria-hidden="true" />
        {rows}
      </div>
      <p className="small cal-explain" aria-live="polite">{selected ? weekExplanation(selected, streak.rule) : ''}</p>
      <div className="cal-legend">
        <span><i style={{ background: 'var(--data)' }} />{t('Trained')}</span>
        <span><i style={{ background: 'var(--label-3)' }} />{t('Planned')}</span>
        <span><i style={{ background: 'var(--label-2)' }} />{t('Rescheduled')}</span>
      </div>
      <div className="small dim cal-sum note">{t('Tap a trained day for details · tap any other day to plan a session')}</div>
    </>
  )
}
/** Opens the monthly calendar sheet starting at the given date. */
export const calendarSheet = start => ui().openSheet(close => <Calendar start={start} close={close} />)

export function RecapSheet({ start, close }) {
  const st = useStore(s => s.S)
  const [cur, setCur] = useState(() => {
    const d = start ? new Date(monthKey(start) + '-01T12:00:00') : new Date()
    d.setDate(1)
    return d
  })
  const y = cur.getFullYear(), mo = cur.getMonth()
  const ym = y + '-' + String(mo + 1).padStart(2, '0')
  const isCurrent = ym === monthKey(todayISO())
  const rec = monthRecap(st, ym)
  const viewedEmpty = rec.workouts === 0

  const deltaBadge = (key) => {
    if (isCurrent) return null
    const v = rec.deltas?.[key]
    if (v == null) return null
    const prevVal = rec.prev?.[key]
    const isAbs = prevVal === 0 || prevVal == null
    let label = ''
    if (isAbs) {
      if (key === 'vol') label = fmtSigned(v, n => fmtVol(n, st.unit))
      else if (key === 'durationMs') label = v ? fmtSigned(v, fmtDur) : '—'
      else label = fmtSigned(v)
    } else {
      label = fmtSigned(Math.round(v), n => fmtNum(n) + '%')
    }
    const color = v > 0 ? 'var(--acc-text)' : v < 0 ? 'var(--red-text)' : 'var(--label-2)'
    return <span className="delta-pill" style={{ color }}>{label}</span>
  }

  const MetricRow = ({ label, value, deltaKey }) => (
    <div className="lrow">
      <div className="lrow-m"><div className="lrow-t">{label}</div></div>
      <div className="recap-v">
        <span className="recap-n">{value}</span>
        {deltaBadge(deltaKey)}
      </div>
    </div>
  )

  return (
    <>
      <div className="row between sheet-head">
        <button className="iconbtn" onClick={() => setCur(new Date(y, mo - 1, 1))} aria-label={t('Previous month')}><Icon name="chevronLeft" /></button>
        <h3>{isCurrent ? t('{0} {1} so far', t(MONTHS_LONG[mo]), y) : t('{0} {1}', t(MONTHS_LONG[mo]), y)}</h3>
        <button className="iconbtn" onClick={() => setCur(new Date(y, mo + 1, 1))} aria-label={t('Next month')}><Icon name="chevronRight" /></button>
      </div>
      {viewedEmpty && (
        <div className="small muted cal-sum recap-empty">{t('No workouts in {0}', `${t(MONTHS_LONG[mo])} ${y}`)}</div>
      )}
      <div className="sect-b">
        <MetricRow label={t('Workouts')} value={fmtNum(rec.workouts)} deltaKey="workouts" />
        <MetricRow label={t('Time trained')} value={rec.durationMs ? fmtDur(rec.durationMs) : '—'} deltaKey="durationMs" />
        <MetricRow label={t('Volume')} value={fmtVol(rec.vol, st.unit)} deltaKey="vol" />
        <MetricRow label={t('Sets')} value={fmtNum(rec.sets)} deltaKey="sets" />
      </div>
      {(rec.prs.length > 0 || rec.e1prs.length > 0) && (
        <div>
          {rec.prs.length > 0 && (
            <>
              <h4 className="sec"><Icon name="trophy" />{t('Records')}</h4>
              <div className="sect-b">
                {rec.prs.map(id => {
                  const name = EXIDX[id]?.n || id
                  return <div key={id} className="lrow"><div className="lrow-m"><div className="lrow-t capitalize">{name}</div></div></div>
                })}
              </div>
            </>
          )}
          {rec.e1prs.length > 0 && (
            <>
              <h4 className="sec"><Icon name="chartLine" />{t('Estimated 1RM records')}</h4>
              <div className="sect-b">
                {rec.e1prs.map((p, i) => {
                  const name = EXIDX[p.id]?.n || p.id
                  return (
                    <div key={p.id + '-' + i} className="lrow">
                      <div className="lrow-m"><div className="lrow-t capitalize">{name}</div><div className="lrow-s nocap">{fmtNum(p.est)} {st.unit} · {fmtNum(p.w)} × {p.r}</div></div>
                      <div className="lrow-v nocap">{fmtDate(p.d, true)}</div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
      {rec.prs.length === 0 && rec.e1prs.length === 0 && !viewedEmpty && (
        <div className="small muted cal-sum note">{t('No records this month')}</div>
      )}
      <div className="more-row">
        <Button variant="ghost" size="sm" trailingIcon="calendar" onClick={() => { close(); calendarSheet(ym + '-01') }}>{t('View calendar')}</Button>
      </div>
    </>
  )
}
/**
 * Opens the monthly recap sheet.
 *
 * @param {string} start Any date in the month to show.
 */
export const recapSheet = (start) => ui().openSheet(close => <RecapSheet start={start} close={close} />)

export function WorkoutRow({ w, onClick }) {
  const st = useStore(s => s.S)
  const glyph = glyphOf((st.routines.find(r => r.id === w.routineId) || {}).emoji, ICON_NAMES)
  const recordCount = loadRecords(st, w).length
  const sum = workoutSummary(st, w)
  return (
    <div
      className="item"
      role="button"
      tabIndex={0}
      aria-label={t('{0}, {1}, {2}', w.name, fmtDate(w.d, true), t('{0} sets', fmtNum(sum.workSets)))}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick && onClick() } }}
    >
      <span className="lrow-i"><Icon name={glyph} /></span>
      <div className="grow">
        <div className="tt">{w.name}</div>
        <div className="ss">
          {[fmtDate(w.d, true), ...durPart(sum.durationMs), t('{0} sets', fmtNum(sum.workSets)), fmtVol(sum.tonnage, st.unit)].join(' · ')}
        </div>
      </div>
      {recordCount > 0 && <span className="pr"><Icon name="trophy" />{t(recordCount === 1 ? '{0} record' : '{0} records', fmtNum(recordCount))}</span>}
      <Icon name="chevronRight" className="chev" />
    </div>
  )
}
