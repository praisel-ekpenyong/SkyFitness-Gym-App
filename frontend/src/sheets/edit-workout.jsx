import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { sessionView } from '../lib/active-workout.js'
import { t } from '../lib/i18n.js'
import { Thumb } from '../components/Media.jsx'
import Icon from '../components/Icon.jsx'

/** @typedef {import('../lib/types.js').Entry} Entry */

/** @type {Entry[]} */
const NO_ENTRIES = []

/**
 * One key per entry that follows its exercise when the list reorders: the exercise id, numbered when it repeats.
 * @param {Entry[]} entries
 */
function entryKeys(entries) {
  const seen = new Map()
  return entries.map(entry => {
    const n = seen.get(entry.id) ?? 0
    seen.set(entry.id, n + 1)
    return `${entry.id}:${n}`
  })
}

/**
 * Bottom sheet listing active workout entries for sequential reordering and fast navigation.
 * @param {{ close: () => void, send: (command: Object) => * }} props - `send` is the Workout view's sender, so moves run like any other command.
 */
export function ReorderExercisesSheet({ close, send }) {
  /** @type {import('../lib/types.js').ActiveWorkout | null | undefined} */
  const active = useStore(s => s.S.active)
  const entries = active?.entries ?? NO_ENTRIES
  const view = sessionView(active)
  const supersets = view.steps.filter(s => s.entries.length > 1).map(s => s.entries)
  const supersetFirst = new Set(supersets.map(s => s[0]))
  const inSuperset = new Set(supersets.flat())
  const keys = entryKeys(entries)

  /** @param {number} idx @param {-1 | 1} dir */
  const move = (idx, dir) => {
    send({ type: 'moveExercise', entry: idx, dir })
  }
  /** @param {number} idx */
  const select = idx => {
    send({ type: 'goTo', entry: idx })
    close()
  }

  return <div>
    <div className="row between">
      <h3 className="flush">{t('Reorder exercises')}</h3>
      <button className="iconbtn" onClick={close} aria-label={t('Close')}><Icon name="xmark" /></button>
    </div>
    <div className="sheet-sub">{t('Move exercises up or down, or tap to jump.')}</div>
    <div className="list">
      {entries.map((entry, idx) => {
        const ex = exOr(entry.id)
        const { done, total } = view.entryProgress[idx]
        return <div key={keys[idx]}>
          {supersetFirst.has(idx) && <div className="ss-label"><Icon name="link" />{t('Superset')}</div>}
          <div className={'item' + (inSuperset.has(idx) ? ' in-ss' : '')}>
            <button type="button" className="item-jump" aria-label={ex.n} onClick={() => select(idx)}>
              <Thumb ex={ex} />
              <div className="grow">
                <div className="tt capitalize">{ex.n}</div>
                <div className="ss">{total ? t('{0} sets', done + '/' + total) : ''}</div>
              </div>
            </button>
            <div className="item-move">
              <button className="iconbtn" aria-label={t('Move {0} up', ex.n)} disabled={idx === 0} onClick={() => move(idx, -1)}>
                <Icon name="chevronUp" />
              </button>
              <button className="iconbtn" aria-label={t('Move {0} down', ex.n)} disabled={idx === entries.length - 1} onClick={() => move(idx, 1)}>
                <Icon name="chevronDown" />
              </button>
            </div>
          </div>
        </div>
      })}
    </div>
  </div>
}

/**
 * Bottom sheet of the edits to the current step of the Active workout. Each row closes the sheet, then runs its prop.
 * @param {{ close: () => void, name: string, count: number, onReorder: () => void, onReplace: () => void, onPairPrev?: (() => void) | null, onPairNext?: (() => void) | null, onRemove: () => void }} props - `name` titles the step; `count` is the number of entries; a pair prop left out hides its row.
 */
export function EditWorkoutSheet({ close, name, count, onReorder, onReplace, onPairPrev, onPairNext, onRemove }) {
  const holding = useUI(s => !!s.work)
  /** @param {() => void} fn */
  const run = fn => () => { close(); fn() }
  return <div>
    <div className="row between">
      <h3 className="flush">{t('Edit workout')}</h3>
      <button className="iconbtn" onClick={close} aria-label={t('Close')}><Icon name="xmark" /></button>
    </div>
    <div className="sheet-sub capitalize">{name}</div>
    <div className="sect-b">
      <button className="lrow tap" disabled={holding || count < 2} onClick={run(onReorder)}>
        <span className="lrow-i"><Icon name="list" /></span><span className="lrow-m"><span className="lrow-t">{t('Reorder exercises')}</span></span>
      </button>
      <button className="lrow tap" disabled={holding} onClick={run(onReplace)}>
        <span className="lrow-i"><Icon name="shuffle" /></span><span className="lrow-m"><span className="lrow-t">{t('Replace exercise')}</span></span>
      </button>
      {onPairPrev && <button className="lrow tap" onClick={run(onPairPrev)}>
        <span className="lrow-i"><Icon name="link" /></span><span className="lrow-m"><span className="lrow-t">{t('Make superset with previous')}</span></span>
      </button>}
      {onPairNext && <button className="lrow tap" onClick={run(onPairNext)}>
        <span className="lrow-i"><Icon name="link" /></span><span className="lrow-m"><span className="lrow-t">{t('Make superset with next')}</span></span>
      </button>}
      <button className="lrow tap danger" disabled={holding} onClick={run(onRemove)}>
        <span className="lrow-i"><Icon name="trash" /></span><span className="lrow-m"><span className="lrow-t">{t('Remove exercise')}</span></span>
      </button>
    </div>
  </div>
}
