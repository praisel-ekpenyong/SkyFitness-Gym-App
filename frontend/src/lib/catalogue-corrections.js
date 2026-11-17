/**
 * Movement-pattern corrections to the upstream catalogue (ADR 0012, ADR 0024).
 *
 * Each pattern names the curation it applies and the hand-reviewed catalogue
 * ids it applies to. Name patterns only proposed these ids; every id was read
 * and checked. Combination moves and misfires are left out on purpose and
 * keep their catalogue tags. No name matching happens at runtime.
 *
 * Curation fields (spelled the way the catalogue spells muscles):
 * - `tg`: overrides the primary target.
 * - `smAdd`: secondary muscles to add.
 * - `smRemove`: secondary muscles to drop, from `sm` and from `mg`.
 */

const KNEE_DOMINANT = {
  tg: 'quads',
  smAdd: ['glutes', 'adductors'],
  smRemove: ['quadriceps', 'hamstrings', 'calves', 'core'],
}

// Excluded on review, keeping catalogue tags:
// - combination moves: 2798 squat jump step rear lunge, 1003 band squat row,
//   0551 turkish get up, 0786 squat jerk, 1685/1686 squat to overhead reach,
//   3644 lunge with swing, 1417 diagonal kick hamstring curl, curl/press
//   combos (1644, 1655, 1651, 1658, 1684, 1732), thrusters (3305, 0550);
// - not the pattern: 0102 squat on knees and 1420 kneeling jump squat (hip
//   dominant), 1489/0851 sissy squats (quad isolation, already quads), 3119
//   potty squat (abs), 3222 semi squat jump and 3655 high knees lunge
//   (cardio), 1688 lunge with twist (waist), squatting rows (3168, 3167,
//   1717), RDL family (ADR 0012) and 0116/1010 straight-leg deadlifts;
// - "extension" misfires: hip and reverse-hyper extensions (0980, 0130,
//   0228, 2286, 0593, 0675), triceps extensions (ticket 04);
// - calf stretches (1377, 1378, 1390, 1398, 1407, 1599) and tibialis work
//   (1396 toe raise, 1000/0763/1394 reverse calf raises).
export const LOWER_BODY_CORRECTIONS = [
  {
    pattern: 'squat, hack squat, front squat',
    ...KNEE_DOMINANT,
    ids: [
      '1004', '0024', '0026', '0029', '0039', '0042', '0043', '1461', '1462',
      '1545', '0046', '1436', '0051', '0053', '1435', '0063', '0068', '0069',
      '0101', '0124', '0127', '3543', '0291', '0371', '0411', '0413', '1760',
      '2803', '3194', '0514', '0513', '0533', '0534', '0544', '1476', '3132',
      '1759', '0741', '0743', '0744', '0750', '1433', '3281', '0755', '1434',
      '0770', '3142', '1705', '0852',
    ],
  },
  {
    pattern: 'leg press',
    ...KNEE_DOMINANT,
    ids: ['2287', '2611', '1425', '0739', '1464', '1463', '0740', '0760'],
  },
  {
    pattern: 'lunge, split squat, step-up',
    ...KNEE_DOMINANT,
    ids: [
      '0987', '1001', '0098', '0097', '0099', '2810', '0410', '2812', '0768',
      '2368', '0809', '3769', '3643', '1008', '0114', '0431', '1410', '0054',
      '0078', '0077', '3635', '0336', '0381', '2796', '3470', '0536', '3582',
      '0769', '1460', '3642',
    ],
  },
  {
    pattern: 'hip thrust, glute bridge',
    tg: 'glutes',
    smAdd: ['hamstrings'],
    smRemove: ['quadriceps', 'lower back', 'core'],
    ids: ['1409', '3562', '3561', '3523', '3013', '1422', '0668', '3236', '3645'],
  },
  {
    pattern: 'deadlift, rack pull',
    tg: 'glutes',
    smAdd: ['hamstrings', 'lower back', 'quadriceps', 'traps', 'forearms'],
    ids: ['0032', '0074', '0300', '0578', '0752', '0811', '0117', '0157', '0066'],
  },
  {
    pattern: 'leg curl',
    tg: 'hamstrings',
    smAdd: ['calves'],
    smRemove: ['glutes'],
    ids: [
      '3235', '0496', '2400', '0582', '0586', '3195', '0599', '0697', '1766',
      '0696', '0795',
    ],
  },
  {
    pattern: 'leg extension',
    tg: 'quads',
    smRemove: ['hamstrings'],
    ids: ['0585', '3007'],
  },
  {
    pattern: 'calf raise',
    tg: 'calves',
    smRemove: ['hamstrings', 'glutes', 'quadriceps'],
    ids: [
      '0999', '1369', '1370', '0088', '1371', '1372', '0108', '0111', '1373',
      '1375', '1376', '0284', '1379', '0400', '1380', '1381', '0409', '0417',
      '1382', '3241', '3240', '1383', '1384', '2289', '1253', '2315', '2335',
      '0594', '1385', '0605', '1386', '1387', '0727', '0738', '1391', '0742',
      '2334', '1392', '1393', '1395', '0773', '1490', '0833',
    ],
  },
  {
    pattern: 'back extension',
    smAdd: ['glutes', 'hamstrings'],
    ids: ['1314', '1333', '1334', '1335', '1336', '0489', '0488', '0573', '0835'],
  },
]

/**
 * Flattens pattern lists into the id-keyed overlay the catalogue index reads.
 * @param {Object[]} patterns - Pattern entries with `ids` and curation fields.
 * @param {Object} [base] - Hand-written curations to merge with; an id may appear once overall.
 * @returns {Object} Map of catalogue id to `{ tg?, smAdd?, smRemove? }`.
 */
export function curationsByIdOf(patterns, base = {}) {
  const out = { ...base }
  for (const { ids, pattern, ...curation } of patterns) {
    for (const id of ids) {
      if (out[id]) throw new Error(`catalogue id ${id} is curated twice (${pattern})`)
      out[id] = curation
    }
  }
  return out
}
