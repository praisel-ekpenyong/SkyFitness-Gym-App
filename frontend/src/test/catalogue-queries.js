import { fireEvent, within } from '@testing-library/react'

// Filter chips and form chips are the buttons that report a pressed state. A form shows two rows
// of them (primary, then secondary muscles); a row is the chips that share a parent.

const pressable = container => within(container).queryAllByRole('button').filter(b => b.hasAttribute('aria-pressed'))

export const allChips = pressable

/** Chips grouped by the row they sit in, in screen order. */
export const chipRows = container => {
  const rows = new Map()
  for (const chip of pressable(container)) rows.set(chip.parentElement, [...(rows.get(chip.parentElement) ?? []), chip])
  return [...rows.values()]
}

export const chipRow = (container, index) => chipRows(container)[index] ?? []

export const chipNamed = (chips, name) => chips.find(c => c.textContent.trim() === name)

export const isOn = chip => chip?.getAttribute('aria-pressed') === 'true'


export const typeInto = (field, value) => fireEvent.change(field, { target: { value } })

/** The sheet's main action: Save, Add to routine or Create exercise. */
export const primaryAction = container =>
  within(container).getByRole('button', { name: /^(Save|Add to routine|Create exercise)$/ })
