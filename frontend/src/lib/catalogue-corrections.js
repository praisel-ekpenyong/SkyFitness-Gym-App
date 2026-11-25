/**
 * Movement-pattern corrections to the upstream catalogue (ADR 0012, ADR 0025).
 *
 * The pinned catalogue (`exercises-data.js`, never edited) mis-tags whole
 * movement patterns. Squats, hack squats and leg presses are glutes-primary
 * with quads at 0.4, so twelve squat sets read as 4.8 quad sets. Most hip
 * hinges are glutes-primary too. Calf raises credit hamstrings, leg curls
 * credit glutes and leg extensions credit hamstrings. `exercises.js` applies
 * these lists as an overlay when it builds the catalogue index; catalogue
 * exercises are read live, so past workouts re-read through them with no
 * migration. Custom exercises keep the muscles the lifter picked.
 *
 * Each pattern names the curation it applies and the hand-reviewed catalogue
 * ids it applies to. Name patterns only proposed these ids; every id was read
 * and checked. Combination moves and misfires are left out on purpose and
 * keep their catalogue tags; each table lists its exclusions above it. No name
 * matching happens at runtime. An id may be curated once: `curationsByIdOf`
 * throws on a second.
 *
 * Curation fields (spelled the way the catalogue spells muscles):
 * - `tg`: overrides the primary target.
 * - `smAdd`: secondary muscles to add.
 * - `smRemove`: secondary muscles to drop, from `sm` and from `mg`.
 *
 * Upper-body and core patterns apply their row in full: the primary, every
 * listed secondary, and removal of every other secondary the reviewed ids
 * carry. So sit-ups lose hip flexors, pull-ups lose forearms and front raises
 * keep no secondary.
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
//   1717), RDL family (its own pattern below) and 0116/1010 straight-leg
//   deadlifts;
// - "extension" misfires: hip and reverse-hyper extensions (0980, 0130,
//   0228, 2286, 0593, 0675), triceps extensions (the upper-body
//   'triceps extension' pattern owns them);
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
    // Hamstring hinges (ADR 0012). The RDL and stiff-leg deadlift load the
    // hamstrings in a long, stretched position and are programmed as hamstring
    // builders, but upstream tags most of them glutes-primary, and splits one
    // movement by implement: barbell straight-leg deadlift 0116 is hamstrings,
    // dumbbell stiff-leg 0432 glutes. Glutes join as a secondary and the
    // catalogue's lower back stays the third, so four sets credit hamstrings 4,
    // glutes 1.6 and lower back 1.6. A full set to all three was rejected: the
    // lower back holds the spine still, and full sets for a stabiliser overstate
    // its volume.
    pattern: 'RDL, stiff-leg, good morning',
    tg: 'hamstrings',
    smAdd: ['glutes'],
    ids: ['0085', '1459', '0432', '0434', '1009', '1023', '1756', '1757', '2805', '0115'],
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
 * @param {Array<{ pattern: string, ids: string[], tg?: string, smAdd?: string[], smRemove?: string[] }>} patterns - Pattern entries with `ids` and curation fields.
 * @returns {Record<string, { tg?: string, smAdd?: string[], smRemove?: string[] }>} Map of catalogue id to `{ tg?, smAdd?, smRemove? }`.
 * @throws {Error} When one catalogue id appears in two patterns.
 */
export function curationsByIdOf(patterns) {
  /** @type {Record<string, { tg?: string, smAdd?: string[], smRemove?: string[] }>} */
  const out = {}
  for (const { ids, pattern, ...curation } of patterns) {
    for (const id of ids) {
      if (out[id]) throw new Error(`catalogue id ${id} is curated twice (${pattern})`)
      out[id] = curation
    }
  }
  return out
}

// Shoulder heads: removals spell the catalogue's plain "shoulders" (heads
// replace it after removals run, ADR 0024); additions name a head the way the
// catalogue does, as "front/side/rear deltoids". These patterns never set a
// head as the primary: the delt-head patterns below keep their ids for the
// secondary changes only, and `PRIMARY_DELT_HEAD_IDS` in shoulder-heads.js
// owns every primary head.
const DELTS_ASSIST = ['shoulders', 'deltoids']

