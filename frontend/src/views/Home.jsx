import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutine, effectiveRoutineId, hasEffectiveOverride } from '../lib/history.js'
import { sessionProgress, tonnageOf, setsDone } from '../lib/workout-model.js'
import { dayStatus } from '../lib/schedule.js'
import { latestWeighIn, prevWeighIn, deltaTowardGoal } from '../lib/bodyweight.js'
import { fmtNum, fmtDate, fmtVol, durPart, todayISO, isoOf, weekKey, DAYS, exCount, exLine, workoutTimestamp } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { exOr } from '../lib/exercises.js'
import { loadOfRoutine, loadOfActive, rankOf, MUSCLE_NAME } from '../lib/muscles.js'
import { selectStatsOverview } from '../lib/stats-selectors.js'
import { FATIGUE_LEVELS } from '../lib/recovery-view.js'
import { bwSheet, goalSheet, dayOverrideSheet, calendarSheet, startFlow, loadStarterPlan, displayNameSheet, exerciseDetailSheet } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import BodyMap from '../components/BodyMap.jsx'
import Icon from '../components/Icon.jsx'
import { Thumb } from '../components/Media.jsx'
import { Button } from '../components/ui.jsx'

// The poster type steps down with the name so a long routine still fits beside the map. The
// longest word decides as well as the total: a word has to fit the column or it breaks in two.
function titleSize(name) {
  const text = name || ''
  const word = Math.max(0, ...text.split(/\s+/).map(w => w.length))
  if (word > 9) return ' xs'
  if (word > 7 || text.length > 20) return ' s'
  if (word > 5 || text.length > 10) return ' m'
  return ''
}

/** The muscles a map is shaded for, named, so the picture is never the only way to read it. */
function muscleNames(load, n = 3) {
  return rankOf(load).worked.slice(0, n).map(m => t(MUSCLE_NAME[m])).join(' · ')
}

/** On a day with nothing to train, the hero shows what is still recovering instead. */
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

