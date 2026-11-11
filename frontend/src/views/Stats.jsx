import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { selectStatsOverview, selectExerciseStats } from '../lib/stats-selectors.js'
import { fmtNum, fmtDate, todayISO, setLabel } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { deltaTowardGoal } from '../lib/bodyweight.js'
import { bwSheet, goalSheet, calendarSheet, recapSheet, workoutDetailSheet, WorkoutRow } from '../sheets.jsx'
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
  const [showAll, setShowAll] = useState(false)
  const { load, rated, hardActive: on, worked, missed, max, count } = overview.muscles
  const top = showAll ? worked : (overview?.muscles?.top || worked.slice(0, 5))
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
        <h2 className="cap1">{on ? t('by hard sets') : t('by sets worked')}</h2>
        {rated && <Button size="sm" icon="flame"
          onClick={() => { setHard(h => !h); setSel(null) }}>{on ? t('Hard') : t('All')}</Button>}
      </div>
      <Segmented className="seg-range" label={t('Time window')} value={win} onChange={v => { setWin(v); setSel(null) }}
        options={[{ value: 7, label: t('Week') }, { value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 0, label: t('All') }]} />
      {/* An empty window still draws the body: the map is the card, and blank is the honest reading. */}
      {!count && <div className="muted small balance-none">{t('No workouts in this period yet.')}</div>}
      {!count && <BodyMap load={load} body={S.body} />}
      {count ? <>
        <BodyMap className="tappable" load={load} body={S.body} selected={sel}
          onMuscle={m => setSel(s => (s === m ? null : m))}
          getA11yLabel={slug => {
            const val = load[slug]
            if (!val) return `${t(MUSCLE_NAME[slug])}, ${on ? t('no hard sets') : t('not trained')}`
            const setsText = Number.isInteger(val) ? `${val}.0 effective sets` : `${fmtNum(val)} effective sets`
            return `${t(MUSCLE_NAME[slug])}, ${setsText}`
          }} />
        <BodyMapLegend />
        {sel && <div className="muscle-inspector" role="status" aria-live="polite">
          <div className="muscle-inspector-info">
            <div className="muscle-inspector-name"><b>{t(MUSCLE_NAME[sel])}</b></div>
            <div className="muscle-inspector-val">{load[sel] ? t('{0} sets', load[sel]) : on ? t('no hard sets') : t('not trained')}</div>
          </div>
          <Button size="xs" variant="ghost" icon="xmark" onClick={() => setSel(null)}>{t('Clear')}</Button>
        </div>}
        {!sel && top.map(m => <div key={m} className="mrow">
          <span className="nm">{t(MUSCLE_NAME[m])}</span>
          <span className="bar"><i style={{ width: Math.round(load[m] / max * 100) + '%' }} /></span>
          <span className="v">{t('{0} sets', load[m])}</span>
        </div>)}
        {!sel && worked.length > 5 && (
          <div className="more-row">
            <Button size="xs" variant="ghost" onClick={() => setShowAll(s => !s)}>
              {showAll ? t('Show top 5') : t('Show all ({0})', worked.length)}
            </Button>
          </div>
        )}
        {missed.length > 0 && <div className="missed-banner">
          <div className="missed-banner-title"><Icon name="alert" /><span>{on ? t('No hard sets in this period') : t('Not trained in this period')}</span></div>
          <div className="mchips">{missed.map(m => (
            <span
              key={m}
              className="mchip miss"
              role="button"
              tabIndex={0}
              onClick={() => setSel(m)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSel(m)
                }
              }}
            >
              {t(MUSCLE_NAME[m])}
            </span>
          ))}</div>
        </div>}
        {!missed.length && worked.length > 0 &&
          <div className="muted small note">{on
            ? t('Every muscle group got at least one hard set in this period.')
            : t('Every muscle group got some work in this period.')}</div>}
      </> : null}
    </> : view === 'fatigue' ? <>
      <BodyMap className="tappable hm-fatigue" load={fatigue} thresholds={FATIGUE_LEVELS} body={S.body} selected={sel} onMuscle={toggleSel}
        getA11yLabel={slug => `${t(MUSCLE_NAME[slug])}, ${fatigueLabel(overview.fatigue.states[slug])}`} />
      <FatigueLegend />
      <div className="muted small note">{t('Fatigue shows how recently each muscle was trained. High means rest.')}</div>
      {sel && <div className="muscle-inspector fatigue" role="status" aria-live="polite">
        <div className="muscle-inspector-info">
          <div className="muscle-inspector-name"><b>{t(MUSCLE_NAME[sel])}</b></div>
          <div className="muscle-inspector-val">{fatigueLabel(overview.fatigue.states[sel])}</div>
        </div>
        <Button size="xs" variant="ghost" icon="xmark" onClick={() => setSel(null)}>{t('Clear')}</Button>
      </div>}
    </> : <>
      <BodyMap className="tappable hm-strength" load={strength} thresholds={STRENGTH_LEVELS} body={S.body} selected={sel} onMuscle={toggleSel}
        getA11yLabel={slug => `${t(MUSCLE_NAME[slug])}, ${Math.round((strength[slug] ?? 1) * 100)}%`} />
      <StrengthLegend />
      <div className="muted small note">{t('Strength shows retained muscle strength. Train again to reset it.')}</div>
      {sel && <>
        <div className="sec-row">
          <h4 className="sec">{t('Exercises')} · {t(MUSCLE_NAME[sel])}</h4>
          <Button size="xs" variant="ghost" icon="xmark" onClick={() => setSel(null)}>{t('Clear')}</Button>
        </div>
        <div className="small dim strength-hint">{strengthHint(sel)}</div>
        {muscleExercises.length ? muscleExercises.map(row => (
          <div key={row.id} className="strength-exercise-row">
            <div className="grow">
              <div className="row str-name">
                <span className="str-n capitalize">{row.name}</span>
                <span className="tag">{row.primary === sel ? t('primary') : t('secondary')}</span>
              </div>
              <div className="small dim">{t('Est. 1RM')}: {fmtNum(row.est)} {S.unit} · {fmtDate(row.estDate, true)}</div>
            </div>
            <div className="str-v">
              <span className="str-kg">{fmtNum(row.current)} <span className="u">{S.unit}</span></span>
              <span className="str-p">{Math.round(row.decay * 100)}%</span>
            </div>
          </div>
        )) : <div className="muted small">{t('No exercises with an estimated 1RM yet.')}</div>}
      </>}
      {!sel && <div className="muted small note">{t('Tap a muscle to see its exercises.')}</div>}
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
      <h2>{t('Effort')} <span className="card-sub">· {t('how close to failure')}</span></h2>
    </div>
    <Segmented className="seg-range" label={t('Time window')} value={win} onChange={setWin}
      options={[{ value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
    {sum == null ? <div className="muted small">{t('No rated sets in this period.')}</div> : <>
      <div className="effort-stats-grid">
        <div className="effort-stat-box">
          <div className="lbl">{t('average effort')}</div>
          <div className="num">{sum.avg == null ? '—' : <>{fmtNum(sum.avg)} <span className="u">{hd}</span></>}</div>
        </div>
        <div className="effort-stat-box">
          <div className="lbl">{t('at {0} {1} or harder', hd, fmtNum(sum.hardThreshold))}</div>
          <div className="num">{sum.hardPct == null ? '—' : Math.round(sum.hardPct * 100) + '%'}</div>
        </div>
      </div>
      <div className="small dim">{t('{0} of {1} finished sets rated', sum.rated, sum.done)}</div>
      {!overview.effortEnabled && <div className="small eff-off">
        <Icon name="gear" />
        <span>{t('Effort per set is switched off — turn it on in Settings to keep rating.')}</span>
      </div>}
      {pts.length > 1 && <>
        <h4 className="sec">{t('Week by week')}</h4>
        <div className="chart"><LineChart points={pts} h={140} unit={hd} invert={kind === 'rir'} /></div>
      </>}
      <h4 className="sec">{t('Where the sets land')}</h4>
      {sum.histogram.map(b => <div key={b.rir} className="mrow">
        <span className="nm">{hd} {binLabel(b)}</span>
        <span className="bar"><i className={b.hard ? '' : 'quiet'} style={{ width: b.width + '%' }} /></span>
        <span className="v">{b.n ? b.n + ' · ' + b.percent + '%' : '—'}</span>
      </div>)}
      <div className="small dim note">
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
  const [muscleWin, setMuscleWin] = useState(30)
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

  const headline = onEff ? null : onE1 ? e1Best?.est : exBest
  const headlineUnit = onE1 ? S.unit : exUnit

  return <div className="page">
    <div className="hdr">
      <div>
        <h1>{t('Stats')}</h1>
        <div className="sub">{t('Progress & history')}</div>
      </div>
      <button className="iconbtn" onClick={() => nav('/history')} aria-label={t('History')}>
        <Icon name="history" />
      </button>
    </div>

    <div className="tiles stats-kpis">
      <button type="button" className="tile tappable" onClick={() => nav('/history')}>
        <span className="l">{t('Workouts')}</span>
        <div className="v">{overview.counts.total}</div>
        <div className="s">{t('View history')}</div>
      </button>
      <button type="button" className="tile tappable" onClick={() => recapSheet(todayISO())}>
        <span className="l">{t('This month')}</span>
        <div className="v">{overview.counts.month}</div>
        <div className="s">{t('Active days')}</div>
      </button>
      <button type="button" className="tile tappable" onClick={() => calendarSheet()}>
        <span className="l">{t('Weeks trained')}</span>
        <div className="v">{overview.counts.weeks12}<span className="u"> / 12</span></div>
        <div className="s">{t('Last 12 weeks')}</div>
      </button>
      <button type="button" className="tile tappable" onClick={() => bwSheet()}>
        <span className="l">{t('Weight 30d')}</span>
        <div className="v" style={{ color: bwDelta30 === null ? undefined : deltaTowardGoal(S.targetW, (bw.latest || {}).w || 0, bwDelta30) }}>
          {bwDelta30 === null ? '—' : <>{(bwDelta30 > 0 ? '+' : '') + fmtNum(bwDelta30)}<span className="u"> {S.unit}</span></>}
        </div>
        <div className="s">{bw.latest ? `${fmtNum(bw.latest.w)} ${S.unit}` : t('No weigh-ins')}</div>
      </button>
    </div>

    <div className="stats-grid">
      {/* The screen's one question comes first: is this lift going up? */}
      <section className="card ex-progress">
        <div className="card-head">
          <h2>{t('Exercise progress')}</h2>
        </div>
        {exHist.length ? <>
          <div className="sect-b ex-picker">
            <SelectRow title={t('Exercise')} sheetTitle={t('Exercise progress')} value={curEx} onChange={setExId}
              options={exHist.map(ex => ({ value: ex.id, label: <><span className="capitalize">{ex.name}</span>{ex.current ? ' — ' + fmtNum(ex.current) + ' ' + ex.unit : ''}</> }))} />
          </div>
          {headline > 0 && <div className="ex-headline">
            <span className="muted small">{t('Best:')}</span>
            <span className="fig ex-headline-v">{fmtNum(headline)}<span className="u"> {headlineUnit}</span></span>
            <span className="dim small">{onE1 ? t('Estimated 1RM per workout') : curCardio ? t('Top speed per workout') : curTimed ? t('Longest hold per workout') : t('Best set weight per workout')}</span>
          </div>}
          {exOpts.length > 1 && <Segmented className="seg-range" label={t('Exercise metric')} value={onEff ? 'effort' : onE1 ? 'e1rm' : 'top'} onChange={setExMetric} options={exOpts} />}
          <div className="chart">
            {onEff
              ? <LineChart points={effPts} h={170} unit={hd} invert={kind === 'rir'} />
              : <LineChart points={onE1 ? e1Pts : topPts} h={170} unit={exUnit} />}
          </div>
          {onEff && <div className="small muted note">{t('Average effort per workout')}</div>}
          {onE1 && <div className="dim small note">{t('Best estimate from {0} on {1} — an estimate, not a tested max.', fmtNum(e1Best.w) + ' ' + S.unit + ' × ' + e1Best.r, fmtDate(e1Best.d, true))}</div>}
          {!onEff && !onE1 && showEff && <div className="small dim note">
            {t('A fuller dot means less left in the tank — the same weight at a lower {0} is progress the line alone does not show.', hd)}
          </div>}
          <div className="ex-sessions">
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
        </> : <div className="muted small">{t('Finish your first workout to see progress curves here.')}</div>}
      </section>

      {overview.counts.total > 0 && <MuscleBalance S={S} overview={overview} win={muscleWin} setWin={setMuscleWin} setHard={setHard} />}

      <section className="card stats-activity">
        <div className="card-head">
          <h2>{t('Activity — last 12 months')} <span className="card-sub">· {t('by time trained')}</span></h2>
        </div>
        <Heatmap S={S} onDay={iso => { const ws = overview.workouts.forDay(iso); if (ws.length === 1) workoutDetailSheet(ws[0]); else if (ws.length) calendarSheet(iso) }} />
      </section>

      {overview.hasEffort && <EffortCard overview={overview} win={effortWin} setWin={setEffortWin} />}

      <section className="card">
        <div className="card-head">
          <h2>{t('Body weight')}</h2>
          <div className="row bw-tools">
            <Button size="sm" icon="target" onClick={goalSheet}>{bw.goal ? fmtNum(bw.goal) : t('Goal')}</Button>
            <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
          </div>
        </div>
        <Segmented className="seg-range" label={t('Time window')} value={range} onChange={setRange}
          options={[{ value: 30, label: '1M' }, { value: 90, label: '3M' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
        <div className="chart"><LineChart points={bw.points} h={170} unit={S.unit} goal={bw.goal} /></div>
      </section>
    </div>

    {overview.counts.total > 0 && <section>
      <div className="sec-row">
        <h2 className="sec">{t('Recent workouts')}</h2>
        <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/history')}>{t('All')} {overview.counts.total}</Button>
      </div>
      <div className="list recent-list">{overview.workouts.recent.map(w => <WorkoutRow key={w.id} w={w} onClick={() => workoutDetailSheet(w)} />)}</div>
    </section>}
  </div>
}
