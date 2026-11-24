import { isPlainShoulders } from './muscle-spelling.js'

// The shoulder head every catalogue exercise trains (ADR 0024).
//
// Why three heads: every bench and overhead press trains the front delts, while
// side and rear delts grow only from work aimed at them. With one "Shoulders"
// muscle, a push-heavy week read as well-trained shoulders while side and rear
// delts got nothing.
//
// Upstream tags 143 exercises `delts` and about 450 more name a plain
// "shoulders" or "deltoids" helper (20 name "rear deltoids"). Sky splits the
// deltoid into three heads, so each of those is read here as one head. The
// rewrite runs once when `exercises.js` builds the catalogue index, after the
// overlay in catalogue-corrections.js, so an overlay removal of a plain
// "shoulders" still applies; the upstream dataset stays untouched.
//
// Nothing in this file is matched by name at runtime: the lists are catalogue
// ids. Name rules proposed about 112 primary heads; every proposal, and the
// rest (rotator-cuff work, Olympic and kettlebell lifts, odd moves), was read
// by hand one id at a time. Delt-head evidence is EMG, not growth, so these
// assignments are a reasonable reading, not a measurement.

// Primary head of every delts-primary catalogue exercise, and of the one
// upper-back row ADR 0025 re-targets to a head. This list is the only place a
// catalogue exercise gets a head as its primary: the patterns in
// catalogue-corrections.js never set one. Presses, front raises, cleans and
// thrusters go to the front; lateral raises, upright rows, snatches and other
// arm-out-to-the-side raises to the side; rear-delt raises and rows, reverse
// flyes, external rotations and Cuban presses to the rear. An id that was hard
// to call carries its reason beside it.
export const PRIMARY_DELT_HEAD_IDS = {
  'front-delts': [
    '0978', // band front raise
    '0997', // band shoulder press
    '1012', // band twisting overhead press
    '0041', // barbell front raise
    '0086', // barbell seated behind head military press
    '0087', // barbell seated bradford rocky press
    '0091', // barbell seated overhead press
    '0100', // barbell skier: a front raise from the thighs to the shoulders with a hop
    '0105', // barbell standing bradford press
    '1456', // barbell standing close grip military press
    '0107', // barbell standing front raise over head
    '1457', // barbell standing wide military press
    '3305', // barbell thruster
    '0128', // battling ropes: arms held in front at shoulder height, making waves
    '0148', // cable alternate shoulder press
    '0161', // cable forward raise
    '0162', // cable front raise
    '0164', // cable front shoulder raise
    '0216', // cable seated shoulder internal rotation
    '0219', // cable shoulder press
    '0286', // dumbbell alternate side press
    '2137', // dumbbell arnold press
    '0287', // dumbbell arnold press v. 2
    '0290', // dumbbell bench seated press
    '0310', // dumbbell front raise
    '0309', // dumbbell front raise v. 2
    '0325', // dumbbell incline raise
    '0361', // dumbbell one arm shoulder press
    '0360', // dumbbell one arm shoulder press v. 2
    '1700', // dumbbell push press
    '2397', // dumbbell scott press
    '0387', // dumbbell seated alternate front raise
    '0388', // dumbbell seated alternate press
    '3546', // dumbbell seated alternate shoulder
    '0392', // dumbbell seated front raise
    '0405', // dumbbell seated shoulder press
    '0404', // dumbbell seated shoulder press (parallel grip)
    '3548', // dumbbell single arm overhead carry
    '0414', // dumbbell standing alternate overhead press
    '0419', // dumbbell standing front raise above head
    '0424', // dumbbell standing one arm palm in press
    '0426', // dumbbell standing overhead press
    '0427', // dumbbell standing palms in press
    '0438', // dumbbell w-press
    '0445', // ez barbell anti gravity press: an overhead press from the shoulders
    '0520', // kettlebell alternating press
    '0523', // kettlebell arnold press
    '0527', // kettlebell double jerk
    '0528', // kettlebell double push press
    '0537', // kettlebell one arm clean and jerk
    '0538', // kettlebell one arm jerk
    '0539', // kettlebell one arm military press to the side
    '0540', // kettlebell one arm push press
    '0543', // kettlebell pirate supper legs: raised to the shoulder in front, then pressed overhead
    '0546', // kettlebell seated press
    '1438', // kettlebell seated two arm military press
    '0547', // kettlebell seesaw press
    '0550', // kettlebell thruster
    '0552', // kettlebell two arm clean
    '0553', // kettlebell two arm military press
    '2271', // left hook. boxing: the arm swings across the front of the body
    '0587', // lever military press
    '0590', // lever one arm shoulder press
    '0603', // lever shoulder press
    '0869', // lever shoulder press v. 2
    '2318', // lever shoulder press v. 3
    '3122', // resistance band seated shoulder press
    '0747', // smith behind neck press
    '0765', // smith seated shoulder press
    '0766', // smith shoulder press
    '0772', // smith standing behind head military press
    '0774', // smith standing military press
    '0788', // standing behind neck press
    '0834', // weighted front raise
    '3641', // weighted kneeling step with swing
  ],
  'side-delts': [
    '0977', // band front lateral raise
    '1017', // band y-raise
    '0067', // barbell one arm snatch: elbow-out high pull to overhead, like an upright row
    '0120', // barbell upright row
    '0119', // barbell upright row v. 2
    '0121', // barbell upright row v. 3
    '0123', // barbell wide-grip upright row
    '0178', // cable lateral raise
    '0192', // cable one arm lateral raise
    '0246', // cable upright row
    '0311', // dumbbell full can lateral raise
    '0323', // dumbbell incline one arm lateral raise
    '0332', // dumbbell iron cross
    '0334', // dumbbell lateral raise
    '0335', // dumbbell lateral to front raise
    '0355', // dumbbell one arm lateral raise
    '0356', // dumbbell one arm lateral raise with support
    '0363', // dumbbell one arm upright row
    '0376', // dumbbell raise
    '2317', // dumbbell seated bent arm lateral raise
    '0396', // dumbbell seated lateral raise
    '0395', // dumbbell seated lateral raise v. 2
    '0408', // dumbbell side lying one hand raise
    '0415', // dumbbell standing alternate raise
    '2143', // dumbbell standing around world: arms held out to the sides, circling
    '0437', // dumbbell upright row
    '1765', // dumbbell upright row (back pov)
    '0529', // kettlebell double snatch: elbow-out high pull to overhead, like an upright row
    '0542', // kettlebell one arm snatch: elbow-out high pull to overhead, like an upright row
    '3237', // landmine lateral raise
    '0584', // lever lateral raise
    '0775', // smith upright row
  ],
  'rear-delts': [
    '0993', // band reverse fly
    '1022', // band standing rear delt row
    '0075', // barbell rear delt raise
    '0076', // barbell rear delt row
    '0154', // cable cross-over revers fly
    '3697', // cable kneeling rear delt row (with rope) (male)
    '0202', // cable rear delt row (stirrups)
    '0203', // cable rear delt row (with rope)
    '0215', // cable seated rear lateral raise
    '0225', // cable standing cross-over high reverse fly
    '0233', // cable standing rear delt row (with rope)
    '0235', // cable standing shoulder external rotation
    '0240', // cable supine reverse fly
    '0299', // dumbbell cuban press
    '2136', // dumbbell cuban press v. 2
    '0326', // dumbbell incline rear lateral raise
    '3542', // dumbbell incline t-raise
    '0863', // dumbbell lying external shoulder rotation
    '2470', // dumbbell lying on floor rear delt raise
    '0341', // dumbbell lying one arm deltoid rear
    '0345', // dumbbell lying one arm rear lateral raise
    '0348', // dumbbell lying rear lateral raise
    '0359', // dumbbell one arm reverse fly (with support)
    '2292', // dumbbell rear delt raise
    '0377', // dumbbell rear delt row_shoulder
    '0378', // dumbbell rear fly
    '0380', // dumbbell rear lateral raise
    '0379', // dumbbell rear lateral raise (support head)
    '0383', // dumbbell reverse fly
    '0386', // dumbbell rotation reverse fly
    '0864', // dumbbell upright shoulder external rotation
    '0602', // lever seated reverse fly
    '0601', // lever seated reverse fly (parallel grip)
    '0669', // rear deltoid stretch
    '0762', // smith rear delt row
    '1328', // dumbbell lying rear delt row: catalogue says upper back; a rear-delt row (ADR 0025)
    '0844', // weighted round arm
  ],
}

