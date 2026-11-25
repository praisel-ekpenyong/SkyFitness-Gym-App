// Verified against real exports:
//   FitNotes (Android) Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment
//   FitNotes 2 (iOS)   Date,Exercise,Category,Weight (kg),Weight (lbs),Reps,Distance,Distance Unit,Time,Notes,Kind
//   Strong             Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
//   Hevy               title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe
// Apple Health is an XML dump, often hundreds of MB, and only its body-weight records are read here. parseBodyweight() scans for those without building a DOM.

import { EXDB, EXIDX } from './exercises.js'
import { uid } from './format.js'
import { isoOf, parseDay } from './dates.js'
import { mergeWeighIns, weighInsPreview } from './bodyweight.js'
import { normalizeWeight, round1 } from './units.js'
import { sortWorkouts } from './profile/index.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Workout} Workout */
/** @typedef {import('./types.js').Entry} Entry */
/** @typedef {import('./types.js').SetRow} SetRow */
/** @typedef {import('./types.js').CustomExercise} CustomExercise */
/** @typedef {import('./types.js').WeighIn} WeighIn */
/** @typedef {import('./types.js').Unit} Unit */
/**
 * @typedef {{
 *   kind: 'workouts',
 *   source: string | null,
 *   workouts: Workout[],
 *   customEx: CustomExercise[],
 *   matched: number,
 *   matchedSets: number,
 *   created: number,
 *   unmatchedNames: string[],
 *   sets: number,
 *   skipped: number,
 *   warmups: number,
 *   fileUnit: Unit | '',
 *   mixedUnits: boolean,
 *   converted: boolean,
 *   rpeSets: number,
 *   rirSets: number,
 *   from: string | null,
 *   to: string | null,
 *   error?: undefined,
 * }} ParsedWorkoutsImport
 */
/**
 * @typedef {{
 *   kind: 'bodyweight',
 *   source: string,
 *   bodyweight: WeighIn[],
 *   fileUnit: Unit | '',
 *   converted: boolean,
 *   from: string,
 *   to: string,
 *   error?: undefined,
 * }} ParsedBodyweightImport
 */

/**
 * A real CSV reader: quoted fields, embedded commas and newlines, doubled quotes, BOM
 * and CRLF. Splitting on commas breaks on the first exercise named "Bench Press, Close
 * Grip" — and a whole history would import shifted by one column without ever erroring.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCSV(text) {
  const rows = []
  let row = [], field = '', quoted = false
  const s = String(text).replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++ } else quoted = false }
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(x => x !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some(x => x !== '')) rows.push(row)
  return rows
}

/** @param {string} h @returns {string} */
const norm = h => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** @type {Array<[string, string[]]>} */
const COLUMNS = [
  ['exercise', ['exercise', 'exercise name', 'exercise title']],
  ['date', ['date', 'workout date']],
  ['startTime', ['start time']],
  ['endTime', ['end time']],
  ['workoutName', ['workout name', 'title']],
  ['category', ['category', 'body part', 'muscle group']],
  ['weightKg', ['weight kg']],
  ['weightLb', ['weight lbs', 'weight lb']],
  ['weight', ['weight']],
  ['weightUnit', ['weight unit', 'unit']],
  ['reps', ['reps', 'repetitions']],
  ['rpe', ['rpe', 'rpe rating']],
  ['rir', ['rir', 'reps in reserve']],
  ['distanceKm', ['distance km']],
  ['distance', ['distance']],
  ['distanceUnit', ['distance unit']],
  ['seconds', ['seconds', 'duration seconds']],
  ['time', ['time', 'duration']],
  ['setType', ['set type']],
  ['note', ['exercise notes', 'exercise note', 'comment', 'comments', 'notes', 'note']],
]

/** @param {string[]} header @returns {Record<string, number>} */
function mapHeader(header) {
  /** @type {Record<string, number>} */
  const map = {}
  header.forEach((h, i) => {
    const n = norm(h)
    for (const [field, names] of COLUMNS) {
      if (map[field] === undefined && names.includes(n)) { map[field] = i; return }
    }
  })
  return map
}

/** @param {string[]} header @returns {string | null} */
export function detectSource(header) {
  const h = header.map(norm)
  if (h.includes('exercise title') && h.includes('set index')) return 'Hevy'
  if (h.includes('exercise name') && h.includes('set order')) return 'Strong'
  if (h.includes('exercise') && h.includes('kind')) return 'FitNotes (iOS)'
  if (h.includes('exercise') && h.includes('weight unit')) return 'FitNotes'
  if (h.includes('exercise') && h.includes('category')) return 'FitNotes'
  return null
}


