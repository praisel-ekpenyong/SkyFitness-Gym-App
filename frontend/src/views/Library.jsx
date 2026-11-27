import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { EXDB } from '../lib/exercises.js'
import { FILTER_MUSCLES, MUSCLE_NAME } from '../lib/muscles.js'
import { queryCatalogue } from '../lib/catalogue-query.js'
import { best as bestOf } from '../lib/training-log.js'
import { fmtNum, sentenceCase } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { toggleFavorite } from '../lib/catalogue-writes.js'
import { Thumb } from '../components/Media.jsx'
import { exerciseDetailSheet, addToRoutineSheet, customExSheet } from '../sheets/catalogue.jsx'
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
    ownFirst: true,
  }), [S, scope, q, eq, isFavFilter])
  return <div className="page">
    <div className="hdr"><div><h1>{t('Exercises')}</h1><div className="sub">{t('{0} exercises with animations', fmtNum(EXDB.length))}</div></div></div>
    <SearchField
      className="lib-search"
      placeholder={t('Search…')}
      aria-label={t('Search exercises')}
      value={q}
      onChange={e => { setQ(e.target.value); setShown(40) }}
      onClear={() => { setQ(''); setShown(40) }}
    />
    <div className="chips lib-chips">
      {favs.length > 0 && <button className={'chip chip-i' + (activeFilter === 'favorites' ? ' on' : '')} aria-pressed={activeFilter === 'favorites'} onClick={() => { setFilter('favorites'); setEq(''); setShown(40) }}><Icon name="starFill" />{t('Favorites')} ({fmtNum(favs.length)})</button>}
      <button className={'chip nocap' + (!activeFilter ? ' on' : '')} aria-pressed={!activeFilter} onClick={() => { setFilter(''); setEq(''); setShown(40) }}>{t('All')}</button>
      {FILTER_MUSCLES.map(m => <button key={m} className={'chip nocap' + (activeFilter === m ? ' on' : '')} aria-pressed={activeFilter === m} onClick={() => { setFilter(m); setEq(''); setShown(40) }}>{sentenceCase(t(MUSCLE_NAME[m] || m))}</button>)}
    </div>
    {eqOpts.length > 1 && <div className="chips lib-chips">
      <button className={'chip nocap' + (!eqOn ? ' on' : '')} aria-pressed={!eqOn} onClick={() => { setEq(''); setShown(40) }}>{t('Any equipment')}</button>
      {eqOpts.map(x => <button key={x} className={'chip nocap' + (eqOn === x ? ' on' : '')} aria-pressed={eqOn === x} onClick={() => { setEq(x); setShown(40) }}>{sentenceCase(t(x))}</button>)}
    </div>}
    <div className="list ex-grid">
      <div className="item ex-create" role="button" tabIndex={0} onClick={() => customExSheet(null, ex => exerciseDetailSheet(ex), q.trim())}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); customExSheet(null, ex => exerciseDetailSheet(ex), q.trim()) } }}>
        <div className="thumb thumb-x"><Icon name="plus" /></div>
        <div className="grow"><div className="tt">{t('Create your own exercise')}</div><div className="ss">{t('Name it and choose a primary muscle; secondary muscles are optional. No animation.')}</div></div>
      </div>
      {rows.slice(0, shown).map(row => {
        const e = row.exercise
        const best = bestOf(S, e.id)
        const primary = row.primaryMuscle
        const primaryLabel = (primary && MUSCLE_NAME[primary]) || e.tg || e.bp
        const secondaryMuscle = row.secondaryMatch
        return <div key={e.id} className="item ex-tile" role="button" tabIndex={0} aria-label={e.n} onClick={() => exerciseDetailSheet(e)}
          onKeyDown={ev => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); exerciseDetailSheet(e) } }}>
          <Thumb ex={e} />
          <button
            className={'iconbtn bare ex-star' + (row.favorite ? ' on-ss' : '')}
            aria-label={row.favorite ? t('Remove from favorites') : t('Add to favorites')}
            onClick={ev => {
              ev.stopPropagation()
              update(s => { toggleFavorite(s, e.id) })
            }}
          >
            <Icon name={row.favorite ? 'starFill' : 'star'} />
          </button>
          <div className="grow">
            <div className="tt capitalize">{e.n}</div>
            <div className="ss">
              {sentenceCase(t(primaryLabel))} · {sentenceCase(t(e.eq))}
              {secondaryMuscle && <span className="tag">{t('Secondary: {0}', MUSCLE_NAME[secondaryMuscle] || secondaryMuscle)}</span>}
            </div>
          </div>
          <div className="ex-foot">
            {best > 0 ? <span className="ex-best-v">{fmtNum(best)} <span className="u">{S.unit}</span></span> : <span />}
            <Button size="sm" variant="ghost" icon="plus" onClick={ev => { ev.stopPropagation(); addToRoutineSheet(e) }}>{t('Add to a routine')}</Button>
          </div>
        </div>
      })}
      {rows.length === 0 && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
    </div>
    {rows.length > shown && <><div className="gap12" /><Button onClick={() => setShown(s => s + 40)}>{t('Show more')}</Button></>}
  </div>
}
