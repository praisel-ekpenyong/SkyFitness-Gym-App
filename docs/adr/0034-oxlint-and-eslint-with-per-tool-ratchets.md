# oxlint is the main linter, ESLint keeps what oxlint cannot do, and each tool has one ratchet

Status: Accepted, 2026-11-24.

## Context

Sky lints with ESLint 10 only (`frontend/eslint.config.js`, `npm run lint`, in CI and the pre-commit hook), on `@eslint/js` recommended plus `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps` (a warning, so 12 findings pass CI). [`CODING_STANDARDS.md`](../../CODING_STANDARDS.md) names a tooth for each rule, and most of those teeth are lint rules the code breaks today: 54 functions over complexity 15, 18 index keys, 57 accessibility findings, 27 in-place sorts (counts re-measured 2026-11-24). A tooth the code already fails needs a ratchet: a recorded count that may only shrink.

A probe on `ea9b171` measured the options. oxlint 1.95.0 with the react, jsx-a11y, unicorn and oxc plugins runs in about 1 s. ESLint with every `react-hooks` rule runs in about 19 s. oxlint has `complexity`, `no-restricted-globals`, `no-restricted-properties`, `no-restricted-imports`, `no-throw-literal` and the type-aware rows through `oxlint-tsgolint`, but no AST selectors (`no-restricted-syntax`). The official `eslint-plugin-react-hooks` 7.1.1 already ships the React Compiler rules.

## Decision

- **oxlint is the main linter.** It runs in the pre-commit hook and in CI. It owns every rule it supports: `complexity`, the restricted globals and properties (including `Date.now` in `lib/`, by a path-scoped override), `no-throw-literal`, `prefer-promise-reject-errors`, `react/rules-of-hooks`, `react/exhaustive-deps`, its `correctness` category (in place of `@eslint/js` recommended), `unicorn/no-array-sort`, `unicorn/no-array-reverse`, `react/no-array-index-key` and the `jsx-a11y` rules.
- **ESLint stays, narrowed.** It runs in CI. It owns only the official `react-hooks` compiler rules and the `no-restricted-syntax` selectors oxlint cannot express. Until oxlint lands ESLint keeps `rules-of-hooks`, `exhaustive-deps` and `@eslint/js` recommended, and the change that adds oxlint moves them. A rule runs in exactly one tool: oxlint's own `react/*` copies of the compiler rules stay off.
- **oxlint-tsgolint joins after `tsconfig` exists** ([0035](0035-typescript-starts-as-checkjs-with-an-error-baseline.md)), for the type-aware rows: `no-floating-promises`, `no-misused-promises`, `only-throw-error`, `switch-exhaustiveness-check`, `no-explicit-any`.
- **One ratchet format per tool.** ESLint uses its own `frontend/eslint-suppressions.json`. oxlint uses `frontend/lint-baseline.json`, a count per file per rule, checked by a small script. A custom check uses a `*-allowlist.json` of `{ path: { count, reason } }`. tsc uses a per-file error baseline.
- **Every ratchet fails on a new hit and on a stale entry** (a recorded count above the real count), so a fix must also lower the file. A file that is not in a baseline must be clean. A disable comment for a ratcheted rule is illegal.
- **Every check script has a fixture that must fail**, so the check cannot rot into always-green.

ESLint's native suppressions were checked against ESLint 10.15.0: `--suppress-rule` writes the file, a count above the record fails, and a count below it fails with "suppressions left that do not occur anymore" until `--prune-suppressions` runs.

## Consequences

- The pre-commit hook gets faster once ESLint leaves it, and the cheap checks (oxlint, tsc) run on every commit.
- Two linters exist, so the split has to stay clean: a new rule goes in oxlint unless it needs an AST selector or a `react-hooks` rule.
- Nothing is installed by this ADR. [`CODING_STANDARDS.md`](../../CODING_STANDARDS.md) lists each rule as **To add** until its tool and ratchet file exist.
