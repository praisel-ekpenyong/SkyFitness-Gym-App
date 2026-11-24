# TypeScript starts as a strict checkJs pass with a per-file error baseline

Status: Accepted, 2026-11-24.

## Context

Sky is JavaScript: `frontend/` has no `.ts` file and no `tsconfig`. The target is strict TypeScript. A probe on `ea9b171` ran `tsc` (TypeScript 7, `allowJs`, `checkJs`, `strict`) in about 1.6 s and found 6247 errors: 2950 in app code (`lib/` 1652, `sheets/` 452, `views/` 388, `components/` 291, `platform/` 77, `store/` 65, the `src` root 25) and 3297 in tests. About three quarters are implicit `any`; the rest, around 600, are real shape and null findings. There is no `@typedef` in the tree, so every `@param {Object}` is a future `any`.

## Decision

- **Start with the checker, not a rename.** Add `frontend/tsconfig.json` with `strict`, `allowJs` and `checkJs` over all app code, and run `npm run typecheck` in the pre-commit hook and in CI.
- **Ratchet the errors per file.** `frontend/tsc-baseline.json` holds the error count per file. It may only shrink, it fails on a stale entry, and one npm script (`npm run typecheck:baseline`) rewrites it. A file not in the baseline is new and must be clean.
- **First work: JSDoc `@typedef`s** for `Profile`, `Workout`, `Entry`, `SetRow` and the Routine exercise.
- **Then rename to `.ts`, starting with `lib/`.** Pure domain logic has no browser dependency. Tests join last.
- **Type-aware oxlint rows join** once the checker is on ([0034](0034-oxlint-and-eslint-with-per-tool-ratchets.md)).

## Consequences

- The 1.6 s cost is paid on every commit from day one, and the baseline makes the migration visible as a number that falls.
- No `.ts` file lands before the checker does, so no TypeScript file is unchecked.
- `typescript/no-unsafe-*` stays off until the typedefs exist: it would fire thousands of times and mean nothing.
- Nothing is installed by this ADR; `typescript`, `@types/react` and the baseline arrive with the first ticket.
