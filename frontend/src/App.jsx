import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bindUI } from './components/ui.jsx'
import { ACCENTS, todayISO } from './lib/format.js'
import { setLang, t, useLang } from './lib/i18n.js'
import { setNav } from './lib/nav.js'
import { initBackButton } from './lib/back.js'
import { useWakeLock } from './lib/wakelock.js'
import { startFlow } from './sheets.jsx'
import Icon from './components/Icon.jsx'
import Mark from './components/Mark.jsx'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Modals from './components/Modals.jsx'
import Toast from './components/Toast.jsx'
import OfflineBadge from './components/OfflineBadge.jsx'
import RestTimer from './components/RestTimer.jsx'
// Home is eager — the default route ("/home" + catch-all "*") so first paint has no extra RTT.
// Every other view is lazy and fetched on demand via Suspense, which keeps the initial
// vendor/catalogue preload small and lets Stats/Library/Workout cache independently.
import Home from './views/Home.jsx'

const Plan = lazy(() => import('./views/Plan.jsx'))
const RoutineEdit = lazy(() => import('./views/RoutineEdit.jsx'))
const Workout = lazy(() => import('./views/Workout.jsx'))
const Stats = lazy(() => import('./views/Stats.jsx'))
const History = lazy(() => import('./views/History.jsx'))
const Library = lazy(() => import('./views/Library.jsx'))
const Settings = lazy(() => import('./views/Settings.jsx'))

bindUI(useUI)   // lets the shared controls open sheets without importing the store at module scope

/**
 * Applies the theme and accent preferences to the document (colour-scheme datasets plus theme-color meta).
 * Unknown accents fall back to "lime"; anything other than "light" resolves to dark.
 * @param {string} theme - "light" or "dark".
 * @param {string} accent - Accent key from the supported accent set.
 */
function applyPrefs(theme, accent) {
  const de = document.documentElement
  de.dataset.theme = theme === 'light' ? 'light' : 'dark'
  de.dataset.accent = ACCENTS[accent] ? accent : 'lime'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = de.dataset.theme === 'light' ? '#f3f3f0' : '#0a0a09'
}

/**
 * App frame: tab routes with error containment, tab bar, rest timer, sheets and toast; shows a splash mark until the store is ready.
 */
function Shell() {
  const navigate = useNavigate()
  const loc = useLocation()
  const { S, ready, storageBlocked } = useStore()
  const langV = useLang()   // re-renders the whole shell when the language (pack) changes
  useEffect(() => { setNav(navigate) }, [navigate])
  useEffect(() => { applyPrefs(S.theme, S.accent) }, [S.theme, S.accent])
  useEffect(() => { setLang() }, [])
  useEffect(() => { document.documentElement.lang = 'en' }, [langV])
  // every tab/route change starts at the top of the page
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  // bound to the workout, not to the route — checking Stats mid-session keeps the screen on
  useWakeLock(!!S.active && S.keepAwake !== false)
  useEffect(() => {
    document.body.classList.toggle('active-session', !!S.active)
    return () => document.body.classList.remove('active-session')
  }, [!!S.active])
  // Once the profile is loaded and the phone is idle, fetch the art for the workout in progress and
  // the coming week's sessions, so a workout started where the signal drops still has its pictures.
  useEffect(() => {
    if (!ready) return
    const go = () => import('./lib/media-warm.js')
      .then(m => m.warmArt(m.exercisesToWarm(useStore.getState().S, todayISO())))
      .catch(() => {})
    const h = window.requestIdleCallback ? window.requestIdleCallback(go, { timeout: 5000 }) : setTimeout(go, 3000)
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(h) : clearTimeout(h))
  }, [ready])
  // Focus mode: while a workout is on screen the phone's tab bar steps aside and the set owns
  // the display. The workout header's minimize button is the way back to the rest of the app.
  const focused = !!S.active && loc.pathname === '/workout'
  useEffect(() => {
    document.body.classList.toggle('focus-session', focused)
    return () => document.body.classList.remove('focus-session')
  }, [focused])

  if (!ready) return (
    <div id="app"><div className="boot"><Mark size={22} /></div></div>
  )

  return (
    <>
      <OfflineBadge />
      {/* Blocked device storage degrades to an in-memory session: training keeps
          working and this persistent alert says changes will not persist. */}
      {storageBlocked && (
        <div role="alert" className="missed-banner storage-banner">
          <div className="missed-banner-title"><Icon name="alert" /><span>{t('Storage blocked')}</span></div>
          <div className="small">{t('Changes will not persist on this device — training still works for this session.')}</div>
        </div>
      )}
      {/* keyed on the route: a view that throws is contained, and switching tabs
          re-mounts the boundary, so the tab bar is always a way out */}
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

/**
 * App root: boots the store once, wires the Android system back button, and provides the router for the shell.
 */
export default function App() {
  const boot = useStore(s => s.boot)
  useEffect(() => { boot() }, [boot])
  // Android system back — sheet, then page, then press-again-to-exit (see lib/back.js)
  useEffect(() => {
    let stop = null, gone = false
    initBackButton().then(fn => { if (gone) fn(); else stop = fn })
    return () => { gone = true; stop?.() }
  }, [])
  return <HashRouter><Shell /></HashRouter>
}
