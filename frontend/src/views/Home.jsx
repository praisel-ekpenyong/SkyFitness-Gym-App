import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutine, effectiveRoutineId, hasEffectiveOverride } from '../lib/history.js'
import { sessionView } from '../lib/active-workout.js'
import { tonnage, lastWorkoutInRoutine } from '../lib/training-log.js'
import { dayStatus } from '../lib/schedule.js'
import { summarizeWorkouts } from '../lib/workout-summary.js'
import { latestWeighIn, prevWeighIn, deltaTowardGoal, weighIns } from '../lib/bodyweight.js'
import { fmtNum, fmtSigned, fmtVol, NBSP, durPart, exCount } from '../lib/format.js'
import { fmtDate, todayISO, isoOf, weekKey, DAYS, workoutTimestamp } from '../lib/dates.js'
import { exLine } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { exOr } from '../lib/exercises.js'
import { loadOfRoutine, loadOfActive, rankOf, MUSCLE_NAME } from '../lib/muscles.js'
import { selectStatsOverview } from '../lib/stats-selectors.js'
import { streakOf } from '../lib/streak.js'
import { FATIGUE_LEVELS } from '../lib/recovery-view.js'
import { bwSheet, goalSheet } from '../sheets/bodyweight.jsx'
import { dayOverrideSheet } from '../sheets/schedule.jsx'
import { calendarSheet } from '../sheets/history.jsx'
import { startFlow } from '../sheets/session.jsx'
import { exerciseDetailSheet } from '../sheets/catalogue.jsx'
import LineChart from '../components/LineChart.jsx'
import BodyMap from '../components/BodyMap.jsx'
import Icon from '../components/Icon.jsx'
import { Thumb } from '../components/Media.jsx'
import { Button } from '../components/ui.jsx'
import StarterCard from '../components/StarterCard.jsx'
import { fitName, stackClasses, NAME_LAYOUTS } from '../lib/name-fit.js'

function muscleNames(load, n = 3) {
  return rankOf(load).worked.slice(0, n).map(m => t(MUSCLE_NAME[m])).join(' · ')
}

function RecoveryMap({ S }) {
  const overview = useMemo(() => selectStatsOverview(S, { now: Date.now() }), [S])
  const tired = Object.keys(overview.fatigue.states).filter(m => overview.fatigue.states[m] !== 'ready')
  return <>
    <div className="home-hero-map"><BodyMap className="hm-fatigue" load={overview.fatigue.values} thresholds={FATIGUE_LEVELS} body={S.body} /></div>
    <div className="home-hero-note">{tired.length
      ? t('Still recovering: {0}', tired.slice(0, 3).map(m => t(MUSCLE_NAME[m])).join(' · '))
      : t('Every muscle is recovered.')}</div>
  </>
}

