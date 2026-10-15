import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { selectStatsOverview, selectExerciseStats } from '../lib/stats-selectors.js'
import { fmtNum, fmtDate, todayISO, setLabel } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { bwSheet, goalSheet, calendarSheet, recapSheet, workoutDetailSheet, WorkoutRow, bwDeltaColor } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Heatmap from '../components/Heatmap.jsx'
import Icon from '../components/Icon.jsx'
import BodyMap, { BodyMapLegend } from '../components/BodyMap.jsx'
import { MUSCLE_NAME } from '../lib/muscles.js'
import { STRENGTH_FLOOR } from '../lib/recovery.js'
import { FATIGUE_LEVELS } from '../lib/recovery-view.js'
import { Button, Segmented, SelectRow } from '../components/ui.jsx'

export { FATIGUE_LEVELS }

export const STRENGTH_LEVELS = [
  { at: STRENGTH_FLOOR, level: 0 },
  { at: 0.625, level: 1 },
  { at: 0.75, level: 2 },
  { at: 0.875, level: 3 },
  { at: 1, level: 4 },
]

/** Returns the current time, ticking once a minute. */
function useNow() {
  // A shared minute tick keeps every chart on the same snapshot and avoids
  // rescanning history when only a display selection changes.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(iv)
  }, [])
  return now
}

/** Legend for the fatigue body map. */
function FatigueLegend() {
  return <div className="hm-legend hm-fatigue" aria-label={t('Fatigue')}>
    <span>{t('Fatigued')}</span><div className="hm-c l4" />
    <span>{t('Recovering')}</span><div className="hm-c l2" />
    <span>{t('Ready')}</span><div className="hm-c l0" />
  </div>
}

/** Legend for the strength body map. */
function StrengthLegend() {
  return <div className="hm-legend hm-strength" aria-label={t('Strength')}>
    <span>1 <span className="dim">{t('full')}</span></span><div className="hm-c l4" /><div className="hm-c l3" /><div className="hm-c l2" />
    <div className="hm-c l1" /><div className="hm-c l0" /><span>{fmtNum(STRENGTH_FLOOR)} <span className="dim">{t('floor')}</span></span>
  </div>
}

/** Localized label for the selector's semantic Fatigue state. */
function fatigueLabel(state) {
  return t(state === 'ready' ? 'Ready' : state === 'recovering' ? 'Recovering' : 'Fatigued')
}

/**
 * Muscle-balance card with balance, fatigue, and strength views.
 *
 * @param {Object} S Store state.
 */
