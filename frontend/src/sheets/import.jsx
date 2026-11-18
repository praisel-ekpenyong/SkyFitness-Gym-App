import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { parseImport, mergeImport, importPreview } from '../lib/import-csv.js'
import { effortOf } from '../lib/effort.js'
import { fmtNum } from '../lib/format.js'
import { fmtDate } from '../lib/dates.js'
import { Button } from '../components/ui.jsx'
import { t } from '../lib/i18n.js'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)

export function ImportSummary({ parsed, close }) {
  const st = useStore(s => s.S)
  const { added: fresh, skipped: have } = importPreview(st, parsed)
  const isBW = parsed.kind === 'bodyweight'

  const doImport = () => {
    let res
    update(s => { res = mergeImport(s, parsed) })
    close()
    toast(isBW
      ? t('{0} weigh-ins imported', fmtNum(res.added))
      : t('{0} workouts imported', fmtNum(res.added)))
  }

  return (
    <>
      <h3>{parsed.source ? t('Import from {0}', parsed.source) : t('Import history')}</h3>
      <div className="sheet-sub">
        {parsed.from === parsed.to ? fmtDate(parsed.from, true) : t('{0} – {1}', fmtDate(parsed.from, true), fmtDate(parsed.to, true))}
      </div>

      <div className="tiles">
        {isBW ? (
          <>
            <div className="tile"><div className="l">{t('Weigh-ins')}</div><div className="v">{fmtNum(parsed.bodyweight.length)}</div></div>
            <div className="tile"><div className="l">{t('New')}</div><div className="v">{fmtNum(fresh)}</div></div>
          </>
        ) : (
          <>
            <div className="tile"><div className="l">{t('Workouts')}</div><div className="v">{fmtNum(parsed.workouts.length)}</div></div>
            <div className="tile"><div className="l">{t('Sets')}</div><div className="v">{fmtNum(parsed.sets)}</div></div>
            <div className="tile"><div className="l">{t('Exercises matched')}</div><div className="v">{fmtNum(parsed.matched)}</div></div>
            <div className="tile"><div className="l">{t('Added as your own')}</div><div className="v">{fmtNum(parsed.created)}</div></div>
          </>
        )}
      </div>

      {parsed.mixedUnits ? (
        <div className="warn-note">
          {t('The file mixes kg and lb — each set is converted to {0}.', st.unit)}
        </div>
      ) : parsed.converted ? (
        <div className="warn-note">
          {t('The file is in {0} and your profile is in {1} — weights will be converted.', parsed.fileUnit, st.unit)}
        </div>
      ) : null}
      {!isBW && !parsed.fileUnit && !parsed.mixedUnits && (
        <div className="dim-note small dim">
          {t('The file does not say which unit it uses — numbers are imported as they are.')}
        </div>
      )}
      {have > 0 && (
        <div className="dim-note small dim">
          {t('{0} days already have data here and will be left alone.', fmtNum(have))}
        </div>
      )}
      {!isBW && (parsed.rirSets + parsed.rpeSets) > 0 && (
        <div className="dim-note small dim">
          {t(effortOf(st) === 'none'
            ? '{0} sets bring an {1} with them — switch on Effort per set in Settings to see it.'
            : '{0} sets bring an {1} with them.',
          parsed.rirSets || parsed.rpeSets, parsed.rirSets ? 'RIR' : 'RPE')}
        </div>
      )}
      {!isBW && parsed.unmatchedNames.length > 0 && (
        <>
          <h4 className="sec">{t('Not in the library — added as your own exercises')}</h4>
          <div className="mchips import-names">
            {parsed.unmatchedNames.slice(0, 12).map(n => <span key={n} className="mchip capitalize">{n}</span>)}
            {parsed.unmatchedNames.length > 12 && <span className="mchip">+{parsed.unmatchedNames.length - 12}</span>}
          </div>
        </>
      )}

      <Button variant="primary" onClick={doImport} disabled={!fresh}>
        {fresh ? t('Import') : t('Nothing new to import')}
      </Button>
      <div className="gap8" />
      <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
    </>
  )
}

/** Read a CSV/XML export, then show what it would do. */
export function importFromApp(file, onDone) {
  const rd = new FileReader()
  rd.onload = () => {
    let parsed
    try { parsed = parseImport(String(rd.result), { unit: S().unit }) }
    catch (e) { toast(t('Could not read that file')); return }
    if (parsed.error === 'empty') { toast(t('That file is empty')); return }
    if (parsed.error) { toast(t("That file's columns aren't recognised — see the docs for supported apps.")); return }
    if (parsed.kind === 'bodyweight' ? !parsed.bodyweight.length : !parsed.workouts.length) {
      toast(t('Nothing to import from that file')); return
    }
    ui().openSheet(close => <ImportSummary parsed={parsed} close={close} />)
    onDone && onDone()
  }
  rd.onerror = () => toast(t('Could not read that file'))
  rd.readAsText(file)
}
