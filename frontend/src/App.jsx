import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore.js'
import { ACCENTS } from './lib/format.js'
import { todayISO } from './lib/dates.js'
import { t } from './lib/i18n.js'
import { setLang, useLang } from './platform/i18n.js'
import { setNav } from './platform/nav.js'
import { initBackButton } from './platform/back.js'
import { useWakeLock } from './platform/wakelock.js'
import { startFlow } from './sheets/session.jsx'
import Icon from './components/Icon.jsx'
import { Button } from './components/ui.jsx'
import Mark from './components/Mark.jsx'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Modals from './components/Modals.jsx'
import Toast from './components/Toast.jsx'
import OfflineBadge from './components/OfflineBadge.jsx'
import RestTimer from './components/RestTimer.jsx'
import Home from './views/Home.jsx'

const Plan = lazy(() => import('./views/Plan.jsx'))
const RoutineEdit = lazy(() => import('./views/RoutineEdit.jsx'))
const Workout = lazy(() => import('./views/Workout.jsx'))
const Stats = lazy(() => import('./views/Stats.jsx'))
const History = lazy(() => import('./views/History.jsx'))
const Library = lazy(() => import('./views/Library.jsx'))
const Settings = lazy(() => import('./views/Settings.jsx'))


function applyPrefs(theme, accent) {
  const de = document.documentElement
  de.dataset.theme = theme === 'light' ? 'light' : 'dark'
  de.dataset.accent = Object.hasOwn(ACCENTS, accent) ? accent : 'lime'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = de.dataset.theme === 'light' ? '#f3f3f0' : '#0a0a09'
}

// Kept out of Shell: the React Compiler cannot compile a dynamic import().
const warmExerciseArt = () => import('./platform/media-warm.js')
  .then(m => m.warmArt(m.exercisesToWarm(useStore.getState().S, todayISO())))
  .catch(() => {})

function Shell() {
  const navigate = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const ready = useStore(s => s.ready)
  const storageBlocked = useStore(s => s.storageBlocked)
  const newerProfile = useStore(s => s.newerProfile)
  const langV = useLang()
  useEffect(() => { setNav(navigate) }, [navigate])
  useEffect(() => { applyPrefs(S.theme, S.accent) }, [S.theme, S.accent])
  useEffect(() => { setLang() }, [])
  useEffect(() => { document.documentElement.lang = 'en' }, [langV])
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  useWakeLock(!!S.active && S.keepAwake !== false)
  useEffect(() => {
    document.body.classList.toggle('active-session', !!S.active)
    return () => document.body.classList.remove('active-session')
  }, [!!S.active])
  useEffect(() => {
    if (!ready) return
    const h = window.requestIdleCallback ? window.requestIdleCallback(warmExerciseArt, { timeout: 5000 }) : setTimeout(warmExerciseArt, 3000)
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(h) : clearTimeout(h))
  }, [ready])
  const focused = !!S.active && loc.pathname === '/workout'
  useEffect(() => {
    document.body.classList.toggle('focus-session', focused)
    return () => document.body.classList.remove('focus-session')
  }, [focused])

  if (!ready) return (
    <div id="app"><div className="boot"><Mark size={22} /></div></div>
  )

  if (newerProfile) return (
    <div id="app"><div className="narrow">
      <div role="alert" className="empty error-empty">
        <div className="ico"><Icon name="info" /></div>
        <div className="error-t d">{t('Sky has been updated')}</div>
        {t('Your data was saved by a newer version of Sky, so this one will not open or change it. Reload to get the newer version.')}
      </div>
      <Button variant="primary" icon="reset" onClick={() => location.reload()}>{t('Reload Sky')}</Button>
    </div></div>
  )

  return (
    <>
      <OfflineBadge />
      {storageBlocked && (
        <div role="alert" className="missed-banner storage-banner">
          <div className="missed-banner-title"><Icon name="alert" /><span>{t('Storage blocked')}</span></div>
          <div className="small">{t('Changes will not persist on this device — training still works for this session.')}</div>
        </div>
      )}
      <div id="app" className="vfade" key={loc.pathname}>
        <ErrorBoundary>
          <Suspense fallback={<div className="boot"><Mark size={22} /></div>}>
            <Routes>
              <Route path="/home" element={<Home />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/plan/r/:id" element={<RoutineEdit />} />
              <Route path="/workout" element={<Workout />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/history" element={<History />} />
              <Route path="/library" element={<Library />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
      <TabBar onStart={startFlow} />
      <RestTimer />
      <Modals />
      <Toast />
    </>
  )
}

export default function App() {
  const boot = useStore(s => s.boot)
  useEffect(() => { boot() }, [boot])
  useEffect(() => {
    let stop = null, gone = false
    initBackButton().then(fn => { if (gone) fn(); else stop = fn })
    return () => { gone = true; stop?.() }
  }, [])
  return <HashRouter><Shell /></HashRouter>
}
