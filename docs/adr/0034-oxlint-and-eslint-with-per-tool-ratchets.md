# oxlint is the main linter, ESLint keeps what oxlint cannot do, and each tool has one ratchet

Status: Accepted, 2026-11-24.

## Context

Sky lints with ESLint 10 only (`frontend/eslint.config.js`, `npm run lint`, in CI and the pre-commit hook), on `@eslint/js` recommended plus `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps` (a warning, so 12 findings pass CI). [`CODING_STANDARDS.md`](../../CODING_STANDARDS.md) names a tooth for each rule, and most of those teeth are lint rules the code breaks today: 54 functions over complexity 15, 18 index keys, 57 accessibility findings, 27 in-place sorts (counts re-measured 2026-11-24). A tooth the code already fails needs a ratchet: a recorded count that may only shrink.

_(Superseded by the 2026-11-25 amendment below: ESLint runs in CI only; the pre-commit hook runs the oxlint ratchet and tsc.)_

_(Superseded for `eslint/no-unused-vars` by the 2026-11-25 amendment below: that rule keeps ESLint's options and reports 0 hits, so this line does not apply to it.)_

A probe on `ea9b171` measured the options. oxlint 1.95.0 with the react, jsx-a11y, unicorn and oxc plugins runs in about 1 s. ESLint with every `react-hooks` rule runs in about 19 s. oxlint has `complexity`, `no-restricted-globals`, `no-restricted-properties`, `no-restricted-imports`, `no-throw-literal` (which `only-throw-error` replaces; `Promise.reject(nonError)` is then uncovered, and `typescript/prefer-promise-reject-errors` is a possible later row) and the type-aware rows through `oxlint-tsgolint`, but no AST selectors (`no-restricted-syntax`). The official `eslint-plugin-react-hooks` 7.1.1 already ships the React Compiler rules.

## Decision

- **oxlint is the main linter.** It runs in the pre-commit hook and in CI. It owns every rule it supports: `complexity`, the restricted globals and properties (including `Date.now` in `lib/`, by a path-scoped override), `typescript/only-throw-error`, `react/rules-of-hooks`, `react/exhaustive-deps`, its `correctness` category (in place of `@eslint/js` recommended, with the `no-unused-vars` carve-out in the 2026-11-25 amendment below), `unicorn/no-array-sort`, `unicorn/no-array-reverse`, `react/no-array-index-key` and the `jsx-a11y` rules.
- **ESLint stays, narrowed.** It runs in CI. It owns only the official `react-hooks` compiler rules and the `no-restricted-syntax` selectors oxlint cannot express. Until oxlint lands ESLint keeps `rules-of-hooks`, `exhaustive-deps` and `@eslint/js` recommended, and the change that adds oxlint moves them. A rule runs in exactly one tool: oxlint's own `react/*` copies of the compiler rules stay off.
- **oxlint-tsgolint joined once `tsconfig` existed** ([0035](0035-typescript-starts-as-checkjs-with-an-error-baseline.md)), for the type-aware rows: `no-floating-promises`, `no-misused-promises`, `only-throw-error`, `switch-exhaustiveness-check`, `no-explicit-any`, `no-non-null-assertion`, `ban-ts-comment`. The ratchet runs oxlint with `--type-aware` against `frontend/tsconfig.json`. The `typescript` plugin's other `correctness` rules stay off. `no-unsafe-*` and `no-unnecessary-condition` are deferred until the typedefs are in.
- **One ratchet format per tool.** ESLint uses its own `frontend/eslint-suppressions.json`. oxlint uses `frontend/lint-baseline.json`, a count per file per rule, checked by a small script. A custom check uses a `*-allowlist.json` of `{ path: { count, reason } }`. tsc uses a per-file error baseline.
- **Every ratchet fails on a new hit and on a stale entry** (a recorded count above the real count), so a fix must also lower the file. A file that is not in a baseline must be clean. A disable comment for a ratcheted rule is illegal.
- **Every check script has a fixture that must fail**, so the check cannot rot into always-green.

ESLint's native suppressions were checked against ESLint 10.15.0: `--suppress-rule` writes the file, a count above the record fails, and a count below it fails with "suppressions left that do not occur anymore" until `--prune-suppressions` runs.

## Consequences

- The pre-commit hook gets faster once ESLint leaves it, and the cheap checks (oxlint, tsc) run on every commit.
- Two linters exist, so the split has to stay clean: a new rule goes in oxlint unless it needs an AST selector or a `react-hooks` rule.
- [`CODING_STANDARDS.md`](../../CODING_STANDARDS.md) lists each rule as **To add** until its tool exists (and its ratchet file, where today's code is over the bar), then as **Runs**.

## Amendment 2026-11-25: `no-unused-vars` keeps ESLint's options

Issue #102 asked for the plain-`correctness` `no-unused-vars` count — 24 hits from the earlier tooling probe — to be recounted and baselined in `frontend/lint-baseline.json`. That historical ask is superseded and must not be followed.

1. `frontend/.oxlintrc.json` enables `eslint/no-unused-vars` under `correctness` with ESLint's old options: `args: none`, `caughtErrors: none`, `ignoreRestSiblings: true`. The configured rule reports 0 hits across the app, so the file has no `no-unused-vars` baseline entry. `no-empty` keeps its old options on the same basis.
2. Seeding 24 entries by hand would record hits the configured rule does not report. Because every ratchet fails on a stale entry (a recorded count above the real count), the first run would fail and the shrink-only ratchet would never settle. The ratchet is unchanged for every other rule.

This supersedes the "a tooth the code already fails needs a ratchet" line in Context for this one rule, and the matching recount-and-baseline line in issue #102.

## Amendment 2026-11-25: the disable-comment ban covers every rule, and has a check

The Decision said a disable comment for a ratcheted rule is illegal, but nothing checked it. The ban now covers every disable comment, for any rule, in both tools:

1. `frontend/eslint.config.js` sets `linterOptions.noInlineConfig`, so an `eslint-disable` or inline rule comment hides nothing, and `npm run lint` runs ESLint with `--max-warnings 0`, so the warning ESLint leaves for the comment fails the lint. Fixture: `frontend/scripts/eslint-inline-config.test.mjs`.
2. `frontend/scripts/check-lint-baseline.mjs` fails any `oxlint-disable` or `eslint-disable` comment (oxlint honours both) in a file oxlint lints. Fixture: `frontend/scripts/check-lint-baseline.test.mjs`.

## Amendment 2026-11-25: ESLint left the pre-commit hook

The Context line saying ESLint runs "in CI and the pre-commit hook" is superseded. `.githooks/pre-commit` now runs the oxlint ratchet (`node scripts/check-lint-baseline.mjs`) and `npm run typecheck` (the tsc ratchet); ESLint runs only in CI as the second half of `npm run lint`. `CODING_STANDARDS.md` states the same split. No rule moved between the two tools, and neither ratchet file changed.
