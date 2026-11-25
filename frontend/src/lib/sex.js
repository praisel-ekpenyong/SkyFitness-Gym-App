
/** @type {readonly ('male' | 'female')[]} */
export const SEXES = ['male', 'female']

/**
 * @param {unknown} value - A stored or restored sex value.
 * @returns {'male'|'female'|null} The value when it is a known sex, else null (not set).
 */
export const cleanSex = value => (value === 'male' || value === 'female' ? value : null)