/** @type {Array<[RegExp, string]>} */
const SYN = [
  [/\bbb\b/g, 'barbell'], [/\bdb\b/g, 'dumbbell'], [/\bkb\b/g, 'kettlebell'],
  [/\bohp\b/g, 'overhead press'], [/\bbw\b/g, 'body weight'], [/\bbodyweight\b/g, 'body weight'],
  [/\bmachine\b/g, 'lever'], [/\bsmith machine\b/g, 'smith'], [/\bez bar\b/g, 'ez barbell'],
  [/\bpull ups?\b/g, 'pull up'], [/\bchin ups?\b/g, 'chin up'], [/\bpush ups?\b/g, 'push up'],
  [/\bsit ups?\b/g, 'sit up'], [/\bdips?\b/g, 'dip'], [/\braises?\b/g, 'raise'],
  [/\bcurls?\b/g, 'curl'], [/\bpresses\b/g, 'press'], [/\bextensions?\b/g, 'extension'],
  [/\bcables?\b/g, 'cable'], [/\bseated\b/g, 'seated'], [/\bassisted\b/g, 'assisted'],
]
const FILLER = new Set(['the', 'a', 'with', 'and', 'v', 'variation', 'version', 'pulley', 'weighted'])

/** @param {string} name @returns {string[]} */
function wordsOf(name) {
  let k = String(name || '').toLowerCase()
    .replace(/[()[\]]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  SYN.forEach(([re, to]) => { k = k.replace(re, to) })
  return k.split(' ').filter(w => w && !FILLER.has(w))
}
/** @param {string} name @returns {string} */
const keyOf = name => wordsOf(name).sort().join(' ')

/** @type {{ exact: Map<string, string>, all: Array<{ id: string, set: Set<string>, n: number }> } | null} */
let INDEX = null
function buildIndex() {
  if (INDEX) return INDEX
  INDEX = { exact: new Map(), all: [] }
  EXDB.forEach(e => {
    const w = wordsOf(e.n)
    const k = w.slice().sort().join(' ')
    if (INDEX && !INDEX.exact.has(k)) INDEX.exact.set(k, e.id)
    INDEX?.all.push({ id: e.id, set: new Set(w), n: w.length })
  })
  return INDEX
}

/** @type {Record<string, string>} */
const ALIAS_EX = {
  'bench press': '0025', 'barbell bench press': '0025', 'flat bench press': '0025',
  'incline bench press': '0047', 'decline bench press': '0033',
  'close grip bench press': '0030', 'close-grip bench press': '0030',
  squat: '0043', 'back squat': '0043', 'barbell squat': '0043', 'front squat': '0042',
  deadlift: '0032', 'romanian deadlift': '0085', rdl: '0085', 'sumo deadlift': '0117',
  'lat pulldown': '2330', 'lat pull down': '2330', pulldown: '2330',
  shrug: '0095', shrugs: '0095',
  'overhead press': '0091', 'military press': '0091', 'shoulder press': '0091', ohp: '0091',
  'barbell row': '0027', 'bent over row': '0027', 'bent-over row': '0027',
  'dumbbell row': '0292', 'one arm dumbbell row': '0292',
  'leg curl': '0586', 'lying leg curl': '0586', 'seated leg curl': '0586',
  'leg press': '0739', 'leg extension': '0585',
  'calf raise': '1372', 'standing calf raise': '1372', 'seated calf raise': '0088',
  'lateral raise': '0334', 'side raise': '0334', 'reverse fly': '0348', 'rear delt fly': '0348',
  'bicep curl': '0294', 'biceps curl': '0294', 'dumbbell curl': '0294',
  'preacher curl': '0070', 'barbell curl': '0031',
  'tricep pushdown': '0241', 'triceps pushdown': '0241', pushdown: '0241',
  skullcrusher: '0060', 'skull crusher': '0060', 'lying triceps extension': '0061',
  lunge: '0054', lunges: '0054', 'cable crossover': '1269', 'cable cross over': '1269',
  'goblet squat': '1760', 'dumbbell goblet squat': '1760', 'kettlebell goblet squat': '0534',
  treadmill: '3666', 'treadmill walk': '3666', 'treadmill run': '3666',
  cycling: '2331', 'cross trainer': '2331', elliptical: '2141',
  'stationary bike': '2138', 'exercise bike': '2138', 'stepmill': '2311',
  'pallof press': '0979', 'cable pallof press': '0979', 'vertical pallof press': '1015',
  'cable core pallof press': '0979', 'core pallof press': '0979',
}

/** @type {Map<string, string> | null} */
let ALIAS_IDX = null
const aliasIndex = () => {
  if (!ALIAS_IDX) {
    ALIAS_IDX = new Map()
    for (const k in ALIAS_EX) ALIAS_IDX.set(wordsOf(k).sort().join(' '), ALIAS_EX[k])
  }
  return ALIAS_IDX
}

/** @param {string} name @returns {string | null} */
export function matchExercise(name) {
  const idx = buildIndex()
  const w = wordsOf(name)
  if (!w.length) return null
  const sorted = w.slice().sort().join(' ')
  const aliased = aliasIndex().get(sorted)
  if (aliased && EXIDX[aliased]) return aliased
  const exact = idx.exact.get(sorted)
  if (exact) return exact
  const q = new Set(w)
  /** @type {string | null} */
  let best = null, bestExtra = Infinity, ties = 0
  for (const c of idx.all) {
    let ok = true
    for (const word of q) if (!c.set.has(word)) { ok = false; break }
    if (!ok) continue
    const extra = c.n - q.size
    if (extra > 2) continue
    if (extra < bestExtra) { best = c.id; bestExtra = extra; ties = 1 }
    else if (extra === bestExtra) ties++
  }
  return ties === 1 ? best : null
}

/** @type {Record<string, string>} */
const CATEGORY_BP = {
  chest: 'chest', back: 'back', lats: 'back', shoulders: 'shoulders', delts: 'shoulders',
  legs: 'upper legs', quads: 'upper legs', hamstrings: 'upper legs', glutes: 'upper legs',
  calves: 'lower legs', abs: 'waist', core: 'waist', obliques: 'waist',
  arms: 'upper arms', biceps: 'upper arms', triceps: 'upper arms', forearms: 'lower arms',
  cardio: 'cardio', 'full body': 'upper legs', olympic: 'upper legs', neck: 'neck',
}


/** @param {unknown} v @returns {number} */
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0 }
/** @param {unknown} raw @param {boolean} zeroMeansRated @returns {number | null} */
const effortNum = (raw, zeroMeansRated) => {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const n = parseFloat(s.replace(',', '.'))
  if (!isFinite(n) || n < 0 || (n === 0 && !zeroMeansRated)) return null
  return Math.min(10, Math.round(n * 100) / 100)
}
/**
 * A day key for a calendar date, or null when the date does not exist (31 February).
 * @param {number | string} y @param {number | string} m @param {number | string} d @returns {string | null}
 */
