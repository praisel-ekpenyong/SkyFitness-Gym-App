import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { EXDB } from '../lib/exercises.js'
import { FILTER_MUSCLES, MUSCLE_NAME } from '../lib/muscles.js'
import { queryCatalogue } from '../lib/catalogue-query.js'
import { bestWeightForEntry } from '../lib/workout-model.js'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { Thumb } from '../components/Media.jsx'
import { exerciseDetailSheet, addToRoutineSheet, customExSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, SearchField } from '../components/ui.jsx'

export default function Library() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')
  const [eq, setEq] = useState('')
  const [shown, setShown] = useState(40)
  const favs = S.favorites || []
  // If the user unstars their last favorite while on the Favorites filter,
  // gracefully fall back to All ('') so they aren't trapped in an empty state.
  const activeFilter = (filter === 'favorites' && favs.length === 0) ? '' : filter
  const isFavFilter = activeFilter === 'favorites'
  const scope = useMemo(() => isFavFilter
    ? { kind: 'favorites' }
    : activeFilter ? { kind: 'muscle', muscle: activeFilter } : { kind: 'all' }, [isFavFilter, activeFilter])
  const { rows, equipmentOptions: eqOpts, effectiveEquipment: eqOn } = useMemo(() => queryCatalogue({
    profile: S,
    scope,
    search: q,
    equipment: eq,
    searchAttribution: !isFavFilter,
  }), [S.customEx, S.favorites, S.routines, S.workouts, scope, q, eq])
  const f = rows
  const bestMap = useMemo(() => {
    const m = new Map()
    for (const w of S.workouts || []) {
      for (const e of w.entries || []) {
        const cur = m.get(e.id) || 0
        const best = bestWeightForEntry(e)
        if (best > cur) m.set(e.id, best)
      }
    }
    return m
  }, [S.workouts])

  return <>
    <div className="hdr"><div><h1>{t('Exercises')}</h1><div className="sub">{t('{0} exercises with animations', EXDB.length)}</div></div></div>
    <SearchField
      style={{ marginBottom: 10 }}
      placeholder={t('Search…')}
      value={q}
      onChange={e => { setQ(e.target.value); setShown(40) }}
      onClear={() => { setQ(''); setShown(40) }}
    />
    <div className="chips" style={{ marginBottom: eqOpts.length > 1 ? 8 : 12 }}>
      {favs.length > 0 && <button className={'chip' + (activeFilter === 'favorites' ? ' on' : '')} onClick={() => { setFilter('favorites'); setEq(''); setShown(40) }}><Icon name="starFill" style={{ fontSize: 12, display: 'inline-block', marginRight: 4, verticalAlign: '-1px' }} />{t('Favorites')} ({favs.length})</button>}
      <button className={'chip nocap' + (!activeFilter ? ' on' : '')} onClick={() => { setFilter(''); setEq(''); setShown(40) }}>{t('All')}</button>
      {FILTER_MUSCLES.map(m => <button key={m} className={'chip' + (activeFilter === m ? ' on' : '')} onClick={() => { setFilter(m); setEq(''); setShown(40) }}>{t(MUSCLE_NAME[m] || m)}</button>)}
    </div>
    {eqOpts.length > 1 && <div className="chips" style={{ marginBottom: 12 }}>
      <button className={'chip nocap' + (!eqOn ? ' on' : '')} onClick={() => { setEq(''); setShown(40) }}>{t('Any equipment')}</button>
      {eqOpts.map(x => <button key={x} className={'chip' + (eqOn === x ? ' on' : '')} onClick={() => { setEq(x); setShown(40) }}>{t(x)}</button>)}
    </div>}
    <div className="list">
      <div className="item" onClick={() => customExSheet(null, ex => exerciseDetailSheet(ex), q.trim())}>
        <div className="thumb thumb-x"><Icon name="sparkles" /></div>
        <div className="grow"><div className="tt">{t('Create your own exercise')}</div><div className="ss">{t('name + target muscles, no animation')}</div></div><Icon name="plus" className="chev" />
      </div>
      {f.slice(0, shown).map(row => {
        const e = row.exercise
        const best = bestMap.get(e.id) || 0
        const primary = row.primaryMuscle
        const primaryLabel = (primary && MUSCLE_NAME[primary]) || e.tg || e.bp
        const secondaryMuscle = row.secondaryMatch
        return <div key={e.id} className="item" onClick={() => exerciseDetailSheet(e)}>
          <Thumb ex={e} />
          <div className="grow">
            <div className="tt capitalize">{e.n}</div>
            <div className="ss capitalize">
              {t(primaryLabel)} · {t(e.eq)}
              {secondaryMuscle && <span className="tag" style={{ marginLeft: 6, fontSize: 11, padding: '1px 5px', verticalAlign: 'middle' }}>{t('Secondary: {0}', MUSCLE_NAME[secondaryMuscle] || secondaryMuscle)}</span>}
            </div>
          </div>
          {best > 0 && <span className="tag acc">{fmtNum(best)}</span>}
          <button
            className={'iconbtn' + (row.favorite ? ' on-ss' : '')}
            style={{ width: 34, height: 34, fontSize: 16, color: row.favorite ? 'var(--acc)' : 'var(--label-3)' }}
            aria-label={row.favorite ? t('Remove from favorites') : t('Add to favorites')}
            onClick={ev => {
              ev.stopPropagation()
              update(s => {
                const cur = s.favorites || []
                s.favorites = cur.includes(e.id) ? cur.filter(id => id !== e.id) : [...cur, e.id]
              })
            }}
          >
            <Icon name={row.favorite ? 'starFill' : 'star'} />
          </button>
          <Button size="sm" variant="tinted" icon="plus" onClick={ev => { ev.stopPropagation(); addToRoutineSheet(e) }}>{t('Plan')}</Button>
        </div>
      })}
      {f.length === 0 && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
    </div>
    {f.length > shown && <><div style={{ height: 10 }} /><Button onClick={() => setShown(s => s + 40)}>{t('Show more')}</Button></>}
  </>
}
