import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { effectiveRoutineId } from '../lib/history.js'
import { setDayOverride, assignWeekday } from '../lib/schedule.js'
import { exCount } from '../lib/format.js'
import { fmtDate, DAYN } from '../lib/dates.js'
import { glyphOf } from '../lib/glyphs.js'
import Icon, { ICON_NAMES } from '../components/Icon.jsx'
import { t } from '../lib/i18n.js'

const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)

function DayOverride({ iso, close }) {
  const st = useStore(s => s.S)
  const wd = new Date(iso + 'T12:00:00').getDay()
  const weeklyR = st.routines.find(r => r.id === st.week[wd])
  const hasOvr = st.dayPlan[iso] !== undefined
  const effId = effectiveRoutineId(st, iso)
  const set = v => {
    update(s => setDayOverride(s, iso, v))
    close()
    toast(v === '' ? t('Back to weekly plan') : v === 'rest' ? t('{0} set to rest', fmtDate(iso)) : t('{0} planned for {1}', (st.routines.find(r => r.id === v) || {}).name, fmtDate(iso)))
  }
  return (
    <>
      <h3>{fmtDate(iso, true)}</h3>
      <div className="sheet-sub">
        {t('Weekly plan:')} {weeklyR ? weeklyR.name : t('Rest')}{hasOvr && <span className="changed-day"> · {t('changed for this day')}</span>}
        <br />
        {t('Sick, missed a day or want a different session? Pick what to train instead.')}
      </div>
      <div className="list">
        {st.routines.map(r => (
          <div key={r.id} className="item" onClick={() => set(r.id)}>
            <span className="lrow-i"><Icon name={glyphOf(r.emoji, ICON_NAMES)} /></span>
            <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
            {effId === r.id && <Icon name="check" />}
          </div>
        ))}
        <div className="item" onClick={() => set('rest')}>
          <span className="lrow-i"><Icon name="moon" /></span>
          <div className="grow"><div className="tt">{t('Rest / skip this day')}</div></div>
          {effId === null && <Icon name="check" />}
        </div>
        {hasOvr && (
          <div className="item" onClick={() => set('')}>
            <span className="lrow-i"><Icon name="reset" /></span>
            <div className="grow"><div className="tt">{t('Back to weekly plan')}</div></div>
          </div>
        )}
      </div>
    </>
  )
}
/** Opens the day-override sheet for the given date. */
export const dayOverrideSheet = iso => ui().openSheet(close => <DayOverride iso={iso} close={close} />)

function DayAssign({ day, close }) {
  const st = useStore(s => s.S)
  const set = v => { update(s => assignWeekday(s, day, v)); close() }
  return (
    <>
      <h3>{t(DAYN[day])}</h3>
      <div className="list">
        <div className="item" onClick={() => set('')}>
          <span className="lrow-i"><Icon name="moon" /></span>
          <div className="grow"><div className="tt">{t('Rest day')}</div></div>
          {!st.week[day] && <Icon name="check" />}
        </div>
        {st.routines.map(r => (
          <div key={r.id} className="item" onClick={() => set(r.id)}>
            <span className="lrow-i"><Icon name={glyphOf(r.emoji, ICON_NAMES)} /></span>
            <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
            {st.week[day] === r.id && <Icon name="check" />}
          </div>
        ))}
      </div>
    </>
  )
}
/** Opens the weekday routine assignment sheet for the given weekday index (0-6). */
export const dayAssignSheet = day => ui().openSheet(close => <DayAssign day={day} close={close} />)
