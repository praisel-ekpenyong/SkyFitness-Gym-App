// The Profile's optional birth year. From age 40 the Strength standard's thresholds are divided by
// McCulloch's masters coefficient for the lifter's age. Under 40, or with no birth year, no adjustment.

/** McCulloch's masters coefficients, [age, coefficient], interpolated between rows and capped at 80. */
const MASTERS = [[40, 1.00], [45, 1.06], [50, 1.13], [55, 1.21], [60, 1.30], [65, 1.43], [70, 1.59], [75, 1.79], [80, 2.03]]

/**
 * @param {unknown} value - A stored or restored birth year.
 * @param {number} now - Injected millisecond timestamp; the year it falls in is the latest allowed birth year.
 * @returns {number|null} The year when it is four digits and not in the future, else null (not set).
 */
export function cleanBirthYear(value, now) {
  const year = new Date(now).getFullYear()
  return Number.isInteger(value) && value >= 1000 && value <= 9999 && value <= year ? value : null
}

/**
 * The masters coefficient for a lifter of this birth year at this time.
 * @param {number|null} birthYear - Cleaned birth year, or null.
 * @param {number} now - Injected millisecond timestamp.
 * @returns {number} 1 when no adjustment applies, else the interpolated coefficient.
 */
export function ageCoefficientOf(birthYear, now) {
  if (birthYear == null) return 1
  const age = new Date(now).getFullYear() - birthYear
  if (age < MASTERS[0][0]) return 1
  if (age >= MASTERS[MASTERS.length - 1][0]) return MASTERS[MASTERS.length - 1][1]
  const i = MASTERS.findIndex(([a]) => a > age) - 1
  const [a0, c0] = MASTERS[i]
  const [a1, c1] = MASTERS[i + 1]
  return c0 + ((age - a0) / (a1 - a0)) * (c1 - c0)
}
