// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import Modals from '../components/Modals.jsx'
import { DEF, useStore } from '../store/useStore.js'
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
import { volumeRangesSheet } from './volume.jsx'

const ex = () => exOr('0025')
const workout = { id: 'w1', d: '2026-02-15', name: 'Push', start: 1000, end: 1000 + 40 * 60000, entries: [] }

// Every sheet the app opens must be named: by its first h2/h3, or by a label passed to openSheet.
const OPENERS = {
  bwSheet: () => bwSheet(),
  requiredBwSheet: () => bwSheet({ required: true }),
  goalSheet,
  dayOverrideSheet: () => dayOverrideSheet('2026-02-16'),
  dayAssignSheet: () => dayAssignSheet(1),
  glyphPicker: () => glyphPicker(null, () => {}),
  planToolsSheet,
  workoutCompleteSheet,
  calendarSheet: () => calendarSheet('2026-02-01'),
  recapSheet: () => recapSheet('2026-02-01'),
  workoutDetailSheet: () => workoutDetailSheet(workout),
  displayNameSheet,
  sexSheet,
  birthYearSheet,
  titledConfirm: () => confirmSheet({ title: 'Delete workout?', message: 'Gone for good.' }),
  untitledConfirm: () => confirmSheet({ message: 'Gone for good.' }),
  exerciseDetailSheet: () => exerciseDetailSheet(ex()),
  addToRoutineSheet: () => addToRoutineSheet(ex()),
  customExSheet: () => customExSheet(null, () => {}),
  exercisePicker: () => exercisePicker(() => {}),
  exConfigSheet: () => exConfigSheet(ex(), null, () => {}),
  volumeRangesSheet,
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

describe('every sheet opens a named dialog', () => {
  it.each(Object.entries(OPENERS))('%s', async (_, open) => {
    await act(async () => { root.render(<Modals />) })
    await act(async () => { open() })
    const dialogs = [...container.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
    expect(dialogs.length).toBeGreaterThan(0)
    for (const dialog of dialogs) expect(accessibleName(dialog)).not.toBe('')
  })
})