export default function Home() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [weekOffset, setWeekOffset] = useState(0)

  const today = new Date()
  const routine = effectiveRoutine(S, todayISO())
  const todayOvr = hasEffectiveOverride(S, todayISO())
  const bw = latestWeighIn(S)
  const prevBW = prevWeighIn(S)
  const delta = bw && prevBW ? bw.w - prevBW.w : null

  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7)
  const doneDays = new Set(S.workouts.map(w => w.d))
  const doneToday = doneDays.has(todayISO())
  // Not memoised on S: the streak also depends on today, and a new week can arrive without a store change.
  const streak = streakOf(S)

  const strip = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    const iso = isoOf(d)
    const eff = effectiveRoutineId(S, iso), ovr = hasEffectiveOverride(S, iso), done = doneDays.has(iso)
    const dotCls = dayStatus({ trained: done, effId: eff, ovr })
    const dot = dotCls ? ' ' + dotCls : ''
    strip.push(
      <button key={i} className={'wday' + (iso === todayISO() ? ' today' : '') + (done ? ' trained' : '')} onClick={() => dayOverrideSheet(iso)} aria-label={d.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}>
        <div className="lbl">{t(DAYS[d.getDay()])}</div>
        <div className="num">{d.getDate()}</div>
        <div className={'dot' + dot} />
      </button>
    )
  }
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  const wkLabel = weekOffset === 0 ? t('This week') : t('{0} {1} – {2} {3}', monday.getDate(), monday.toLocaleDateString(dateLocale(), { month: 'short' }), sunday.getDate(), sunday.toLocaleDateString(dateLocale(), { month: 'short' }))

  const wThisWeek = S.workouts.filter(w => weekKey(w.d) === weekKey(todayISO())).length
  const plannedPerWeek = Object.keys(S.week).filter(k => S.week[k]).length
  const bwPoints = weighIns(S).slice(-30).map(b => ({ t: workoutTimestamp(b), y: b.w, d: b.d }))

  const displayName = (S.displayName || '').trim()
  const hasName = !!displayName

  const firstRun = !S.routines.length && !S.active && !S.workouts.length
  const heroStatus = S.active ? 'active' : (routine ? (doneToday ? 'done' : 'scheduled') : 'rest')
  const heroName = S.active ? S.active.name : (routine ? routine.name : t('Rest day'))
  const heroFit = fitName(heroName, NAME_LAYOUTS.hero)
  const heroLoad = S.active ? loadOfActive(S.active) : routine ? loadOfRoutine(routine) : null
  const heroMuscles = heroLoad ? muscleNames(heroLoad) : ''

  const todays = doneToday ? S.workouts.filter(w => w.d === todayISO()) : []
  const todaySum = summarizeWorkouts(S, todays)
  const lastSame = routine && !doneToday ? lastWorkoutInRoutine(S, routine.id) : null
  const planEx = !S.active && routine && !doneToday ? routine.ex : []

  return <div className="page home">
    <div className="hdr home-hdr">
      <div>
        <div className="home-date">{today.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1>{hasName ? t('Hi {0}', displayName) : t('Hi there')}</h1>
      </div>
      <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="gear" /></button>
    </div>

    <div className="home-grid">
      <div className="home-main">
        {firstRun && <StarterCard onBuild={() => nav('/plan')} />}

        {!firstRun && <section className={`home-hero hero-${heroStatus}`}>
          <div className="home-hero-head">
            {S.active ? (
              <span className="home-badge active"><span className="home-badge-dot" />{t('In progress')}</span>
            ) : routine ? (
              doneToday ? (
                <span className="home-badge done"><Icon name="check" />{t('Completed today')}</span>
              ) : (
                <span className="home-badge scheduled">{todayOvr ? t('Rescheduled today') : t('Scheduled today')}</span>
              )
            ) : (
              <span className="home-badge rest">{t('Rest day')}</span>
            )}
            <button className="home-edit" onClick={() => dayOverrideSheet(todayISO())}>{t('Edit schedule')}</button>
          </div>

          <div className={'home-hero-body' + stackClasses(heroFit)}>
            <div className="home-hero-text">
              <h2 className={'home-hero-title d' + (heroFit.step === 'poster' ? '' : ' ' + heroFit.step)}>{heroName}</h2>
              <div className="home-hero-meta">
                {S.active
                  ? t('{0} sets logged', fmtNum(sessionView(S.active).progress.done))
                  : (routine
                    ? (routine.ex?.length ? exCount(routine.ex.length) : t("Today's routine"))
                    : t('Time to recover and rebuild'))}
              </div>
              {heroMuscles && <div className="home-hero-note">{heroMuscles}</div>}
              {doneToday && !S.active && <div className="home-hero-note">
                {[...durPart(todaySum.durationMs), t('{0} sets', fmtNum(todaySum.workSets)), fmtVol(todaySum.tonnage, S.unit)].join(' · ')}
              </div>}
              {lastSame && <div className="home-hero-note dim">{t('Last time')} {fmtDate(lastSame.d)} · {fmtVol(tonnage(S, lastSame), S.unit)}</div>}
            </div>
            {heroLoad
              ? <div className="home-hero-map"><BodyMap load={heroLoad} body={S.body} /></div>
              : S.workouts.length > 0 && <div className="home-hero-recovery"><RecoveryMap S={S} /></div>}
          </div>

          {S.active ? (
            <Button variant="primary" className="live" icon="timer" onClick={() => nav('/workout')}>
              {t('Resume workout')}
            </Button>
          ) : routine ? (
            doneToday ? (
              <Button variant="tinted" icon="plus" onClick={() => startFlow(routine.id)}>
                {t('Start another session')}
              </Button>
            ) : (
              <Button variant="primary" className="go" icon="play" onClick={() => startFlow(routine.id)}>
                {t('Start workout')}
              </Button>
            )
          ) : (
            <Button variant="tinted" icon="plus" onClick={() => dayOverrideSheet(todayISO())}>
              {t('Pick a workout for today')}
            </Button>
          )}
        </section>}

        {planEx.length > 0 && <section>
          <h2 className="sec">{t("Today's exercises")}</h2>
          <div className="list">
            {planEx.slice(0, 4).map((e, i) => {
              const ex = exOr(e.id)
              return <div key={i} className="item" role="button" tabIndex={0} aria-label={ex.n}
                onClick={() => exerciseDetailSheet(ex)}
                onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); exerciseDetailSheet(ex) } }}>
                <Thumb ex={ex} />
                <div className="grow"><div className="tt capitalize">{ex.n}</div><div className="ss">{exLine(e, S.unit)}</div></div>
              </div>
            })}
          </div>
          {planEx.length > 4 && <Button variant="ghost" size="sm" trailingIcon="chevronRight" className="home-more" onClick={() => nav('/plan/r/' + routine.id)}>
            {t('{0} more', planEx.length - 4)}
          </Button>}
        </section>}
      </div>

      <div className="home-side">
        <section className="card week-card">
          <div className="week-nav">
            <button className="iconbtn bare" onClick={() => setWeekOffset(w => w - 1)} aria-label={t('Previous week')}><Icon name="chevronLeft" /></button>
            <div className="row week-title">
              <div className="week-lbl">{wkLabel}</div>
              {weekOffset !== 0 && <button className="week-reset-btn" onClick={() => setWeekOffset(0)}>{t('Today')}</button>}
            </div>
            <button className="iconbtn bare" onClick={() => setWeekOffset(w => w + 1)} aria-label={t('Next week')}><Icon name="chevronRight" /></button>
          </div>
          <div className="week">{strip}</div>
        </section>

        <button type="button" className="card tappable week-progress" onClick={() => calendarSheet()} aria-label={t('Weekly progress and calendar')}>
          <div className="row between">
            <div className="grow">
              <div className="wp-t">
                {plannedPerWeek
                  ? t('{0} of {1} workouts this week', wThisWeek, plannedPerWeek)
                  : (wThisWeek === 0
                    ? t('No workouts this week')
                    : (wThisWeek === 1 ? t('1 workout this week') : t('{0} workouts this week', wThisWeek)))}
              </div>
              {streak.current > 0 && <div className="muted small wp-streak">
                {t('{0}-week streak, {1}', fmtNum(streak.current), streak.freezes === 1 ? t('1 freeze') : t('{0} freezes', fmtNum(streak.freezes)))}
              </div>}
              <div className="muted small">
                {t(S.workouts.length === 1 ? '{0} workout total' : '{0} workouts total', fmtNum(S.workouts.length))} · {t('View calendar')}
              </div>
            </div>
            <Icon name="chevronRight" className="chev" />
          </div>
          {plannedPerWeek > 0 && <div className="wp-blocks" aria-hidden="true">
            {Array.from({ length: Math.max(plannedPerWeek, wThisWeek) }, (_, i) => <i key={i} className={i < wThisWeek ? 'on' : ''} />)}
          </div>}
        </button>

        <section className="card bw-card">
          <div className="card-head">
            <h2>{t('Body weight')}</h2>
            <div className="row bw-tools">
              <Button size="sm" icon="target" aria-label={S.targetW ? t('Goal weight: {0} {1}', fmtNum(S.targetW), S.unit) : t('Set goal weight')} onClick={goalSheet}>
                {S.targetW ? fmtNum(S.targetW) : t('Goal')}
              </Button>
              <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
            </div>
          </div>
          {bw ? <>
            <div className="bw-read-row">
              <div className="fig bw-fig">{fmtNum(bw.w)}<span className="u"> {S.unit}</span></div>
              {!!delta && (
                <span className="delta-pill" style={{ color: deltaTowardGoal(S.targetW, bw.w, delta) }}>
                  {fmtSigned(delta)}{NBSP}{S.unit}
                </span>
              )}
              <span className="dim small bw-when">{fmtDate(bw.d, true)}</span>
            </div>
            {S.targetW && (
              <div className="goal-row">
                {t('Goal')} {fmtVol(S.targetW, S.unit)} · {Math.abs(S.targetW - bw.w) < 0.05 ? t('reached!') : t(S.targetW > bw.w ? '{0} to gain' : '{0} to lose', fmtVol(Math.abs(S.targetW - bw.w), S.unit))}
              </div>
            )}
            <div className="chart bw-chart"><LineChart points={bwPoints} h={120} unit={S.unit} goal={S.targetW} /></div>
          </> : <div className="muted small">{t('No entries yet — log your weight to start the curve. Sky also asks once a day, before your first workout.')}</div>}
        </section>
      </div>
    </div>
  </div>
}
