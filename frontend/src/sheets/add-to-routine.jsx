import { useStore } from '../store/useStore.js'
import { exCount } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { nav } from '../platform/nav.js'
import Icon, { ICON_NAMES } from '../components/Icon.jsx'
import { glyphOf } from '../lib/glyphs.js'
import { exConfigSheet } from './exercise-config.jsx'
import { ui, toast } from './store-helpers.js'

function AddToRoutine({ ex, close }) {
  const st = useStore(s => s.S)
  const pick = rid => {
    close()
    const isNew = rid === '_new'
    exConfigSheet(ex, { onSave: cfg => {
      let targetRoutineId = rid
      let routineName = t('routine')
      if (isNew) {
        const createRes = useStore.getState().actRoutine({ type: 'create' })
        if (createRes.ok && createRes.result) {
          targetRoutineId = createRes.result.id
          routineName = createRes.result.name
        }
      } else {
        const r = st.routines.find(x => x.id === rid)
        if (r) routineName = r.name
      }
      useStore.getState().actRoutine({
        type: 'addExercise',
        routineId: targetRoutineId,
        exId: ex.id,
        target: cfg,
      })
      toast(t('“{0}” added to {1}', ex.n, routineName))
      if (isNew && targetRoutineId) nav('/plan/r/' + targetRoutineId)
    }, routine: isNew ? null : st.routines.find(x => x.id === rid) })
  }
  return <>
    <h3>{t('Add “{0}”', ex.n)}</h3>
    <div className="sheet-sub">{t('Pick a routine — sets, reps and weight come next.')}</div>
    <div className="list">
      {st.routines.map(r => <div key={r.id} className="item" onClick={() => pick(r.id)}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji, ICON_NAMES)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        {r.ex.some(e => e.id === ex.id) && <span className="tag">{t('already in')}</span>}<Icon name="plus" className="chev" />
      </div>)}
      <div className="item" onClick={() => pick('_new')}><span className="lrow-i"><Icon name="sparkles" /></span>
        <div className="grow"><div className="tt">{t('New routine')}</div><div className="ss">{t('Create one and start with this exercise')}</div></div><Icon name="plus" className="chev" /></div>
    </div>
  </>
}
/** Opens the add-to-routine picker for the given exercise. */
export const addToRoutineSheet = ex => ui().openSheet(close => <AddToRoutine ex={ex} close={close} />)
