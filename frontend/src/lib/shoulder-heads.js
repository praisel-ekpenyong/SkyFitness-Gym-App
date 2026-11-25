import { isPlainShoulders } from './muscle-spelling.js'


export const PRIMARY_DELT_HEAD_IDS = {
  'front-delts': [
    '0978',
    '0997',
    '1012',
    '0041',
    '0086',
    '0087',
    '0091',
    '0100',
    '0105',
    '1456',
    '0107',
    '1457',
    '3305',
    '0128',
    '0148',
    '0161',
    '0162',
    '0164',
    '0216',
    '0219',
    '0286',
    '2137',
    '0287',
    '0290',
    '0310',
    '0309',
    '0325',
    '0361',
    '0360',
    '1700',
    '2397',
    '0387',
    '0388',
    '3546',
    '0392',
    '0405',
    '0404',
    '3548',
    '0414',
    '0419',
    '0424',
    '0426',
    '0427',
    '0438',
    '0445',
    '0520',
    '0523',
    '0527',
    '0528',
    '0537',
    '0538',
    '0539',
    '0540',
    '0543',
    '0546',
    '1438',
    '0547',
    '0550',
    '0552',
    '0553',
    '2271',
    '0587',
    '0590',
    '0603',
    '0869',
    '2318',
    '3122',
    '0747',
    '0765',
    '0766',
    '0772',
    '0774',
    '0788',
    '0834',
    '3641',
  ],
  'side-delts': [
    '0977',
    '1017',
    '0067',
    '0120',
    '0119',
    '0121',
    '0123',
    '0178',
    '0192',
    '0246',
    '0311',
    '0323',
    '0332',
    '0334',
    '0335',
    '0355',
    '0356',
    '0363',
    '0376',
    '2317',
    '0396',
    '0395',
    '0408',
    '0415',
    '2143',
    '0437',
    '1765',
    '0529',
    '0542',
    '3237',
    '0584',
    '0775',
  ],
  'rear-delts': [
    '0993',
    '1022',
    '0075',
    '0076',
    '0154',
    '3697',
    '0202',
    '0203',
    '0215',
    '0225',
    '0233',
    '0235',
    '0240',
    '0299',
    '2136',
    '0326',
    '3542',
    '0863',
    '2470',
    '0341',
    '0345',
    '0348',
    '0359',
    '2292',
    '0377',
    '0378',
    '0380',
    '0379',
    '0383',
    '0386',
    '0864',
    '0602',
    '0601',
    '0669',
    '0762',
    '1328',
    '0844',
  ],
}

/** @typedef {import('./types.js').CustomExercise} CustomExercise */

/** @type {Record<string, string>} */
export const ASSIST_DELT_HEAD_BY_TARGET = {
  'upper back': 'rear-delts',
  lats: 'rear-delts',
  traps: 'side-delts',
}
export const DEFAULT_ASSIST_DELT_HEAD = 'front-delts'

/** @type {Record<string, string>} */
export const ASSIST_DELT_HEAD_IDS = {
  '0022': 'front-delts',
  '0139': 'rear-delts',
  '0140': 'rear-delts',
  '0232': 'rear-delts',
}

/** @type {Record<string, string>} */
const HEAD_OF_ID = {}
for (const [head, ids] of Object.entries(PRIMARY_DELT_HEAD_IDS)) ids.forEach(id => { HEAD_OF_ID[id] = head })

/**
 * Rewrites a catalogue exercise's plain shoulder tags onto the heads it trains.
 * @param {CustomExercise} ex - Catalogue exercise (already curated).
 * @returns {CustomExercise} The same exercise, or a copy naming head slugs instead of plain shoulders.
 */
export function withShoulderHeads(ex) {
  const primaryHead = HEAD_OF_ID[ex.id]
  const assistHead = ASSIST_DELT_HEAD_IDS[ex.id] || (ex.tg ? ASSIST_DELT_HEAD_BY_TARGET[ex.tg] : undefined) || DEFAULT_ASSIST_DELT_HEAD
  /** @param {string | undefined} name */
  const read = name => isPlainShoulders(name) ? assistHead : name
  const names = [ex.mg, ...(Array.isArray(ex.sm) ? ex.sm : [])]
  if (!primaryHead && !names.some(n => read(n) !== n)) return ex
  return {
    ...ex,
    tg: primaryHead || ex.tg,
    mg: ex.mg == null ? ex.mg : read(ex.mg),
    sm: Array.isArray(ex.sm) ? [...new Set(ex.sm.map(n => read(n) ?? n))] : ex.sm,
  }
}
