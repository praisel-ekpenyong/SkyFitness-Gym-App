// The Profile's optional sex, used only to pick a Strength standard table. Anything but the two
// known values reads as not set, so a stored or restored value can never grade against the wrong table.

export const SEXES = ['male', 'female']

/**
 * @param {unknown} value - A stored or restored sex value.
 * @returns {'male'|'female'|null} The value when it is a known sex, else null (not set).
 */
export const cleanSex = value => (SEXES.includes(value) ? value : null)
