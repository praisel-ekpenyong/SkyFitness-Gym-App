import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useUI } from '../store/useUI.js'

const textsOf = el => [...el.querySelectorAll('*')].filter(n => !n.children.length).map(n => n.textContent)

/** The visible texts of an element, one per leaf: a row's title, subtitle and value. */
export const leafTexts = el => [el.textContent, ...textsOf(el)]

/** The button in `scope` named `name`, by its aria-label or one of its texts. */
export function buttonNamed(scope, name) {
  return [...scope.querySelectorAll('button')]
    .find(b => b.getAttribute('aria-label') === name || leafTexts(b).includes(name))
}

/** Renders the top sheet, clicks the option named `name`, and unmounts it. */
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

/** Opens the row named `title` in `scope` and picks `option` in the sheet it opens. */
export async function pick(scope, title, option) {
  await act(async () => { buttonNamed(scope, title).click() })
  await pickInSheet(option)
}
