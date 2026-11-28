import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { fireEvent, screen, within } from '@testing-library/react'
import { useUI } from '../store/useUI.js'
import { typeInto } from './catalogue-queries.js'
import { search } from './library-queries.js'

const textsOf = el => [...el.querySelectorAll('*')].filter(n => !n.children.length).map(n => n.textContent)

export const leafTexts = el => [el.textContent, ...textsOf(el)]

export function buttonNamed(scope, name) {
  return [...scope.querySelectorAll('button')]
    .find(b => b.getAttribute('aria-label') === name || leafTexts(b).includes(name))
}

export async function pickInSheet(name) {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => { root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))) })
  await act(async () => { buttonNamed(host, name).click() })
  await act(async () => { root.unmount() })
  host.remove()
}

export async function pick(scope, title, option) {
  await act(async () => { buttonNamed(scope, title).click() })
  await pickInSheet(option)
}

/** Every sheet the sheet host shows, bottom to top. */
export const openSheets = () => [...screen.queryAllByRole('dialog'), ...screen.queryAllByRole('alertdialog')]
  .sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)

/** The sheet a lifter is looking at: the last one the sheet host shows. */
export function topSheet() {
  const open = openSheets()
  if (!open.length) throw new Error('No sheet is open')
  return open.at(-1)
}

/** Taps the button of that name in the sheet on top. */
export function tapInSheet(name) {
  fireEvent.click(within(topSheet()).getByRole('button', { name }))
}

/** The text field of that name in the sheet on top, such as Sets, Reps or Weight (kg). */
export const sheetField = name => within(topSheet()).getByRole('textbox', { name })

/** Types a value into the text field of that name in the sheet on top. */
export const typeInSheet = (name, value) => typeInto(sheetField(name), String(value))

/** Finds an exercise in the picker on top by searching its name, then taps its tile. */
export function pickExercise(name) {
  search(topSheet(), name)
  tapInSheet(name)
}