// Home = what to do now + a quick glance. Deep charts & history live in Stats.
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
  const wkLabel = weekOffset === 0 ? t('This week') : `${monday.getDate()} ${monday.toLocaleDateString(dateLocale(), { month: 'short' })} – ${sunday.getDate()} ${sunday.toLocaleDateString(dateLocale(), { month: 'short' })}`

  const wThisWeek = S.workouts.filter(w => weekKey(w.d) === weekKey(todayISO())).length
  const plannedPerWeek = Object.keys(S.week).filter(k => S.week[k]).length
  const bwPoints = S.bodyweight.slice(-30).map(b => ({ t: workoutTimestamp(b), y: b.w, d: b.d }))

  const displayName = (S.displayName || '').trim()
  const hasName = !!displayName
  const initial = hasName ? [...displayName][0].toUpperCase() : '?'

  const firstRun = !S.routines.length && !S.active && !S.workouts.length
  const heroStatus = S.active ? 'active' : (routine ? (doneToday ? 'done' : 'scheduled') : 'rest')
  const heroName = S.active ? S.active.name : (routine ? routine.name : t('Rest day'))
  const heroLoad = S.active ? loadOfActive(S.active) : routine ? loadOfRoutine(routine) : null
  const heroMuscles = heroLoad ? muscleNames(heroLoad) : ''

  // What the day's work came to, read straight off the log, so "done" carries its evidence.
  const todays = doneToday ? S.workouts.filter(w => w.d === todayISO()) : []
  const todaySets = todays.reduce((n, w) => n + setsDone(w), 0)
  const todayVol = todays.reduce((n, w) => n + tonnageOf(w), 0)
  const lastSame = routine && !doneToday ? [...S.workouts].reverse().find(w => w.routineId === routine.id) : null
  const planEx = !S.active && routine && !doneToday ? routine.ex : []

  return <div className="page home">
    <div className="hdr home-hdr">
      <div>
        <div className="home-date">{today.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1>{hasName ? t('Hi {0}', displayName) : t('Hi there')}</h1>
      </div>
      <div className="row home-hdr-tools">
        {hasName && (
          <button className="profile-pill" onClick={displayNameSheet} aria-label={t('Edit name')}>
            <span className="profile-pill-avatar">{initial}</span>
            <span className="profile-pill-name">{displayName}</span>
          </button>
        )}
        {!hasName && (
          <button className="profile-pill profile-pill--empty" onClick={displayNameSheet} aria-label={t('Set name')}>
            <Icon name="person" />
            <span>{t('Set name')}</span>
          </button>
        )}
        <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="gear" /></button>
      </div>
    </div>

    <div className="home-grid">
      <div className="home-main">
        {/* First run: the first action goes where the day's plan will appear. */}
        {firstRun && <section className="home-hero welcome">
          <div className="welcome-t d">{t('Start with a plan')}</div>
          <div className="muted welcome-b">{t('Build your own week, or load a three-day Push / Pull / Legs plan you can edit later.')}</div>
          <Button variant="primary" className="go" icon="calendar" onClick={loadStarterPlan}>{t('Load starter plan')}</Button>
          <div className="gap8" /><Button onClick={() => nav('/plan')}>{t('Build my own plan')}</Button>
        </section>}

        {/* The day's one answer: what am I training, and what does it hit? */}
        {!firstRun && <section className={`home-hero hero-${heroStatus}`}>
          <div className="home-hero-head">
            {S.active ? (
              <span className="home-badge active"><span className="home-badge-dot" />{t('In Progress')}</span>
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

          <div className="home-hero-body">
            <div className="home-hero-text">
              <h2 className={'home-hero-title d' + titleSize(heroName)}>{heroName}</h2>
              <div className="home-hero-meta">
                {S.active
                  ? `${sessionProgress(S.active).done} ${t('sets logged')}`
                  : (routine
                    ? (routine.ex?.length ? exCount(routine.ex.length) : t("Today's routine"))
                    : t('Time to recover & rebuild'))}
              </div>
              {heroMuscles && <div className="home-hero-note">{heroMuscles}</div>}
              {doneToday && !S.active && <div className="home-hero-note">
                {[...durPart(todays.reduce((n, w) => n + Math.max(0, (w.end || w.start) - w.start), 0)), t('{0} sets', todaySets), fmtVol(todayVol, S.unit)].join(' · ')}
              </div>}
              {lastSame && <div className="home-hero-note dim">{t('Last time')}: {fmtDate(lastSame.d)} · {fmtVol(tonnageOf(lastSame), S.unit)}</div>}
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
              <div className="muted small">
                {t(S.workouts.length === 1 ? '{0} workout total' : '{0} workouts total', S.workouts.length)} · {t('View calendar')}
              </div>
            </div>
            <Icon name="chevronRight" className="chev" />
          </div>
          {/* One block per planned session: the true count, not a smoothed bar. */}
          {plannedPerWeek > 0 && <div className="wp-blocks" aria-hidden="true">
            {Array.from({ length: Math.max(plannedPerWeek, wThisWeek) }, (_, i) => <i key={i} className={i < wThisWeek ? 'on' : ''} />)}
          </div>}
        </button>

        <section className="card bw-card">
          <div className="card-head">
            <h2>{t('Body weight')}</h2>
            <div className="row bw-tools">
              <Button size="sm" icon="target" aria-label={S.targetW ? `${t('Goal weight')}: ${fmtNum(S.targetW)} ${S.unit}` : t('Set goal weight')} onClick={goalSheet}>
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
                  <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} />
                  {fmtNum(Math.abs(delta))} {S.unit}
                </span>
              )}
              <span className="dim small bw-when">{fmtDate(bw.d, true)}</span>
            </div>
            {S.targetW && (
              <div className="goal-row">
                {t('Goal')} {fmtNum(S.targetW)} {S.unit} · {Math.abs(S.targetW - bw.w) < 0.05 ? t('reached!') : t(S.targetW > bw.w ? '{0} to gain' : '{0} to lose', fmtNum(Math.abs(S.targetW - bw.w)) + ' ' + S.unit)}
              </div>
            )}
            <div className="chart bw-chart"><LineChart points={bwPoints} h={120} unit={S.unit} goal={S.targetW} /></div>
          </> : <div className="muted small">{t('No entries yet — log your weight to start the curve. Sky also asks once a day, before your first workout.')}</div>}
        </section>
      </div>
    </div>
  </div>
}