const dayKey = (y, m, d) => {
  const date = new Date(+y, +m - 1, +d)
  return date.getMonth() === +m - 1 && date.getDate() === +d ? isoOf(date) : null
}
/** @param {string | null} d @param {number | null} t */
const dayAndTime = (d, t) => (d ? { d, t } : null)
/** @type {Record<string, number>} */
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

/** @param {string} s @returns {{ d: string, t: number | null } | null} */
export function parseWhen(s) {
  const v = String(s || '').trim()
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/)
  if (m) return dayAndTime(dayKey(m[1], m[2], m[3]), hm(m[4], m[5]))
  m = v.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/)
  if (m && MON[m[2].toLowerCase()]) return dayAndTime(dayKey(m[3], MON[m[2].toLowerCase()], m[1]), hm(m[4], m[5]))
  m = v.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/)
  if (m && MON[m[1].toLowerCase()]) return dayAndTime(dayKey(m[3], MON[m[1].toLowerCase()], m[2]), hm(m[4], m[5]))
  m = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:[, ]+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const [, a, b, y] = m
    const day = +a > 12 ? a : +b > 12 ? b : a
    const mon = day === a ? b : a
    return dayAndTime(dayKey(y, mon, day), hm(m[4], m[5]))
  }
  return null
}
/** @param {string | undefined} h @param {string | undefined} mi @returns {number | null} */
const hm = (h, mi) => (h === undefined ? null : (parseInt(h, 10) || 0) * 3600000 + (parseInt(mi ?? '', 10) || 0) * 60000)

