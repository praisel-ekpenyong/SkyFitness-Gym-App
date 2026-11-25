// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import Modals from '../components/Modals.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { bwSheet, goalSheet } from './bodyweight.jsx'
import { dayOverrideSheet, dayAssignSheet } from './schedule.jsx'
import { glyphPicker } from './routine.jsx'
import { planToolsSheet } from './plan-tools.jsx'
import { workoutCompleteSheet } from './session.jsx'
import { calendarSheet, recapSheet, workoutDetailSheet } from './history.jsx'
import { displayNameSheet, sexSheet, birthYearSheet } from './profile.jsx'
import { confirmSheet } from './confirm.jsx'
import { exerciseDetailSheet, addToRoutineSheet, customExSheet, exercisePicker, exConfigSheet } from './catalogue.jsx'
import { volumeRangesSheet, RangeEditSheet } from './volume.jsx'
import { planImportSheet } from './plan-tools.jsx'
import { exerciseNoteSheet, finishWorkout } from './session.jsx'
import { ImportSummary } from './import.jsx'
import { ReorderExercisesSheet, EditWorkoutSheet } from './edit-workout.jsx'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ex = () => exOr('0025')
const workout = { id: 'w1', d: '2026-02-15', name: 'Push', start: 1000, end: 1000 + 40 * 60000, entries: [] }

const activeWorkout = () => useStore.getState().update(s => {
  s.active = { id: 'a1', d: '2026-02-15', start: 1000, name: 'Push', cur: 0, entries: [{ id: '0025', target: { reps: 8, weight: 50 }, sets: [{ w: 50, r: 8, done: true }] }] }
})
const sheetOf = Component => () => useUI.getState().openSheet(close => <Component close={close} />)

const OPENERS = {
  bwSheet: { renders: 'BwSheet', open: () => bwSheet() },
  requiredBwSheet: { renders: 'BwSheet', open: () => bwSheet({ required: true }) },
  goalSheet: { renders: 'GoalSheet', open: goalSheet },
  dayOverrideSheet: { renders: 'DayOverride', open: () => dayOverrideSheet('2026-02-16') },
  dayAssignSheet: { renders: 'DayAssign', open: () => dayAssignSheet(1) },
  glyphPicker: { open: () => glyphPicker(null, () => {}) },
  planToolsSheet: { renders: 'PlanTools', open: planToolsSheet },
  planImportSheet: { renders: 'PlanImport', open: () => planImportSheet({ name: 'PPL', routineCount: 3, exerciseCount: 12, scheduledDays: 0, dropped: 0, routines: [] }) },
  workoutCompleteSheet: { renders: 'WorkoutComplete', open: workoutCompleteSheet },
  finishSummary: { renders: 'FinishSummary', open: () => { activeWorkout(); finishWorkout() } },
  exerciseNoteSheet: { renders: 'ExerciseNoteSheet', open: () => { activeWorkout(); exerciseNoteSheet(0) } },
  calendarSheet: { renders: 'Calendar', open: () => calendarSheet('2026-02-01') },
  recapSheet: { renders: 'RecapSheet', open: () => recapSheet('2026-02-01') },
  workoutDetailSheet: { renders: 'WorkoutDetail', open: () => workoutDetailSheet(workout) },
  displayNameSheet: { renders: 'DisplayNameSheet', open: displayNameSheet },
  sexSheet: { renders: 'SexSheet', open: sexSheet },
  birthYearSheet: { renders: 'BirthYearSheet', open: birthYearSheet },
  titledConfirm: { renders: 'ConfirmDialog', open: () => confirmSheet({ title: 'Delete workout?', message: 'Gone for good.' }) },
  untitledConfirm: { renders: 'ConfirmDialog', open: () => confirmSheet({ message: 'Gone for good.' }) },
  exerciseDetailSheet: { renders: 'ExerciseDetail', open: () => exerciseDetailSheet(ex()) },
  addToRoutineSheet: { renders: 'AddToRoutine', open: () => addToRoutineSheet(ex()) },
  customExSheet: { renders: 'CustomExForm', open: () => customExSheet(null, () => {}) },
  exercisePicker: { renders: 'ExercisePicker', open: () => exercisePicker(() => {}) },
  exConfigSheet: { renders: 'ExConfig', open: () => exConfigSheet(ex(), { onSave: () => {} }) },
  volumeRangesSheet: { renders: 'VolumeRangesSheet', open: volumeRangesSheet },
  rangeEditSheet: { renders: 'RangeEditSheet', open: () => useUI.getState().openSheet(close => <RangeEditSheet slug="chest" close={close} />) },
  importSummary: {
    renders: 'ImportSummary',
    open: () => useUI.getState().openSheet(close => <ImportSummary close={close}
      parsed={{ kind: 'bodyweight', source: 'Test', from: '2026-02-01', to: '2026-02-02', bodyweight: [{ d: '2026-02-01', w: 80 }], workouts: [] }} />),
  },
  reorderExercisesSheet: { renders: 'ReorderExercisesSheet', open: () => { activeWorkout(); sheetOf(ReorderExercisesSheet)() } },
  editWorkoutSheet: {
    renders: 'EditWorkoutSheet',
    open: () => { activeWorkout(); useUI.getState().openSheet(close => <EditWorkoutSheet close={close} name="Bench" count={1} onReorder={() => {}} onReplace={() => {}} onRemove={() => {}} />) },
  },
}

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

function sourceFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sourceFiles(path)
    return /\.jsx?$/.test(name) && !/\.(test|spec)\./.test(name) ? [path] : []
  })
}

function callText(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++
      continue
    }
    if (c === '(') depth++
    else if (c === ')' && --depth === 0) return text.slice(open, i + 1)
  }
  throw new Error('Unbalanced openSheet call')
}

function openSheetCalls() {
  return sourceFiles(SRC).flatMap(file => {
    const text = readFileSync(file, 'utf8')
    return [...text.matchAll(/\bopenSheet\(/g)]
      .map(m => ({ at: `${relative(SRC, file)}:${text.slice(0, m.index).split('\n').length}`, call: callText(text, m.index + m[0].length - 1) }))
      .filter(({ call }) => !call.startsWith('(render,'))
  })
}

function unnamed({ call }) {
  if (/\blabel\s*:/.test(call)) return null
  const tag = call.match(/<([A-Za-z]\w*)?[\s/>]/)
  if (!tag) return 'renders no JSX the scan can read'
  const component = tag[1] && /^[A-Z]/.test(tag[1]) ? tag[1] : null
  if (!component) return /<h[23][\s>]/.test(call) ? null : 'renders inline JSX with no h2/h3 and passes no label'
  const swept = new Set(Object.values(OPENERS).map(o => o.renders).filter(Boolean))
  return swept.has(component) ? null : `renders <${component}>, which the opener sweep does not open`
}
function accessibleName(dialog) {
  const by = dialog.getAttribute('aria-labelledby')
  if (by) return document.getElementById(by)?.textContent.trim() || ''
  return (dialog.getAttribute('aria-label') || '').trim()
}

let container
let root

beforeAll(async () => {
  await import('../lib/body-paths.js')
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useStore.getState().replaceState(JSON.parse(JSON.stringify(DEF)))
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })
  vi.spyOn(history, 'go').mockImplementation(() => {})
  container = document.createElement('div')
  container.id = 'root'
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => { useUI.setState({ sheets: [] }) })
  if (root) await act(async () => { root.unmount() })
  container?.remove()
  vi.restoreAllMocks()
})

describe('every openSheet call is named', () => {
  it('passes a label, renders an inline h2/h3, or renders a component the sweep opens', () => {
    const calls = openSheetCalls()
    expect(calls.length).toBeGreaterThan(30)
    const misses = calls.map(c => [c.at, unnamed(c)]).filter(([, why]) => why).map(([at, why]) => `${at} ${why}`)
    expect(misses).toEqual([])
  })
})

describe('every sheet opens a named dialog', () => {
  it.each(Object.entries(OPENERS))('%s', async (_, { open }) => {
    await act(async () => { root.render(<Modals />) })
    await act(async () => { open() })
    const dialogs = [...container.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
    expect(dialogs.length).toBeGreaterThan(0)
    for (const dialog of dialogs) expect(accessibleName(dialog)).not.toBe('')
  })
})
