import { t } from '../lib/i18n.js'
import { loadStarterPlan, loadHypertrophyPlan } from '../sheets.jsx'
import { Button } from './ui.jsx'

export default function StarterCard({ onBuild }) {
  return <section className="home-hero welcome">
    <div className="welcome-t d">{t('Start with a plan')}</div>
    <div className="muted welcome-b">{t('Build your own week, or load a plan you can edit later: three-day Push / Pull / Legs, or five-day hypertrophy.')}</div>
    <Button variant="primary" className="go" icon="calendar" onClick={loadStarterPlan}>{t('Load starter plan')}</Button>
    <div className="gap8" /><Button icon="calendar" onClick={loadHypertrophyPlan}>{t('Load 5-day hypertrophy plan')}</Button>
    <div className="gap8" /><Button onClick={onBuild}>{t('Build my own plan')}</Button>
  </section>
}