/** @param {unknown} v @returns {number} */
function toMinutes(v) {
  const s = String(v ?? '').trim()
  if (!s) return 0
  if (s.includes(':')) {
    const p = s.split(':').map(x => parseInt(x, 10) || 0)
    const sec = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]
    return Math.round(sec / 60 * 10) / 10
  }
  const m = s.match(/(\d+)\s*h/i), mm = s.match(/(\d+)\s*m/i)
  if (m || mm) return (m ? +m[1] * 60 : 0) + (mm ? +mm[1] : 0)
  return Math.round(num(s) * 10) / 10
}
/** @type {Record<string, number>} */
const KM = { m: 0.001, km: 1, cm: 0.00001, in: 0.0000254, ft: 0.0003048, yd: 0.0009144, mi: 1.609344 }
/** @param {unknown} v @param {string} unit @returns {number} */
const toKm = (v, unit) => num(v) * (KM[String(unit || 'km').toLowerCase().trim()] ?? 1)


/**
 * Parse a FitNotes, Strong, or Hevy workout CSV export.
 * @param {string} text
 * @param {{ unit?: Unit }} [options]
 * @returns {ParsedWorkoutsImport | { error: 'empty' | 'unrecognised', kind?: undefined }}
 */
export function parseWorkoutCSV(text, { unit = 'kg' } = {}) {
  const rows = parseCSV(text)
  if (rows.length < 2) return { error: 'empty' }
  const map = mapHeader(rows[0])
  const source = detectSource(rows[0])
  const dateCol = map.date !== undefined ? 'date' : map.startTime !== undefined ? 'startTime' : null
  if (!dateCol || map.exercise === undefined) return { error: 'unrecognised' }

  /** @type {Map<string, string | null>} */
  const resolved = new Map()
  /** @type {Map<string, { ex: Map<string, Array<SetRow & { u?: string }>>, exNotes: Map<string, string>, name: string, start: number | null, end: number | null }>} */
  const byDate = new Map()
  /** @type {Map<string, CustomExercise>} */
  const created = new Map()
  /** @type {Set<string>} */
  const unmatched = new Set()
  let sets = 0, skipped = 0, matched = 0, warmups = 0, rpeSets = 0, rirSets = 0
  let sawLb = false, sawKg = false

  /** @param {string[]} r @param {string} f @returns {string} */
  const cell = (r, f) => (map[f] === undefined ? '' : String(r[map[f]] ?? '').trim())

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const name = cell(r, 'exercise')
    const when = parseWhen(cell(r, dateCol))
    if (!name || !when) { skipped++; continue }

    let w = 0, rowUnit = ''
    if (map.weightKg !== undefined && cell(r, 'weightKg')) { w = num(cell(r, 'weightKg')); rowUnit = 'kg' }
    else if (map.weightLb !== undefined && cell(r, 'weightLb')) { w = num(cell(r, 'weightLb')); rowUnit = 'lb' }
    else {
      w = num(cell(r, 'weight'))
      const u = cell(r, 'weightUnit').toLowerCase()
      rowUnit = u.startsWith('lb') ? 'lb' : u.startsWith('kg') ? 'kg' : ''
    }
    if (rowUnit === 'lb') sawLb = true
    if (rowUnit === 'kg') sawKg = true

    const reps = Math.round(num(cell(r, 'reps')))
    const secs = num(cell(r, 'seconds'))
    const mins = secs > 0 ? Math.round(secs / 60 * 10) / 10 : toMinutes(cell(r, 'time'))
    const km = map.distanceKm !== undefined && cell(r, 'distanceKm')
      ? num(cell(r, 'distanceKm'))
      : toKm(cell(r, 'distance'), cell(r, 'distanceUnit'))
    if (!w && !reps && !mins && !km) { skipped++; continue }
    const warmup = /warm/i.test(cell(r, 'setType'))
    if (warmup) warmups++

    const key = keyOf(name)
    let id = resolved.get(key)
    if (id === undefined) { id = matchExercise(name); resolved.set(key, id) }
    if (id) matched++
    else {
      let c = created.get(key)
      if (!c) {
        c = {
          id: 'im' + uid(), n: name.toLowerCase(), custom: true, eq: 'custom', tg: '', desc: '',
          bp: CATEGORY_BP[cell(r, 'category').toLowerCase()] || (km || (mins && !reps) ? 'cardio' : 'upper legs'),
        }
        created.set(key, c)
        unmatched.add(name)
      }
      id = c.id
    }

    const isCardio = (km > 0 || mins > 0) && !reps
    /** @type {SetRow & { u?: string }} */
    const set = isCardio
      ? { min: mins || 0, speed: mins > 0 ? Math.round(km / (mins / 60) * 10) / 10 : 0, done: true, ...(warmup ? { phase: 'warmup' } : {}) }
      : { w, r: reps || 0, done: true, u: rowUnit, ...(warmup ? { phase: 'warmup' } : {}) }
    if (!isCardio) {
      const rir = effortNum(cell(r, 'rir'), true)
      const rpe = rir == null ? effortNum(cell(r, 'rpe'), false) : null
      if (rir != null) { set.rir = rir; rirSets++ }
      else if (rpe != null) { set.rpe = rpe; rpeSets++ }
    }

    let day = byDate.get(when.d)
    if (!day) {
      day = { ex: new Map(), exNotes: new Map(), name: cell(r, 'workoutName') || '', start: when.t, end: null }
      byDate.set(when.d, day)
    }
    const rawNote = cell(r, 'note')
    if (rawNote) {
      day.exNotes = day.exNotes || new Map()
      const trimmed = rawNote.trim().slice(0, 500)
      if (trimmed) day.exNotes.set(id, trimmed)
    }
    if (!day.name) day.name = cell(r, 'workoutName') || ''
    if (map.endTime !== undefined) { const e = parseWhen(cell(r, 'endTime')); if (e && e.t != null) day.end = e.t }
    let exSets = day.ex.get(id)
    if (!exSets) day.ex.set(id, exSets = [])
    exSets.push(set)
    sets++
  }

  /** @type {Unit | ''} */
  const fileUnit = sawLb && !sawKg ? 'lb' : sawKg && !sawLb ? 'kg' : ''
  const mixedUnits = sawLb && sawKg
  /** @param {number} x @returns {number} */
  const toKg = x => normalizeWeight(x, 'lb', 'kg')
  /** @param {number} x @returns {number} */
  const toLb = x => normalizeWeight(x, 'kg', 'lb')
  /** @param {{ w?: number, u?: string }} s @returns {number} */
  const convRow = s => {
    const u = s.u || fileUnit
    const w = s.w ?? 0
    if (!u || u === unit) return w
    return u === 'lb' ? toKg(w) : toLb(w)
  }
  const converted = (!!fileUnit && fileUnit !== unit) || mixedUnits

  const dates = [...byDate.keys()].sort()
  const workouts = dates.map(d => {
    const day = byDate.get(d)
    /** @type {Entry[]} */
    const entries = [...(day?.ex.entries() ?? [])].map(([id, ss]) => {
      const conv2 = ss.map(({ u, ...s }) => (s.w !== undefined ? { ...s, w: convRow({ ...s, u }) } : s))
      const note = day?.exNotes?.get(id)
      return { id, sets: conv2, target: null, ...(note ? { notes: note } : {}) }
    })
    const midnight = new Date(parseDay(d).setHours(0, 0, 0, 0)).getTime()
    const start = day?.start != null ? midnight + day.start : parseDay(d).getTime()
    const end = day?.end != null ? midnight + day.end : start
    /** @type {Workout} */
    const w = {
      id: 'iw' + uid(), d, start, end: end > start ? end : start,
      routineId: null, name: day?.name || 'Imported', bw: null, entries,
    }
    return w
  })

  return {
    kind: 'workouts', source, workouts, customEx: [...created.values()],
    matched: new Set([...resolved.values()].filter(Boolean)).size,
    matchedSets: matched,
    created: created.size, unmatchedNames: [...unmatched].sort(),
    sets, skipped, warmups, fileUnit, mixedUnits, converted, rpeSets, rirSets,
    from: dates[0] || null, to: dates[dates.length - 1] || null,
  }
}


