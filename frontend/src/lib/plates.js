// Plate math: how a logged load goes on a barbell. Pure and display-only, so nothing here
// can change what was logged — a load the plates cannot make is reported, never rounded.
//
// The bar and plate sets are assumptions about a standard gym, which is why every reading
// names its bar ("20 kg bar + 25 + 15 per side"): the assumption stays visible next to it.
import { t, dateLocale } from './i18n-core.js'

export const BAR_WEIGHT = { kg: 20, lb: 45 }

const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
}

// The competition colour code. Pounds borrow it by position (45 lb sits where 20 kg does),
// which is how colour-coded pound sets are sold.
const TONES = {
  kg: { 25: 'red', 20: 'blue', 15: 'yellow', 10: 'green', 5: 'white', 2.5: 'red' },
  lb: { 45: 'blue', 35: 'yellow', 25: 'green', 10: 'white', 5: 'red' },
}

const unitOf = unit => (PLATES[unit] ? unit : 'kg')
// Loads are stepped in fractions of a kilo, so subtraction leaves binary noise behind.
const clean = n => Math.round(n * 1000) / 1000
// Not fmtNum: it rounds to one decimal, and a 1.25 kg plate is not a 1.3 kg plate.
const exact = n => n.toLocaleString(dateLocale())

/**
 * Breaks a total load into the plates for one side of a barbell, heaviest first.
 * @param {number} total - Whole load including the bar, in `unit`.
 * @param {string} unit - Profile weight unit; anything unknown reads as kilograms.
 * @returns {{bar: number, perSide: number[], remainder: number, belowBar: boolean}}
 *   `remainder` is the part of the total (both sides) no plate combination reaches;
 *   `belowBar` means the load is lighter than the bar, so no plates apply.
 */
export function platesFor(total, unit = 'kg') {
  const key = unitOf(unit)
  const bar = BAR_WEIGHT[key]
  if (!(total >= bar)) return { bar, perSide: [], remainder: 0, belowBar: true }
  let left = clean((total - bar) / 2)
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
 * @param {string} unit - Profile weight unit.
 * @returns {string} 'red' | 'blue' | 'yellow' | 'green' | 'white' | 'steel'.
 */
export const plateTone = (plate, unit = 'kg') => TONES[unitOf(unit)][plate] || 'steel'

/**
 * The same reading in words, for the caption and for screen readers.
 * @param {{bar: number, perSide: number[], remainder: number, belowBar: boolean}} load - From platesFor.
 * @param {string} unit - Profile weight unit.
 * @returns {string} A sentence naming the bar, the plates per side and anything left over.
 */
export function plateCaption(load, unit = 'kg') {
  const bar = exact(load.bar) + ' ' + unit
  if (load.belowBar) return t('Lighter than a {0} bar', bar)
  const left = load.remainder > 0 ? ' · ' + t('{0} not on the bar', exact(load.remainder) + ' ' + unit) : ''
  if (!load.perSide.length) return t('Empty {0} bar', bar) + left
  return t('{0} bar + {1} per side', bar, load.perSide.map(exact).join(' + ')) + left
}
