import { fireEvent, within } from '@testing-library/react'

// How a lifter reads the Exercises list: a tile is the button that holds an exercise's star, and
// a chip is a filter button that reports whether it is pressed.

/** Every exercise tile on screen (the "Create your own exercise" tile has no star). */
export const tilesIn = container => within(container)
  .queryAllByRole('button', { name: /^(Add to|Remove from) favorites$/ })
  .map(star => star.closest('[role="button"]'))

/** The tile whose exercise name contains `text`, whatever its case. */
export const tileNamed = (container, text) =>
  tilesIn(container).find(tile => tile.getAttribute('aria-label').toLowerCase().includes(text.toLowerCase()))

/** The filter chip of that name. Chips are the buttons that report a pressed state. */
export const chipIn = (container, name) =>
  within(container).getAllByRole('button', { name }).find(b => b.hasAttribute('aria-pressed'))

/** Every filter chip, muscle chips first then equipment, in screen order. */
export const chipNamesIn = container =>
  within(container).getAllByRole('button').filter(b => b.hasAttribute('aria-pressed')).map(b => b.textContent.trim())

export const search = (container, text) =>
  fireEvent.change(within(container).getByRole('textbox', { name: 'Search exercises' }), { target: { value: text } })