// Excluded on review, keeping catalogue tags:
// - combination moves: muscle-ups (0558, 0631, 1401, 3286, 3312), 0022
//   pullover to press, 0040 front raise and pullover, 1294 pullover hip
//   extension, 1638 pulldown bicep curl, squatting and twisting rows (3168,
//   3167, 1717, 1003, 0990, 0236), 0521 renegade row, twisting presses (0989,
//   1012), jerks, thrusters and cleans, curl combos (1644, 1655, 1651, 1658,
//   1684, 3547, 3560), 1732 lunge triceps extension, 0035 close grip to skull
//   press, plank combos (0464, 0664, 3239, 3664, 3665), twisting leg raises
//   (0476, 2801, 2802), throw-down leg raises (0010, 0012, 0013), sit-ups
//   with a press (0071, 0992);
// - not the pattern: biceps-tagged pull-ups (0139, 0140) and 0232 standing
//   pulldown, 0688 scapular pull-up, straight-arm pulldowns and pushdowns
//   (0237, 0238, 0199, 0172), 2464 kayak row, shoulder rotations (0216, 0235,
//   0863, 0864), Cuban presses (0299, 2136), 3541 y-raise, 0669 and other
//   stretches, ambiguous raises (0977, 0335, 0376, 0415, 0325, 1017, 0332),
//   0286 side press, 0438 w-press, 0445 anti gravity press, 1296 pike push-up,
//   push-up variants that are plyometric, isometric or planche work (0258,
//   0492, 0545, 1306, 3294, 3327, 3217, 3145, 0699, 0803, 1297, 0500), 0316
//   incline breeding, 0856 svend press, 0052/0450 JM press, 0204 rear drive,
//   0436 tate press, 0816 triceps press, 1751 pin presses, neutral wrist
//   curls tagged biceps (0365, 0366, 0397), zottman curls
//   (0439, 1672, 2293, 2294), side, twisting and reverse crunches, 0469
//   groin crunch, 0981 jack knife sit-up, 0600 leg raise crunch, 0230 cable
//   standing lift, 2329 spine twist, side planks;
// - "extension" misfires: back and hip extensions (lower body), 0048
//   incline reverse-grip press.
export const UPPER_BODY_CORRECTIONS = [
  {
    pattern: 'pull-up, chin-up, pulldown',
    tg: 'lats',
    smAdd: ['upper back', 'biceps'],
    smRemove: ['forearms', 'rear deltoids'],
    ids: [
      '0007', '3293', '0015', '0017', '1431', '1432', '0970', '0974', '3117',
      '3116', '0983', '1013', '3019', '0150', '0153', '2330', '0177', '2616',
      '3563', '0198', '0197', '0205', '0245', '1325', '1326', '0253', '1327',
      '3418', '0572', '0579', '1347', '2736', '0627', '0638', '0651', '0652',
      '0670', '0673', '0674', '0678', '1763', '0818', '2987', '3290', '0841',
      '1429', '1367', '0466', '0720',
    ],
  },
  {
    pattern: 'pullover',
    tg: 'lats',
    smAdd: ['chest', 'triceps'],
    smRemove: [...DELTS_ASSIST, 'back', 'rhomboids'],
    ids: [
      '1316', '0034', '0037', '0073', '0184', '2285', '3010', '1255', '0288',
      '1284', '1291', '0375', '1295', '0433',
    ],
  },
  {
    pattern: 'row',
    tg: 'upper back',
    smAdd: ['lats', 'rear deltoids', 'biceps'],
    smRemove: ['forearms'],
    ids: [
      '0988', '0027', '0049', '0064', '3017', '0118', '1317', '3156', '3158',
      '3162', '3161', '3166', '3165', '0159', '0160', '0167', '1318', '0180',
      '0189', '0193', '1319', '0208', '1320', '1321', '1322', '1323', '0213',
      '0214', '0861', '0218', '0234', '0239', '1324', '0248', '0293', '0327',
      '0292', '1329', '1330', '1331', '2327', '1344', '0499', '2300', '2298',
      '0497', '0498', '0522', '0541', '1345', '0571', '0574', '3200', '0581',
      '0588', '0589', '1356', '1348', '1349', '1350', '0606', '1351', '1313',
      '1773', '3144', '1359', '1360', '0761', '1361', '0808',
    ],
  },
  {
    pattern: 'face pull, rear-delt raise, reverse fly',
    smAdd: ['upper back', 'traps'],
    smRemove: [...DELTS_ASSIST, 'biceps'],
    ids: [
      '0993', '1022', '0075', '0076', '0154', '3697', '0202', '0203', '0215',
      '0225', '0233', '0240', '0326', '3542', '2470', '0341', '0345', '0348',
      '0359', '2292', '0377', '0378', '0380', '0379', '0383', '0386', '0602',
      '0601', '0762', '1328',
    ],
  },
  {
    pattern: 'shrug',
    tg: 'traps',
    smAdd: ['forearms'],
    smRemove: [...DELTS_ASSIST, 'rhomboids'],
    ids: [
      '1018', '0095', '0220', '0305', '0304', '0329', '0406', '0580', '1439',
      '0604', '0746', '0767',
    ],
  },
  {
    pattern: 'lateral raise',
    smAdd: ['traps'],
    smRemove: ['triceps', 'upper back', 'rotator cuff', 'rhomboids'],
    ids: [
      '0178', '0192', '0311', '0323', '0334', '0355', '0356', '2317', '0396',
      '0395', '0408', '3237', '0584',
    ],
  },
  {
    pattern: 'upright row',
    smAdd: ['traps', 'biceps'],
    ids: ['0120', '0119', '0121', '0123', '0246', '0363', '0437', '1765', '0775'],
  },
  {
    pattern: 'front raise',
    smRemove: ['triceps', 'upper back', 'biceps', 'trapezius', 'traps', 'forearms'],
    ids: [
      '0978', '0041', '0107', '0161', '0162', '0164', '0310', '0309', '0387',
      '0392', '0419', '0834',
    ],
  },
  {
    pattern: 'overhead press',
    smAdd: ['side deltoids', 'triceps'],
    smRemove: ['upper back', 'chest', 'upper chest', 'core'],
    ids: [
      '0997', '0086', '0087', '0091', '0105', '1456', '1457', '0148', '0219',
      '2137', '0287', '0290', '1700', '2397', '0361', '0360', '0388', '3546',
      '0405', '0404', '0414', '0424', '0426', '0427', '0520', '0523', '0528',
      '0539', '0540', '0546', '1438', '0547', '0553', '0587', '0590', '0603',
      '0869', '2318', '3122', '0747', '0765', '0766', '0772', '0774', '0788',
    ],
  },
  {
    pattern: 'bench, chest press, push-up, chest dip, incline press',
    tg: 'pectorals',
    smAdd: ['front deltoids', 'triceps'],
    smRemove: ['core'],
    ids: [
      '0009', '2364', '1254', '0025', '0033', '0036', '0045', '0047', '1256',
      '1257', '0122', '1258', '0151', '1260', '1261', '0169', '1265', '1266',
      '1267', '1268', '2144', '0251', '1430', '2462', '3216', '1273', '0279',
      '1274', '1275', '0289', '0301', '0303', '3545', '0314', '0321', '1281',
      '1282', '0324', '1283', '0340', '0343', '0342', '1287', '1289', '1290',
      '1622', '1293', '1624', '0493', '3785', '0494', '0519', '0531', '1298',
      '3211', '3288', '0577', '0576', '1300', '1299', '1479', '3758', '1301',
      '1307', '0662', '0653', '0655', '0656', '0659', '0658', '0663', '0666',
      '3124', '0725', '0748', '0753', '0754', '0757', '0758', '0764', '1308',
      '1309', '0806', '1310', '3313', '1311', '2363',
    ],
  },
  {
    pattern: 'close-grip bench, triceps dip',
    tg: 'triceps',
    smAdd: ['chest', 'front deltoids'],
    ids: [
      '0030', '1719', '0055', '2187', '1731', '0296', '2432', '0751', '1625',
      '1626', '0019', '0129', '1399', '0591', '1451', '0639', '0672', '0677',
      '1744', '3287', '3289', '1753', '0814', '0812', '0813', '0815', '0830',
      '1754', '1755', '1767',
    ],
  },
  {
    pattern: 'fly, crossover, pec deck',
    tg: 'pectorals',
    smAdd: ['front deltoids'],
    smRemove: ['triceps', 'trapezius'],
    ids: [
      '0155', '0158', '0171', '0170', '0179', '0185', '0188', '1262', '1263',
      '1264', '0227', '1269', '1270', '0302', '1276', '0307', '0308', '1277',
      '0319', '1278', '1279', '1280', '0331', '1285', '1286', '1288', '1292',
      '0458', '3234', '0596',
    ],
  },
  {
    pattern: 'triceps extension, pushdown, kickback',
    tg: 'triceps',
    smRemove: [...DELTS_ASSIST, 'forearms', 'back', 'chest', 'core'],
    ids: [
      '0018', '0998', '1720', '0056', '0057', '0061', '0060', '1721', '1718',
      '0092', '0109', '1771', '0149', '0152', '1722', '0173', '0860', '0176',
      '0186', '1723', '0194', '0201', '0200', '2406', '0207', '1724', '1725',
      '1726', '0231', '1727', '0241', '2405', '1728', '0306', '0330', '1733',
      '0333', '1734', '0337', '1729', '0344', '0346', '1735', '0351', '1736',
      '0354', '0362', '0373', '0389', '1730', '1737', '0394', '0398', '1738',
      '2188', '1739', '1740', '1741', '0420', '0423', '0430', '1742', '2189',
      '1746', '1747', '1748', '1749', '2186', '0449', '0453', '0607', '0637',
      '1752',
    ],
  },
  {
    pattern: 'curl',
    tg: 'biceps',
    smAdd: ['forearms'],
    smRemove: [...DELTS_ASSIST],
    ids: [
      '0968', '0976', '0986', '0023', '2407', '0031', '0038', '0059', '0070',
      '0072', '0089', '0106', '2414', '1629', '0113', '1770', '1769', '1630',
      '1631', '0868', '1632', '1634', '0182', '0190', '1633', '1636', '1637',
      '0195', '1641', '1642', '1643', '0229', '1645', '0285', '2403', '1647',
      '1649', '1650', '1652', '1653', '0294', '2401', '1656', '0297', '1664',
      '0315', '0318', '0317', '0322', '1660', '1661', '0350', '1662', '0353',
      '1665', '1668', '1670', '0372', '1673', '0374', '1677', '0390', '0391',
      '0393', '1679', '0402', '0416', '0418', '2321', '0421', '0422', '1680',
      '0428', '5201', '1682', '1627', '0446', '0447', '1458', '0454', '1628',
      '2404', '2741', '0575', '0592', '1614', '3123', '1683', '0847', '0853',
    ],
  },
  {
    pattern: 'hammer and reverse curl',
    tg: 'forearms',
    smAdd: ['biceps'],
    ids: [
      '0080', '0081', '0110', '0165', '1635', '0206', '1413', '0209', '1639',
      '1640', '1646', '1648', '1654', '0298', '1657', '0313', '1659', '0312',
      '2402', '0320', '1663', '1666', '1414', '1667', '1669', '1671', '0370',
      '1674', '0382', '0384', '1675', '1676', '1678', '0403', '0425', '0429',
      '0451', '0452', '1615', '1616', '0636',
    ],
  },
  {
    pattern: 'crunch, sit-up',
    tg: 'abs',
    smAdd: ['obliques'],
    smRemove: ['hip flexors', 'lower back', 'inner thighs', 'quadriceps'],
    ids: [
      '0001', '3204', '1758', '1005', '0175', '0212', '0226', '0874', '0267',
      '0271', '0272', '0274', '3016', '0277', '0282', '2429', '3202', '0456',
      '0457', '0508', '0641', '3640', '1452', '0595', '3760', '0634', '3203',
      '3201', '0735', '3679', '2297', '0871', '0832', '3670', '0840',
    ],
  },
  {
    pattern: 'leg raise',
    tg: 'abs',
    smAdd: ['hip flexors'],
    smRemove: ['lower back', 'quadriceps'],
    ids: [
      '0011', '1002', '2799', '2800', '2963', '1764', '0472', '0474', '0475',
      '0491', '0620', '0865', '0689', '0826', '0866',
    ],
  },
  {
    pattern: 'twist, woodchop',
    tg: 'obliques',
    smAdd: ['abs'],
    smRemove: ['lower back', 'hip flexors'],
    ids: [
      '0014', '1011', '0094', '0112', '0211', '2399', '0243', '0862', '0583',
      '0687', '0846', '0845', '2371', '0849', '1707',
    ],
  },
  {
    pattern: 'plank, rollout',
    tg: 'abs',
    smAdd: ['obliques'],
    smRemove: [...DELTS_ASSIST, 'lower back', 'triceps'],
    ids: ['0971', '0084', '0083', '0103', '0857', '0796', '2135'],
  },
]
