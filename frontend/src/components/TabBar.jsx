import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutine } from '../lib/history.js'
import { todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import Mark from './Mark.jsx'

/**
 * The app's primary navigation: a bottom bar on a phone, stood up as a labelled sidebar on desktop by CSS alone.
 * The active tab is marked with aria-current="page"; the center button starts the scheduled routine or resumes the running workout.
 * @param {Function} onStart - Called with the scheduled routine id to start a workout.
 */
export default function TabBar({ onStart }) {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const cur = loc.pathname.split('/')[1] || 'home'
  // Settings is reached from Home on a phone, so Home stays lit there; `via` lets the desktop
  // sidebar, which lists Settings itself, drop that second highlight.
  const via = k => (cur === 'history' && k === 'stats') || (cur === 'settings' && k === 'home')
  const on = k => cur === k || via(k)

  const startWorkout = () => {
    if (!S.active) {
      const r = effectiveRoutine(S, todayISO())
      if (r && r.ex.length) { onStart(r.id); return }
    }
    nav('/workout')
  }
  const Tab = ({ k, icon, to, label, className = '' }) => (
    <button type="button" className={(on(k) ? 'on ' : '') + (k === 'home' && via(k) ? 'via ' : '') + className} aria-current={on(k) ? 'page' : undefined} onClick={() => nav(to)}>
      <Icon name={icon} /><span>{label}</span>
    </button>
  )

  return (
    <nav id="tabbar" aria-label={t('Main')}>
      <div className="tb-brand" aria-hidden="true"><Mark size={15} /><b>Sky</b></div>
      <Tab k="home" icon="house" to="/home" label={t('Home')} />
      <Tab k="plan" icon="calendar" to="/plan" label={t('Plan')} />
      <button type="button" className={'start' + (S.active ? ' rec' : '')} onClick={startWorkout}>
        <span className="cir"><Icon name={S.active ? 'play' : 'barbell'} /></span>
        <span>{S.active ? t('Resume') : t('Start')}</span>
      </button>
      <Tab k="stats" icon="chart" to="/stats" label={t('Stats')} />
      <Tab k="library" icon="list" to="/library" label={t('Exercises')} />
      <Tab k="settings" icon="gear" to="/settings" label={t('Settings')} className="tb-desk" />
    </nav>
  )
}
