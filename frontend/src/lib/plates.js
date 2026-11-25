import { t, dateLocale } from './i18n-core.js'

/** @typedef {import('./types.js').Unit} Unit */

export const BAR_WEIGHT = { kg: 20, lb: 45 }

const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
}

/** @type {Record<Unit, Record<number, string>>} */
const TONES = {
  kg: { 25: 'red', 20: 'blue', 15: 'yellow', 10: 'green', 5: 'white', 2.5: 'red' },
  lb: { 45: 'blue', 35: 'yellow', 25: 'green', 10: 'white', 5: 'red' },
}

/** @typedef {'big' | 'mid' | 'small' | 'tiny' | 'change'} PlateSize */

/** @type {Record<Unit, Record<number, PlateSize>>} */
const SIZES = {
  kg: { 25: 'big', 20: 'big', 15: 'mid', 10: 'small', 5: 'tiny', 2.5: 'change', 1.25: 'change' },
  lb: { 45: 'big', 35: 'mid', 25: 'small', 10: 'tiny', 5: 'change', 2.5: 'change' },
}

/**
 * @param {string} unit
 * @returns {Unit}
 */
const unitOf = unit => (unit === 'lb' ? 'lb' : 'kg')
/** @param {number} n */
const clean = n => Math.round(n * 1000) / 1000
/** @param {number} n */
const exact = n => n.toLocaleString(dateLocale())

/**
 * @param {number} total
 * @param {Unit | string} [unit='kg']
 * @returns {{ bar: number, perSide: number[], remainder: number, belowBar: boolean }}
 */
export function platesFor(total, unit = 'kg') {
  const key = unitOf(unit)
  const bar = BAR_WEIGHT[key]
  if (!(total >= bar)) return { bar, perSide: [], remainder: 0, belowBar: true }
  let left = clean((total - bar) / 2)
  /** @type {number[]} */
  const perSide = []
  for (const plate of PLATES[key]) {
    while (left >= plate) {
      perSide.push(plate)
      left = clean(left - plate)
    }
  }
  return { bar, perSide, remainder: clean(left * 2), belowBar: false }
}

/**
 * Colour name for one plate; change plates with no colour of their own read as steel.
 * @param {number} plate - Plate weight in `unit`.
 * @param {Unit | string} [unit='kg'] - Profile weight unit.
 * @returns {string} 'red' | 'blue' | 'yellow' | 'green' | 'white' | 'steel'.
 */
export const plateTone = (plate, unit = 'kg') => TONES[unitOf(unit)][plate] || 'steel'

/**
 * Visual size tier for one plate.
 * @param {number} plate - Plate weight in `unit`.
 * @param {Unit | string} [unit='kg'] - Profile weight unit.
 * @returns {PlateSize}
 */
export const plateSize = (plate, unit = 'kg') => SIZES[unitOf(unit)][plate] || 'change'

/**
 * The same reading in words, for the caption and for screen readers.
 * @param {{bar: number, perSide: number[], remainder: number, belowBar: boolean}} load - From platesFor.
 * @param {Unit | string} [unit='kg'] - Profile weight unit.
 * @returns {string} A sentence naming the bar, the plates per side and anything left over.
 */
export function plateCaption(load, unit = 'kg') {
  const bar = exact(load.bar) + ' ' + unit
  if (load.belowBar) return t('Lighter than a {0} bar', bar)
  const left = load.remainder > 0 ? ' · ' + t('{0} not on the bar', exact(load.remainder) + ' ' + unit) : ''
  if (!load.perSide.length) return t('Empty {0} bar', bar) + left
  return t('{0} bar + {1} per side', bar, load.perSide.map(exact).join(' + ')) + left
}
