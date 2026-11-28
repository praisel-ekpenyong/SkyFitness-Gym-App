/** @typedef {import('./types.js').Prescription} Prescription */
/** @typedef {import('./types.js').PrescriptionRecord} PrescriptionRecord */

/**
 * Freeze a Prescription (or an already-frozen Prescription record) into the
 * canonical Prescription-record shape: `kind` plus only the resolution fields
 * that are present. No clock, no store: a pure value-to-value projection shared
 * by the Session boundary and the Prospective Prescription reading (ADR 0037).
 *
 * @param {Prescription | PrescriptionRecord | null | undefined} plan
 * @returns {PrescriptionRecord | null}
 */
export function freezePrescriptionRecord(plan) {
  if (!plan || typeof plan !== 'object') return null
  /** @type {PrescriptionRecord} */
  const out = { kind: plan.kind }
  for (const key of /** @type {const} */ (['weight', 'reps', 'sec', 'sets'])) {
    if (plan[key] != null) out[key] = plan[key]
  }
  return out
}
