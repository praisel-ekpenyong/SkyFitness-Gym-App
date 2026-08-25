import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { EXDB, allExercises, equipmentOf } from '../lib/exercises.js'
import { FILTER_MUSCLES, MUSCLE_NAME, primaryMuscleOf, matchesMuscleFilter, isSecondaryMuscleMatch, secondaryMatchForQuery, resolveMuscleSlug, matchesExerciseSearch } from '../lib/muscles.js'
import { bestWeightFor } from '../lib/history.js'
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
  const base = allExercises(S).filter(e => {
    if (isFavFilter) {
      if (!favs.includes(e.id)) return false
    } else if (activeFilter) {
      if (!matchesMuscleFilter(e, activeFilter)) return false
    }
    return matchesExerciseSearch(e, q)
  })
  const eqOpts = equipmentOf(base)
  // Drop the equipment filter if the search narrowed it away, so you never hit a dead end.
  const eqOn = eqOpts.includes(eq) ? eq : ''
  const f = eqOn ? base.filter(e => e.eq === eqOn) : base

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
      {f.slice(0, shown).map(e => {
        const best = bestWeightFor(S, e.id)
        const isFav = favs.includes(e.id)
        const primary = primaryMuscleOf(e)
        const primaryLabel = (primary && MUSCLE_NAME[primary]) || e.tg || e.bp
        const secFilterMatch = !isFavFilter && isSecondaryMuscleMatch(e, activeFilter)
        const secQueryMatch = !activeFilter && secondaryMatchForQuery(e, q)
        const secondaryMuscle = secFilterMatch ? resolveMuscleSlug(activeFilter) : secQueryMatch
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
            className={'iconbtn' + (isFav ? ' on-ss' : '')}
            style={{ width: 34, height: 34, fontSize: 16, color: isFav ? 'var(--acc)' : 'var(--label-3)' }}
            aria-label={isFav ? t('Remove from favorites') : t('Add to favorites')}
            onClick={ev => {
              ev.stopPropagation()
              update(s => {
                const cur = s.favorites || []
                s.favorites = cur.includes(e.id) ? cur.filter(id => id !== e.id) : [...cur, e.id]
              })
            }}
          >
            <Icon name={isFav ? 'starFill' : 'star'} />
          </button>
          <Button size="sm" variant="tinted" icon="plus" onClick={ev => { ev.stopPropagation(); addToRoutineSheet(e) }}>{t('Plan')}</Button>
        </div>
      })}
      {f.length === 0 && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
    </div>
    {f.length > shown && <><div style={{ height: 10 }} /><Button onClick={() => setShown(s => s + 40)}>{t('Show more')}</Button></>}
  </>
}