function MuscleBalance({ S, overview, win, setWin, setHard }) {
  const [view, setView] = useState('balance')
  const [sel, setSel] = useState(null)
  const { load, rated, hardActive: on, worked, missed, top, max, count } = overview.muscles
  const fatigue = overview.fatigue.values
  const strength = overview.strength.values
  const { volume90: vol90, detrained, weeks } = overview.strength
  const muscleExercises = useMemo(() => sel ? overview.exercisesFor(sel) : [], [overview, sel])
  const strengthHint = slug => weeks[slug] == null ? t('not trained') : t('Weeks since training: {0}', weeks[slug])
  const toggleSel = m => setSel(s => (s === m ? null : m))

  return <div className="card">
    <Segmented className="seg-range" label={t('Muscle view')} value={view} onChange={setView}
      options={[{ value: 'balance', label: t('Muscle balance') }, { value: 'fatigue', label: t('Fatigue') }, { value: 'strength', label: t('Strength') }]} />
    {view === 'balance' ? <>
      <div className="card-head">
        <h2 style={{ margin: 0 }}>{t('Muscle balance')} <span className="card-sub">· {on ? t('by hard sets') : t('by sets worked')}</span></h2>
        {rated && <Button size="sm" icon="flame" style={on ? { color: 'var(--yellow)' } : undefined}
          onClick={() => { setHard(h => !h); setSel(null) }}>{on ? t('Hard') : t('All')}</Button>}
      </div>
      <Segmented className="seg-range" label={t('Time window')} value={win} onChange={v => { setWin(v); setSel(null) }}
        options={[{ value: 7, label: t('Week') }, { value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 0, label: t('All') }]} />
      {count ? <>
        <BodyMap className="tappable" load={load} body={S.body} selected={sel}
          onMuscle={m => setSel(s => (s === m ? null : m))} />
        <BodyMapLegend />
        {sel && <div className="muscle-inspector">
          <div className="muscle-inspector-info">
            <div className="muscle-inspector-name"><b>{t(MUSCLE_NAME[sel])}</b></div>
            <div className="muscle-inspector-val">{load[sel] ? t('{0} sets', load[sel]) : on ? t('no hard sets') : t('not trained')}</div>
          </div>
          <Button size="xs" variant="ghost" icon="xmark" onClick={() => setSel(null)}>{t('Clear')}</Button>
        </div>}
        {!sel && top.map(m => <div key={m} className="mrow">
          <span className="nm">{t(MUSCLE_NAME[m])}</span>
          <span className="bar"><i style={{ width: Math.round(load[m] / max * 100) + '%', background: on ? 'var(--yellow)' : undefined }} /></span>
          <span className="v">{t('{0} sets', load[m])}</span>
        </div>)}
        {missed.length > 0 && <div className="missed-banner">
          <div className="missed-banner-title"><Icon name="alert" /><span>{on ? t('No hard sets in this period') : t('Not trained in this period')}</span></div>
          <div className="mchips">{missed.map(m => <span key={m} className="mchip miss">{t(MUSCLE_NAME[m])}</span>)}</div>
        </div>}
        {!missed.length && worked.length > 0 &&
          <div className="muted small" style={{ marginTop: 10 }}>{on
            ? t('Every muscle group got at least one hard set in this period.')
            : t('Every muscle group got some work in this period.')}</div>}
      </> : <div className="muted small">{t('No workouts in this period yet.')}</div>}
    </> : view === 'fatigue' ? <>
      <div className="card-head">
        <h2>{t('Fatigue')}</h2>
      </div>
      <BodyMap className="tappable hm-fatigue" load={fatigue} thresholds={FATIGUE_LEVELS} body={S.body} selected={sel} onMuscle={toggleSel} />
      <FatigueLegend />
      <div className="muted small" style={{ marginTop: 10 }}>{t('Fatigue shows how recently each muscle was trained. High means rest.')}</div>
      {sel && <div className="muscle-inspector fatigue">
        <div className="muscle-inspector-info">
          <div className="muscle-inspector-name"><b>{t(MUSCLE_NAME[sel])}</b></div>
          <div className="muscle-inspector-val">{fatigueLabel(overview.fatigue.states[sel])}</div>
        </div>
        <Button size="xs" variant="ghost" icon="xmark" onClick={() => setSel(null)}>{t('Clear')}</Button>
      </div>}
    </> : <>
      <div className="card-head">
        <h2>{t('Strength')}</h2>
      </div>
      <BodyMap className="tappable hm-strength" load={strength} thresholds={STRENGTH_LEVELS} body={S.body} selected={sel} onMuscle={toggleSel} />
      <StrengthLegend />
      <div className="muted small" style={{ marginTop: 10 }}>{t('Strength shows retained muscle strength. Train again to reset it.')}</div>
      {sel && <>
        <div className="row between" style={{ marginTop: 14, marginBottom: 6 }}>
          <h4 className="sec" style={{ margin: 0 }}>{t('Exercises')} · {t(MUSCLE_NAME[sel])}</h4>
          <Button size="xs" variant="ghost" icon="xmark" onClick={() => setSel(null)}>{t('Clear')}</Button>
        </div>
        <div className="small dim" style={{ marginBottom: 10 }}>{strengthHint(sel)}</div>
        {muscleExercises.length ? muscleExercises.map(row => (
          <div key={row.id} className="strength-exercise-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name}
                </span>
                <span className="tag" style={{ fontSize: 11, padding: '1px 6px' }}>
                  {row.primary === sel ? t('primary') : t('secondary')}
                </span>
              </div>
              <div className="small dim" style={{ marginTop: 2 }}>
                {t('Est. 1RM')}: {fmtNum(row.est)} {S.unit} · {fmtDate(row.estDate, true)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
              <span className="bar" style={{ width: 64, height: 6, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}>
                <i style={{ display: 'block', height: '100%', width: '100%', background: 'linear-gradient(to right, var(--acc) ' + Math.round(row.decay * 100) + '%, var(--surface-2) ' + Math.round(row.decay * 100) + '%)' }} />
              </span>
              <span className="v" style={{ fontSize: 13, fontWeight: 600, color: 'var(--label)', minWidth: 62, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmtNum(row.current)} {S.unit} <span className="dim" style={{ fontWeight: 400, fontSize: 11 }}>· {Math.round(row.decay * 100)}%</span>
              </span>
            </div>
          </div>
        )) : <div className="muted small">{t('No exercises with an estimated 1RM yet.')}</div>}
      </>}
      {!sel && <div className="muted small" style={{ marginTop: 10 }}>{t('Tap a muscle to see its exercises.')}</div>}
      {detrained.map(slug => <div key={slug} className="mrow">
        <span className="nm">{t(MUSCLE_NAME[slug])}</span>
        <span className="bar"><i style={{ width: Math.round(strength[slug] * 100) + '%' }} /></span>
        <span className="v">{t('{0} sets', vol90[slug] || 0)}</span>
      </div>)}
    </>}
  </div>
}


function EffortCard({ overview, win, setWin }) {
  const kind = overview.scale
  const hd = overview.scaleName
  const sum = overview.effort
  const pts = (sum?.weeks || []).map(w => ({ ...w, note: t('{0} sets', w.sets) }))
  const binLabel = b => b.tail ? (kind === 'rpe' ? '≤ ' + fmtNum(b.value) : fmtNum(b.value) + '+') : fmtNum(b.value)

  return <div className="card">
    <div className="card-head">
      <h2><Icon name="gauge" style={{ fontSize: 16, color: 'var(--yellow)' }} />{t('Effort')} <span className="card-sub">· {t('how close to failure')}</span></h2>
    </div>
    <Segmented className="seg-range" label={t('Time window')} value={win} onChange={setWin}
      options={[{ value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
    {sum == null ? <div className="muted small">{t('No rated sets in this period.')}</div> : <>
      <div className="effort-stats-grid">
        <div className="effort-stat-box">
          <div className="num">{sum.avg == null ? '—' : fmtNum(sum.avg) + ' ' + hd}</div>
          <div className="lbl">{t('average effort')}</div>
        </div>
        <div className="effort-stat-box">
          <div className="num accent">{sum.hardPct == null ? '—' : Math.round(sum.hardPct * 100) + '%'}</div>
          <div className="lbl">{t('at {0} {1} or harder', hd, fmtNum(sum.hardThreshold))}</div>
        </div>
      </div>
      <div className="small dim" style={{ marginTop: 6 }}>{t('{0} of {1} finished sets rated', sum.rated, sum.done)}</div>
      {!overview.effortEnabled && <div className="small" style={{ color: 'var(--yellow)', margin: '6px 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="gear" style={{ fontSize: 14 }} />
        <span>{t('Effort per set is switched off — turn it on in Settings to keep rating.')}</span>
      </div>}
      {pts.length > 1 && <>
        <h4 className="sec" style={{ marginTop: 14 }}>{t('Week by week')}</h4>
        <div className="chart"><LineChart points={pts} h={140} unit={hd} color="var(--yellow)" invert={kind === 'rir'} /></div>
      </>}
      <h4 className="sec" style={{ marginTop: 14 }}>{t('Where the sets land')}</h4>
      {sum.histogram.map(b => <div key={b.rir} className="mrow">
        <span className="nm">{hd} {binLabel(b)}</span>
        <span className="bar"><i style={{ width: b.width + '%', background: b.hard ? 'var(--yellow)' : 'var(--label-3)' }} /></span>
        <span className="v">{b.n ? b.n + ' · ' + b.percent + '%' : '—'}</span>
      </div>)}
      <div className="small dim" style={{ marginTop: 10, lineHeight: 1.4 }}>
        {t('Most working sets belong close to failure without living there — half at the floor and half at the top average out to a healthy-looking middle.')}
      </div>
    </>}
  </div>
}

// Stats = the analytics hub: all charts, progress and history live here.
export default function Stats() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [range, setRange] = useState(90)
  const [muscleWin, setMuscleWin] = useState(7)
  const [hard, setHard] = useState(false)
  const [effortWin, setEffortWin] = useState(90)
  const [exId, setExId] = useState(null)
  const [exMetric, setExMetric] = useState('top')
  const now = useNow()
  const overview = useMemo(() => selectStatsOverview(S, {
    now, bodyweightDays: range, muscleDays: muscleWin, effortDays: effortWin, hardOnly: hard,
  }), [S, now, range, muscleWin, effortWin, hard])
  const kind = overview.scale
  const hd = overview.scaleName
  const bw = overview.bodyweight
  const bwDelta30 = bw.delta30
  const exHist = overview.exerciseIndex
  const curEx = exHist.some(ex => ex.id === exId) ? exId : exHist[0]?.id || null
  const exercise = useMemo(() => curEx ? selectExerciseStats(S, curEx, { now }) : null, [S, curEx, now])
  const curCardio = exercise?.mode === 'cardio'
  const curTimed = exercise?.mode === 'time'
  const exUnit = exercise?.unit || S.unit
  const exList = exercise?.recent || []
  const exBest = exercise?.best || 0
  const e1Pts = exercise?.e1rmPoints || []
  const e1Best = exercise?.e1rmBest
  const showE1 = e1Pts.length > 0
  const showEff = !!exercise?.effort?.hasCurve
  const effPts = exercise?.effort?.points || []
  const onE1 = showE1 && exMetric === 'e1rm'
  const onEff = showEff && exMetric === 'effort'
  const topPts = (exercise?.points || []).map(point => ({
    ...point, note: point.effort == null ? undefined : hd + ' ' + fmtNum(point.effort),
  }))
  const exOpts = [{ value: 'top', label: t('Top set') }]
  if (showE1) exOpts.push({ value: 'e1rm', label: t('Est. 1RM') })
  if (showEff) exOpts.push({ value: 'effort', label: t('Effort') })

  return <>
    <div className="hdr">
      <div>
        <h1>{t('Stats')}</h1>
        <div className="sub">{t('Progress & history')}</div>
      </div>
      <button className="iconbtn" onClick={() => nav('/history')} aria-label={t('History')}>
        <Icon name="history" />
      </button>
    </div>

    <div className="tiles">
      <div className="tile tappable" onClick={() => nav('/history')}>
        <div className="stats-tile-head">
          <span className="l">{t('Workouts')}</span>
          <span className="stats-tile-icon acc"><Icon name="dumbbell" /></span>
        </div>
        <div className="v">{overview.counts.total}</div>
        <div className="stats-tile-sub"><Icon name="chevronRight" style={{ fontSize: 11 }} />{t('View history')}</div>
      </div>

      <div className="tile tappable" onClick={() => recapSheet(todayISO())}>
        <div className="stats-tile-head">
          <span className="l">{t('This month')}</span>
          <span className="stats-tile-icon blue"><Icon name="calendar" /></span>
        </div>
        <div className="v">{overview.counts.month}</div>
        <div className="stats-tile-sub"><Icon name="sparkles" style={{ fontSize: 11 }} />{t('Active days')}</div>
      </div>

      <div className="tile tappable" onClick={() => calendarSheet()}>
        <div className="stats-tile-head">
          <span className="l">{t('Week streak')}</span>
          <span className="stats-tile-icon orange"><Icon name="flame" /></span>
        </div>
        <div className="v">{overview.counts.streak}</div>
        <div className="stats-tile-sub">{overview.counts.streak === 1 ? t('1 week') : t('{0} weeks', overview.counts.streak)}</div>
      </div>

      <div className="tile tappable" onClick={() => bwSheet()}>
        <div className="stats-tile-head">
          <span className="l">{t('Weight 30d')}</span>
          <span className="stats-tile-icon purple"><Icon name="scale" /></span>
        </div>
        <div className="v" style={{ fontSize: 22, color: bwDelta30 === null ? 'inherit' : bwDeltaColor(bwDelta30, (bw.latest || {}).w || 0) }}>
          {bwDelta30 === null ? '—' : (bwDelta30 > 0 ? '+' : '') + fmtNum(bwDelta30) + ' ' + S.unit}
        </div>
        <div className="stats-tile-sub">
          {bw.latest ? `${fmtNum(bw.latest.w)} ${S.unit}` : t('No weigh-ins')}
        </div>
      </div>
    </div>

    <div className="card">
      <div className="card-head">
        <h2><Icon name="calendar" style={{ fontSize: 16, color: 'var(--acc)' }} />{t('Activity — last 12 months')} <span className="card-sub">· {t('by time trained')}</span></h2>
      </div>
      <Heatmap S={S} onDay={iso => { const ws = overview.workouts.forDay(iso); if (ws.length === 1) workoutDetailSheet(ws[0]); else if (ws.length) calendarSheet(iso) }} />
    </div>

    {overview.counts.total > 0 && <MuscleBalance S={S} overview={overview} win={muscleWin} setWin={setMuscleWin} setHard={setHard} />}
    {overview.hasEffort && <EffortCard overview={overview} win={effortWin} setWin={setEffortWin} />}

    <div className="cols">
      <div className="card">
        <div className="card-head">
          <h2><Icon name="scale" style={{ fontSize: 16, color: 'var(--purple)' }} />{t('Body weight')}</h2>
          <div className="row" style={{ gap: 8 }}>
            <Button size="sm" icon="target" style={bw.goal ? { color: 'var(--yellow)' } : undefined} onClick={goalSheet}>{bw.goal ? fmtNum(bw.goal) : t('Goal')}</Button>
            <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
          </div>
        </div>
        <Segmented className="seg-range" label={t('Time window')} value={range} onChange={setRange}
          options={[{ value: 30, label: '1M' }, { value: 90, label: '3M' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
        <div className="chart"><LineChart points={bw.points} h={160} unit={S.unit} goal={bw.goal} /></div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2><Icon name="dumbbell" style={{ fontSize: 16, color: 'var(--blue)' }} />{t('Exercise progress')}</h2>
        </div>
        {exHist.length ? <>
          <div className="sect-b" style={{ marginBottom: 10 }}>
            <SelectRow title={t('Exercise')} sheetTitle={t('Exercise progress')} value={curEx} onChange={setExId}
              options={exHist.map(ex => ({ value: ex.id, label: ex.name + (ex.current ? ' — ' + fmtNum(ex.current) + ' ' + ex.unit : '') }))} />
          </div>
          {exOpts.length > 1 && <Segmented className="seg-range" label={t('Exercise metric')} value={onEff ? 'effort' : onE1 ? 'e1rm' : 'top'} onChange={setExMetric} options={exOpts} />}
          <div className="chart">
            {onEff
              ? <LineChart points={effPts} h={150} unit={hd} color="var(--yellow)" invert={kind === 'rir'} />
              : <LineChart points={onE1 ? e1Pts : topPts} h={150} unit={exUnit} color="var(--blue)" />}
          </div>
          <div style={{ marginTop: 10 }}>
            {exList.map((p, i) => (
              <div key={i} className="exercise-session-item">
                <span className="exercise-session-date">{fmtDate(p.d, true)}</span>
                <div className="exercise-session-sets">
                  {p.sets.map((s, si) => (
                    <span key={si} className={`set-pill ${s.w && s.w === exBest ? 'top' : ''}`}>
                      {setLabel(curEx, s, p.target)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="pr-banner">
            <Icon name="trophy" className="pr-banner-icon" />
            <div className="pr-banner-text">
              {onEff ? t('Average effort per workout') : onE1 ? t('Estimated 1RM per workout') : curCardio ? t('Top speed per workout') : curTimed ? t('Longest hold per workout') : t('Best set weight per workout')}
              {onEff ? '' : <> · {t('Best:')}{' '}<b>{fmtNum(onE1 ? e1Best.est : exBest)} {onE1 ? S.unit : exUnit}</b></>}
              {onE1 && <div className="dim small" style={{ marginTop: 2 }}>{t('Best estimate from {0} on {1} — an estimate, not a tested max.', fmtNum(e1Best.w) + ' ' + S.unit + ' × ' + e1Best.r, fmtDate(e1Best.d, true))}</div>}
            </div>
          </div>
          {!onEff && !onE1 && showEff && <div className="small dim" style={{ marginTop: 6 }}>
            {t('A fuller dot means less left in the tank — the same weight at a lower {0} is progress the line alone does not show.', hd)}
          </div>}
        </> : <div className="muted small">{t('Finish your first workout to see progress curves here.')}</div>}
      </div>
    </div>

    {overview.counts.total > 0 && <>
      <div className="row between" style={{ marginBottom: 10, marginTop: 16 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Recent workouts')}</h4>
        <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/history')}>{t('All')} {overview.counts.total}</Button>
      </div>
      <div className="list">{overview.workouts.recent.map(w => <WorkoutRow key={w.id} w={w} onClick={() => workoutDetailSheet(w)} />)}</div>
    </>}
  </>
}
