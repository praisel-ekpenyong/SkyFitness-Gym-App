import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { DAYN, uid, exCount } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { loadOfRoutine } from '../lib/muscles.js'
import { dayAssignSheet, loadStarterPlan, planToolsSheet } from '../sheets.jsx'
import BodyMap from '../components/BodyMap.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { DEFAULT_GLYPH } from '../lib/glyphs.js'

/** Plan route; assigns weekdays and manages routines. */
export default function Plan() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const todayWd = new Date().getDay()

  const addRoutine = () => {
    const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
    update(s => { s.routines.push(r) })
    nav('/plan/r/' + r.id)
  }

  return <div className="page">
    <div className="hdr">
      <div><h1>{t('Plan')}</h1><div className="sub">{t('Your weekly routine')}</div></div>
      <button className="btn sm plain hdr-act" onClick={planToolsSheet} aria-label={t('Share your plan')}><Icon name="upload" />{t('Share')}</button>
    </div>
    {/* No Routine yet: the same two first actions as Home's first-run hero, not seven "Rest" rows. */}
    {!S.routines.length ? <div className="cols"><section className="home-hero welcome">
      <div className="welcome-t d">{t('Start with a plan')}</div>
      <div className="muted welcome-b">{t('Build your own week, or load a three-day Push / Pull / Legs plan you can edit later.')}</div>
      <Button variant="primary" className="go" icon="calendar" onClick={loadStarterPlan}>{t('Load starter plan')}</Button>
      <div className="gap8" /><Button onClick={addRoutine}>{t('Build my own plan')}</Button>
    </section></div> : <div className="cols">
      <section>
        <h2 className="sec sec-first">{t('Week schedule')}</h2>
        <div className="wk-list">
          {/* A row leads with what is trained; the day labels it, and today says so in words. */}
          {[1, 2, 3, 4, 5, 6, 0].map(d => {
            const r = S.routines.find(x => x.id === S.week[d])
            const today = d === todayWd
            return <button key={d} className={'wk-row' + (r ? '' : ' off') + (today ? ' today' : '')}
              aria-label={`${t(DAYN[d])}: ${r ? r.name : t('Rest')}`} aria-current={today ? 'date' : undefined}
              onClick={() => dayAssignSheet(d)}>
              <span className="wk-text">
                <span className={'wk-name' + (r ? ' d' : '')}>{r ? r.name : t('Rest')}</span>
                <span className="wk-day">{today ? `${t(DAYN[d])} · ${t('Today')}` : t(DAYN[d])}</span>
              </span>
              {r && <span className="wk-meta-c">{exCount(r.ex.length)}</span>}
              <Icon name="chevronRight" className="chev" />
            </button>
          })}
        </div>
      </section>
      <section>
        <div className="sec-row sec-first">
          <h2 className="sec">{t('Routines')}</h2>
          <Button size="sm" icon="plus" onClick={addRoutine}>{t('New')}</Button>
        </div>
        <div className="rt-list">{S.routines.map(r => (
          <button key={r.id} className="rt-card" aria-label={`${r.name}, ${exCount(r.ex.length)}`} onClick={() => nav('/plan/r/' + r.id)}>
            <span className="rt-text">
              <span className="rt-name d">{r.name}</span>
              <span className="rt-meta">{exCount(r.ex.length)}</span>
            </span>
            <span className="rt-map"><BodyMap load={loadOfRoutine(r)} body={S.body} /></span>
          </button>
        ))}</div>
      </section>
    </div>}
  </div>
}
