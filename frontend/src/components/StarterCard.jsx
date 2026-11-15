import { t } from '../lib/i18n.js'
import { loadStarterPlan } from '../sheets.jsx'
import { Button } from './ui.jsx'

/**
 * The first two actions before there is a Routine: load the starter plan, or build your own.
 * Home's first-run hero and Plan with no Routines show the same card.
 * @param {{ onBuild: () => void }} props - What "Build my own plan" does on this screen.
 */
export default function StarterCard({ onBuild }) {
  return <section className="home-hero welcome">
    <div className="welcome-t d">{t('Start with a plan')}</div>
    <div className="muted welcome-b">{t('Build your own week, or load a three-day Push / Pull / Legs plan you can edit later.')}</div>
    <Button variant="primary" className="go" icon="calendar" onClick={loadStarterPlan}>{t('Load starter plan')}</Button>
    <div className="gap8" /><Button onClick={onBuild}>{t('Build my own plan')}</Button>
  </section>
}
