// Two known hits of typescript/no-floating-promises, for check-lint-baseline.test.mjs.
async function work() {}
export function a() { work() }
export function b() { work() }