// Helper "shoulders"/"deltoids" credit follows the movement, read from the
// exercise's primary target: pressing, chest, arm and core work to the front;
// rows and pulls to the rear; shrugs and high pulls to the side.
//
// "Rear deltoids" always reads as rear, and so does "rotator cuff" (both are
// aliases in muscles.js). The catalogue puts a rotator-cuff helper on six
// exercises: four shoulder rotations, and two lateral raises whose pattern
// drops it. External rotation works the rear head alongside the cuff, and the
// muscle map has no rotator cuff, so dropping the helper would lose that credit.
/** @typedef {import('./types.js').CustomExercise} CustomExercise */

/** @type {Record<string, string>} */
export const ASSIST_DELT_HEAD_BY_TARGET = {
  'upper back': 'rear-delts',
  lats: 'rear-delts',
  traps: 'side-delts',
}
export const DEFAULT_ASSIST_DELT_HEAD = 'front-delts'

// Reviewed exceptions to the target rule above.
/** @type {Record<string, string>} */
export const ASSIST_DELT_HEAD_IDS = {
  '0022': 'front-delts', // barbell pullover to press
  '0139': 'rear-delts', // biceps narrow pull-ups
  '0140': 'rear-delts', // biceps pull-up
  '0232': 'rear-delts', // cable standing pulldown (with rope)
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
  // "Rear deltoids" and "rotator cuff" already name the rear head (see the muscle aliases).
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