/**
 * Parse Apple Health XML or CSV body-weight records.
 * @param {string} text
 * @param {{ unit?: Unit }} [options]
 * @returns {ParsedBodyweightImport | { error: 'empty' | 'unrecognised', kind?: undefined }}
 */
export function parseBodyweight(text, { unit = 'kg' } = {}) {
  const s = String(text)
  /** @type {Map<string, { w: number, t: number | null }>} */
  const out = new Map()
  /** @type {Unit | ''} */
  let fileUnit = ''

  if (s.includes('HKQuantityTypeIdentifierBodyMass')) {
    const re = /<Record[^>]*type="HKQuantityTypeIdentifierBodyMass"[^>]*>/g
    let m
    while ((m = re.exec(s))) {
      const tag = m[0]
      const val = /value="([\d.]+)"/.exec(tag)
      const dt = /startDate="([^"]+)"/.exec(tag) || /creationDate="([^"]+)"/.exec(tag)
      const u = /unit="([^"]+)"/.exec(tag)
      if (!val || !dt) continue
      const when = parseWhen(dt[1])
      if (!when) continue
      if (u) fileUnit = /lb/i.test(u[1]) ? 'lb' : 'kg'
      out.set(when.d, { w: parseFloat(val[1]), t: new Date(dt[1]).getTime() || null })
    }
  } else {
    const rows = parseCSV(s)
    if (rows.length < 2) return { error: 'empty' }
    const map = mapHeader(rows[0])
    const wCol = map.weightKg ?? map.weightLb ?? map.weight
    const dCol = map.date ?? map.startTime
    if (wCol === undefined || dCol === undefined) return { error: 'unrecognised' }
    if (map.weightKg !== undefined) fileUnit = 'kg'
    else if (map.weightLb !== undefined) fileUnit = 'lb'
    for (let i = 1; i < rows.length; i++) {
      const when = parseWhen(String(rows[i][dCol] ?? ''))
      const w = num(rows[i][wCol])
      if (!when || !w) continue
      const t = when.t != null
        ? new Date(parseDay(when.d).setHours(0, 0, 0, 0)).getTime() + when.t
        : parseDay(when.d).getTime()
      out.set(when.d, { w, t })
    }
  }

  if (!out.size) return { error: 'unrecognised' }
  const converted = !!fileUnit && fileUnit !== unit
  /** @type {(x: number) => number} */
  const conv = converted
    ? x => normalizeWeight(x, fileUnit, unit)
    : round1
  const dates = [...out.keys()].sort()
  return {
    kind: 'bodyweight', source: 'Apple Health',
    bodyweight: dates.map(d => {
      const item = out.get(d)
      return { d, w: conv(item?.w ?? 0), t: item?.t || parseDay(d).getTime() }
    }),
    fileUnit, converted, from: dates[0], to: dates[dates.length - 1],
  }
}

