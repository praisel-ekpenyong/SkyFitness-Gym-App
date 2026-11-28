import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { fmtNum, sentenceCase } from '../lib/format.js'
import * as catalogueWrites from '../lib/catalogue-writes.js'
import { t } from '../lib/i18n.js'
import { Thumb } from '../components/Media.jsx'
import Icon from '../components/Icon.jsx'
import { Button, SearchField } from '../components/ui.jsx'
import { FILTER_MUSCLES, MUSCLE_NAME } from '../lib/muscles.js'
import { queryCatalogue } from '../lib/catalogue-query.js'
import { customExSheet } from './custom-exercise.jsx'
import { update, ui } from './store-helpers.js'

export function ExercisePicker({ onPick }) {
  const st = useStore(s => s.S)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')
  const [eq, setEq] = useState('')
  const [shown, setShown] = useState(50)
  const isFavFilter = filter === 'favorites'
  const isChosenFilter = filter === '★'
  const scope = isFavFilter
    ? { kind: 'favorites' }
    : isChosenFilter ? { kind: 'chosen' }
      : filter ? { kind: 'muscle', muscle: filter } : { kind: 'all' }
  const { rows, equipmentOptions: eqOpts, effectiveEquipment: eqOn, favoriteCount: favCount, chosenCount, catalogueCount } = queryCatalogue({
    profile: st,
    scope,
    search: q,
    equipment: eq,
    ownFirst: true,
  })
  const f = rows
  return <>
    <h3>{t('Add exercise')}</h3>
    <SearchField
      placeholder={t('Search {0} exercises…', fmtNum(catalogueCount))}
      aria-label={t('Search exercises')}
      value={q}
      onChange={e => { setQ(e.target.value); setShown(50) }}
      onClear={() => { setQ(''); setShown(50) }}
    />
    <div className="chips picker-chips">
      {(favCount > 0 || filter === 'favorites') && <button className={'chip chip-i' + (filter === 'favorites' ? ' on' : '')} aria-pressed={filter === 'favorites'} onClick={() => { setFilter('favorites'); setEq(''); setShown(50) }}><Icon name="starFill" />{t('Favorites')} ({fmtNum(favCount)})</button>}
      {(chosenCount > 0 || filter === '★') && <button className={'chip chip-i' + (filter === '★' ? ' on' : '')} aria-pressed={filter === '★'} onClick={() => { setFilter('★'); setEq(''); setShown(50) }}><Icon name="check" />{t('Chosen')} ({fmtNum(chosenCount)})</button>}
      <button className={'chip nocap' + (!filter ? ' on' : '')} aria-pressed={!filter} onClick={() => { setFilter(''); setEq(''); setShown(50) }}>{t('All')}</button>
      {FILTER_MUSCLES.map(m => <button key={m} className={'chip nocap' + (filter === m ? ' on' : '')} aria-pressed={filter === m} onClick={() => { setFilter(m); setEq(''); setShown(50) }}>{sentenceCase(t(MUSCLE_NAME[m] || m))}</button>)}
    </div>
    {eqOpts.length > 1 && <div className="chips picker-chips">
      <button className={'chip nocap' + (!eqOn ? ' on' : '')} aria-pressed={!eqOn} onClick={() => { setEq(''); setShown(50) }}>{t('Any equipment')}</button>
      {eqOpts.map(x => <button key={x} className={'chip nocap' + (eqOn === x ? ' on' : '')} aria-pressed={eqOn === x} onClick={() => { setEq(x); setShown(50) }}>{sentenceCase(t(x))}</button>)}
    </div>}
    <div className="list">
      {filter !== '★' && <div className="item" role="button" tabIndex={0} onClick={() => customExSheet(null, ex => onPick(ex), q.trim())}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); customExSheet(null, ex => onPick(ex), q.trim()) } }}>
        <div className="thumb thumb-x"><Icon name="plus" /></div>
        <div className="grow"><div className="tt">{t('Create your own exercise')}</div><div className="ss">{t('Name it and choose a primary muscle; secondary muscles are optional. No animation.')}</div></div>
      </div>}
      {f.slice(0, shown).map(row => {
        const e = row.exercise
        const primary = row.primaryMuscle
        const primaryLabel = (primary && MUSCLE_NAME[primary]) || e.tg || e.bp
        const secondaryMuscle = row.secondaryMatch
        return <div key={e.id} className="item" role="button" tabIndex={0} aria-label={e.n} onClick={() => onPick(e)}
          onKeyDown={ev => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); onPick(e) } }}>
          <Thumb ex={e} />
          <div className="grow">
            <div className="tt capitalize">{e.n}</div>
            <div className="ss">
              {sentenceCase(t(primaryLabel))} · {sentenceCase(t(e.eq))}
              {secondaryMuscle && <span className="tag inline-tag">{t('Secondary: {0}', MUSCLE_NAME[secondaryMuscle] || secondaryMuscle)}</span>}
            </div>
          </div>
          <button
            className={'iconbtn bare' + (row.favorite ? ' on-ss' : '')}
            aria-label={row.favorite ? t('Remove from favorites') : t('Add to favorites')}
            onClick={ev => {
              ev.stopPropagation()
              update(s => { catalogueWrites.toggleFavorite(s, e.id) })
            }}
          >
            <Icon name={row.favorite ? 'starFill' : 'star'} />
          </button>
          <Icon name="plus" className="chev" />
        </div>
      })}
      {f.length === 0 && filter === 'favorites' && favCount === 0 && <div className="empty">{t('No favorites yet — star exercises and they’ll show up here.')}</div>}
      {f.length === 0 && filter === '★' && chosenCount === 0 && <div className="empty">{t('Nothing chosen yet — add exercises and they’ll show up here.')}</div>}
      {f.length === 0 && (filter !== 'favorites' || favCount > 0) && (filter !== '★' || chosenCount > 0) && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
    </div>
    {f.length > shown && <><div className="gap8" /><Button onClick={() => setShown(s => s + 50)}>{t('Show more')}</Button></>}
  </>
}
export const exercisePicker = onPick => ui().openSheet(close => <ExercisePicker onPick={onPick} close={close} />)
