import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutine, effectiveRoutineId, streakWeeks, lastBW, setsDoneActive } from '../lib/history.js'
import { fmtNum, fmtDate, todayISO, isoOf, weekKey, DAYS, exCount, workoutTimestamp } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { bwSheet, goalSheet, dayOverrideSheet, calendarSheet, startFlow, loadStarterPlan, bwDeltaColor, displayNameSheet } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { glyphOf } from '../lib/glyphs.js'

// Home = what to do now + a quick glance. Deep charts & history live in Stats.
export default function Home() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [weekOffset, setWeekOffset] = useState(0)

  const today = new Date()
  const routine = effectiveRoutine(S, todayISO())
  const todayOvr = (S.dayPlan || {})[todayISO()] !== undefined
  const bw = lastBW(S)
  const prevBW = S.bodyweight.length > 1 ? S.bodyweight[S.bodyweight.length - 2] : null
  const delta = bw && prevBW ? bw.w - prevBW.w : null

  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7)
  const doneDays = new Set(S.workouts.map(w => w.d))
  const doneToday = doneDays.has(todayISO())

  const strip = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    const iso = isoOf(d)
    const eff = effectiveRoutineId(S, iso), ovr = (S.dayPlan || {})[iso] !== undefined, done = doneDays.has(iso)
    const dot = done ? ' done' : ovr && eff ? ' ovr' : eff ? ' plan' : ''
    strip.push(
      <button key={i} className={'wday' + (iso === todayISO() ? ' today' : '')} onClick={() => dayOverrideSheet(iso)} aria-label={t(DAYS[d.getDay()]) + ' ' + d.getDate()}>
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
  const weekProgressPct = plannedPerWeek ? Math.min(100, Math.round((wThisWeek / plannedPerWeek) * 100)) : (wThisWeek > 0 ? 100 : 0)

  const displayName = (S.displayName || '').trim()
  const hasName = !!displayName
  const initial = hasName ? [...displayName][0].toUpperCase() : '?'

  const heroStatus = S.active ? 'active' : (routine ? (doneToday ? 'done' : 'scheduled') : 'rest')

  return <div className="narrow">
    {/* Greeting Header */}
    <div className="hdr" style={{ alignItems: 'center' }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {hasName ? t('Hi {0}', displayName) : t('Hi there')}
        </h1>
        <div className="sub">{today.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>
      <div className="row" style={{ gap: 8, flex: 'none' }}>
        {hasName && (
          <button className="profile-pill" onClick={displayNameSheet} aria-label={t('Edit name')}>
            <span className="profile-pill-avatar">{initial}</span>
            <span className="profile-pill-name">{displayName}</span>
            <Icon name="chevronDown" style={{ fontSize: 12, color: 'var(--label-3)' }} />
          </button>
        )}
        {!hasName && (
          <button className="profile-pill profile-pill--empty" onClick={displayNameSheet} aria-label={t('Set name')}>
            <Icon name="person" style={{ fontSize: 14 }} />
            <span>{t('Set name')}</span>
          </button>
        )}
        <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="gear" /></button>
      </div>
    </div>

    {/* Hero Card: Today's Action */}
    <div className={`home-hero hero-${heroStatus}`}>
      <div className="home-hero-head">
        {S.active ? (
          <span className="home-badge active">
            <span className="home-badge-dot" />
            {t('In Progress')}
          </span>
        ) : routine ? (
          doneToday ? (
            <span className="home-badge done">
              <Icon name="check" style={{ fontSize: 12 }} />
              {t('Completed today')}
            </span>
          ) : (
            <span className="home-badge scheduled">
              {todayOvr ? t('Rescheduled today') : t('Scheduled today')}
            </span>
          )
        ) : (
          <span className="home-badge rest">
            <Icon name="moon" style={{ fontSize: 12 }} />
            {t('Rest day')}
          </span>
        )}
        <button className="btn xs ghost" onClick={() => dayOverrideSheet(todayISO())} style={{ padding: '3px 8px' }}>
          {t('Edit schedule')}
        </button>
      </div>

      <div className="home-hero-main">
        <span className={`home-hero-icon ${S.active ? 'orange' : (routine ? 'acc' : '')}`}>
          <Icon name={S.active ? 'timer' : (routine ? glyphOf(routine.emoji) : 'moon')} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="home-hero-title">
            {S.active ? S.active.name : (routine ? routine.name : t('Rest day'))}
          </div>
          <div className="home-hero-meta">
            {S.active
              ? `${setsDoneActive(S.active)} ${t('sets logged')}`
              : (routine
                ? (routine.ex?.length ? exCount(routine.ex.length) : t("Today's routine"))
                : t('Time to recover & rebuild'))}
          </div>
        </div>
      </div>

      {S.active ? (
        <Button variant="primary" style={{ background: 'var(--orange)', color: '#000' }} icon="timer" onClick={() => nav('/workout')}>
          {t('Resume workout')}
        </Button>
      ) : routine ? (
        doneToday ? (
          <Button variant="tinted" icon="plus" onClick={() => startFlow(routine.id)}>
            {t('Start another session')}
          </Button>
        ) : (
          <Button variant="primary" icon="dumbbell" onClick={() => startFlow(routine.id)}>
            {t('Start workout')}
          </Button>
        )
      ) : (
        <Button variant="tinted" icon="plus" onClick={() => dayOverrideSheet(todayISO())}>
          {t('Plan or start workout')}
        </Button>
      )}
    </div>

    {/* Week Schedule Card */}
    <div className="card">
      <div className="week-nav">
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => setWeekOffset(w => w - 1)} aria-label={t('Previous week')}>
          <Icon name="chevronLeft" />
        </button>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <div className="small muted" style={{ fontWeight: 600 }}>{wkLabel}</div>
          {weekOffset !== 0 && (
            <button className="week-reset-btn" onClick={() => setWeekOffset(0)}>
              {t('Today')}
            </button>
          )}
        </div>
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => setWeekOffset(w => w + 1)} aria-label={t('Next week')}>
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className="week">{strip}</div>
    </div>

    {/* Welcome / Starter Plan banner (if no routines exist) */}
    {!S.routines.length && !S.active && (
      <div className="card">
        <div className="row" style={{ gap: 10, marginBottom: 6 }}>
          <span className="lrow-i"><Icon name="sparkles" /></span>
          <div className="big" style={{ fontSize: 22 }}>{t('Welcome!')}</div>
        </div>
        <div className="muted small" style={{ marginBottom: 12 }}>{t('Set up your weekly routine to get going — or load a ready-made Push / Pull / Legs plan.')}</div>
        <Button variant="primary" icon="sparkles" onClick={loadStarterPlan}>{t('Load starter plan (PPL)')}</Button>
        <div style={{ height: 8 }} /><Button onClick={() => nav('/plan')}>{t('Build my own plan')}</Button>
      </div>
    )}

    {/* Body Weight Card */}
    <div className="card">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--label)' }}>{t('Body weight')}</h2>
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" icon="target" style={S.targetW ? { color: 'var(--yellow)' } : undefined} onClick={goalSheet}>
            {S.targetW ? fmtNum(S.targetW) : t('Goal')}
          </Button>
          <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
        </div>
      </div>
      {bw ? <>
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <div className="big">{fmtNum(bw.w)} <span className="muted" style={{ fontSize: '1rem', fontWeight: 400 }}>{S.unit}</span></div>
          {!!delta && (
            <span className="delta-pill" style={{ color: bwDeltaColor(delta, bw.w), background: 'color-mix(in srgb, currentColor 14%, transparent)' }}>
              <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} style={{ fontSize: 12 }} />
              {fmtNum(Math.abs(delta))}
            </span>
          )}
          <span className="dim small" style={{ marginLeft: 'auto' }}>{fmtDate(bw.d, true)}</span>
        </div>
        {S.targetW && (
          <div className="goal-row">
            <Icon name="target" style={{ fontSize: 13, flex: 'none' }} />
            <span>
              {t('Goal')} {fmtNum(S.targetW)} {S.unit} · {Math.abs(S.targetW - bw.w) < 0.05 ? t('reached!') : t(S.targetW > bw.w ? '{0} to gain' : '{0} to lose', fmtNum(Math.abs(S.targetW - bw.w)) + ' ' + S.unit)}
            </span>
          </div>
        )}
        <div className="chart" style={{ marginTop: 10 }}><LineChart points={bwPoints} h={130} unit={S.unit} goal={S.targetW} /></div>
      </> : <div className="muted small">{t("No entries yet — log your weight to start the curve. It's also asked before every workout.")}</div>}
    </div>

    {/* Weekly Progress & Streak Card */}
    <div className="card tappable" style={{ cursor: 'pointer' }} onClick={() => calendarSheet()}>
      <div className="row between">
        <div>
          <div className="row" style={{ gap: 7, fontSize: 20, fontWeight: 700, letterSpacing: '-.021em' }}>
            <Icon name="flame" style={{ color: 'var(--orange)' }} />
            {t('{0} week streak', streakWeeks(S))}
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>
            {wThisWeek}{plannedPerWeek ? ' / ' + plannedPerWeek : ''} {t('this week')} · {t(S.workouts.length === 1 ? '{0} workout total' : '{0} workouts total', S.workouts.length)}
          </div>
        </div>
        <Icon name="calendar" className="chev" style={{ fontSize: 20 }} />
      </div>
      {plannedPerWeek > 0 && (
        <div className="streak-bar-track">
          <div className="streak-bar-fill" style={{ width: `${weekProgressPct}%` }} />
        </div>
      )}
    </div>
  </div>
}