/**
 * Detect and parse either workout CSV or Apple Health / CSV body-weight data.
 * @param {string} text
 * @param {{ unit?: Unit }} [opts]
 * @returns {ParsedWorkoutsImport | ParsedBodyweightImport | { error: 'empty' | 'unrecognised', kind?: undefined }}
 */
export function parseImport(text, opts) {
  const s = String(text)
  if (s.includes('HKQuantityTypeIdentifier') || /^\s*</.test(s)) return parseBodyweight(s, opts)
  const asWorkouts = parseWorkoutCSV(s, opts)
  if (!asWorkouts.error) return asWorkouts
  const asWeights = parseBodyweight(s, opts)
  return asWeights.error ? asWorkouts : asWeights
}



/**
 * @param {Profile} state
 * @param {ParsedWorkoutsImport} parsed
 * @returns {Workout[]}
 */
const freshWorkouts = (state, parsed) => {
  const have = new Set((state.workouts || []).map(w => w.d))
  return parsed.workouts.filter(w => !have.has(w.d))
}

/**
 * Preview how many Workouts or Weigh-ins an import would add vs skip.
 * @param {Profile} state
 * @param {ParsedWorkoutsImport | ParsedBodyweightImport} parsed
 * @returns {{ added: number, skipped: number }}
 */
export function importPreview(state, parsed) {
  if (parsed.kind === 'bodyweight') return weighInsPreview(state, parsed.bodyweight)
  const fresh = freshWorkouts(state, parsed)
  return { added: fresh.length, skipped: parsed.workouts.length - fresh.length }
}

/**
 * Merge parsed Workouts or Weigh-ins into Profile `S` without overwriting existing days.
 * @param {Profile} S
 * @param {ParsedWorkoutsImport | ParsedBodyweightImport} parsed
 * @returns {{ added: number, skipped: number }}
 */
export function mergeImport(S, parsed) {
  if (parsed.kind === 'bodyweight') return mergeWeighIns(S, parsed.bodyweight)
  const fresh = sortWorkouts(freshWorkouts(S, parsed))
  const used = new Set(fresh.flatMap(w => (w.entries || []).map(e => e.id)))
  const customs = parsed.customEx.filter(c => used.has(c.id) && !EXIDX[c.id])
  S.customEx = [...(S.customEx || []), ...customs]
  S.workouts = sortWorkouts([...(S.workouts || []), ...fresh])
  return { added: fresh.length, skipped: parsed.workouts.length - fresh.length }
}
