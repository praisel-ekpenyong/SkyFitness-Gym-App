# Coding standards

The rules a human or an agent holds in their head while writing and reviewing
code in Sky. Each rule's essence is here; the longer reasoning lives in the doc it
links.

Sky is a single-user, no-login, backend-free gym and body-weight tracker built
with React 19, Zustand, Immer, and Vite PWA.

A rule the code already breaks stays. The code is not the bar. Under each
rule, **Runs** names the check that fails today. **To add** names a check that
does not exist yet, with the tool and the exact rule id (or the script and its
allowlist file). An agent must not pretend a **To add** check is already in CI.
A rule with no tool behind it says **Judgement call, no tooth** and is decided
in review. Each rule is an imperative that names its one legal exception, and a
**Why** line cites the commit or `file:line` that earned it.

## The tools

- **oxlint** (1.95.0) is the main linter (well under 1 s, fast enough for the
  pre-commit hook): `frontend/.oxlintrc.json`. The pre-commit hook
  (`.githooks/pre-commit`) runs its ratchet
  (`node scripts/check-lint-baseline.mjs`). CI (`.github/workflows/test.yml`)
  runs the same ratchet as the first half of `npm run lint`. A rule oxlint
  supports goes in oxlint. Today it runs its `correctness` category (in place of
  `@eslint/js` recommended, with `no-unused-vars` and `no-empty` keeping
  ESLint's old options — see the 2026-11-25 carve-out below), `react/rules-of-hooks`,
  `react/exhaustive-deps` and the type-aware `typescript/*` rows (see "What runs"), all at error, tests
  excluded. The ratchet runs oxlint with `--type-aware` against
  `frontend/tsconfig.json` through `oxlint-tsgolint` (pinned at 7.0.2008, the
  version oxlint 1.95.0 asks for). The `typescript` plugin brings its own
  `correctness` rules; those not named in this document are listed as `off` in
  `.oxlintrc.json` (oxlint's categories are global, so they are switched off one
  by one), so only the rows below are rules. Its own `react/*` copies of the
  compiler rules are off too.
  A second config, `frontend/.oxlintrc.tests.json`, runs in the same ratchet and lints
  test files with the `jest` plugin: `expect-expect`, `no-conditional-expect`,
  `no-focused-tests`, `no-disabled-tests` and `no-identical-title`, at error with 0
  hits and no baseline entries. It has no type-aware rows.
- **ESLint 10** runs after the oxlint ratchet in `npm run lint`, and only in CI:
  `frontend/eslint.config.js`. The pre-commit hook does not call ESLint. It
  keeps only what oxlint cannot do: the official `eslint-plugin-react-hooks`
  compiler rules, and `no-restricted-syntax` selectors (oxlint has no AST
  selectors). Ten compiler rules are on at error (see "Render stays pure"): six
  with 0 hits (`refs` and `memo-dependencies` included), and `static-components` and
  `purity` baselined in `frontend/eslint-suppressions.json`.
  `react-hooks/todo` stays off. The `no-restricted-syntax` selectors run from
  one table in `frontend/eslint.config.js`, with their hits baselined in the same
  suppressions file. ESLint's own ratchet counts hits per rule, not per selector,
  so `frontend/scripts/check-eslint-selectors.mjs` re-lints only the suppressed
  files with an empty suppressions file and ratchets each `no-restricted-syntax`
  hit by its selector message in `frontend/eslint-selector-suppressions.json`.
  Compiler-rule hits stay on ESLint's own per-rule ratchet, since their messages
  contain source snippets and line numbers. Fixture:
  `check-eslint-selectors.test.mjs`. A rule runs in one tool, never two.

- **tsc** (strict, `allowJs`, `checkJs`, `frontend/tsconfig.json`) runs in the
  pre-commit hook and in CI (`npm run typecheck`, ratcheted by
  `frontend/tsc-baseline.json` via `frontend/scripts/check-tsc-baseline.mjs`).
  `frontend/scripts/check-ts-comments.mjs`, also in `npm run typecheck`, fails
  `@ts-ignore` and `@ts-nocheck` in `.js`/`.jsx` files: oxlint's
  `ban-ts-comment` does not flag them there. Fixture:
  `check-ts-comments.test.mjs`.
  oxlint's type-aware rows run against the same `tsconfig.json`.
- **Vitest guard tests** (`npm test`) and `frontend/scripts/check-*.mjs`
  scripts cover what no linter can express.
- **Doc count claims** in this file and `docs/TESTING_STANDARDS.md` sit inside an
  HTML comment whose body names the source and key (`ratchet: source#key`) and
  whose content is a claim such as `N hits in M files`.
  `frontend/scripts/check-doc-counts.mjs`, run by `npm test`, reads the number
  and file count from the named ratchet JSON, so a stale claim fails the suite.
  `npm run doc-counts:baseline` refreshes marked claims; fixture:
  `check-doc-counts.test.mjs`. Historical probe numbers and zero-hit claims are
  left as prose: neither has a live JSON entry to check against.

**Amendment 2026-11-25 (`eslint/no-unused-vars` carve-out, closing the count gap from issue #102).** The historical line "recount `no-unused-vars` under `correctness` and baseline the 24 probe hits" is **superseded** and must not be followed. `frontend/.oxlintrc.json` keeps ESLint's old options for the rule (`args: none`, `caughtErrors: none`, `ignoreRestSiblings: true`), so the configured rule reports 0 hits and has no entry in `frontend/lint-baseline.json`. Do not seed 24 entries by hand: a recorded count above the configured rule's real count is stale, and every ratchet fails on a stale entry ([ADR 0034 amendment 2026-11-25](./docs/adr/0034-oxlint-and-eslint-with-per-tool-ratchets.md)).

Where today's code is over the bar, the check is a ratchet, and each tool has
one format. Every ratchet fails on a new hit, and fails on a stale entry (a
recorded count above the real count), so a fix has to lower the file too.

| Tool | Ratchet file | Rewritten by |
|---|---|---|
| ESLint | `frontend/eslint-suppressions.json` (ESLint's own, count per file per rule) | `eslint --suppress-rule <id>`, `eslint --prune-suppressions` |
| ESLint selectors | `frontend/eslint-selector-suppressions.json` (count per file, rule and selector message) | `npm run lint:selectors:baseline` (`frontend/scripts/check-eslint-selectors.mjs --write`), which lowers counts and never raises one |
| oxlint | `frontend/lint-baseline.json` (count per file per rule, rule as oxlint reports it, e.g. `react-hooks/exhaustive-deps`) | `npm run lint:baseline` (`frontend/scripts/check-lint-baseline.mjs --write`), which lowers counts and never raises one |
| Custom checks | `*-allowlist.json`, `{ "path": { "count": N, "reason": "..." } }` | by hand, with a reason |
| tsc | `frontend/tsc-baseline.json` (error count per file) | `npm run typecheck:baseline` |

Every check script has a fixture that must fail, so the check cannot rot into
always-green. A file that is not in a baseline must be clean. A disable comment
is illegal, for any rule: ESLint sets `linterOptions.noInlineConfig`, so the
comment hides nothing and `npm run lint` (`--max-warnings 0`) fails on the
warning it leaves (fixture: `frontend/scripts/eslint-inline-config.test.mjs`);
`check-lint-baseline.mjs` fails any `oxlint-disable` or `eslint-disable` comment
in a file oxlint lints (fixture: `check-lint-baseline.test.mjs`). The decisions are in
[ADR 0034](./docs/adr/0034-oxlint-and-eslint-with-per-tool-ratchets.md) and
[ADR 0035](./docs/adr/0035-typescript-starts-as-checkjs-with-an-error-baseline.md).

## Configuration

Read every environment variable in `validateEnv`
([`frontend/src/lib/env.js`](./frontend/src/lib/env.js)). Callers use
`env.imgBase`, never `import.meta.env` inside a feature branch. An optional
variable has its default in `validateEnv`: a missing `VITE_IMG_BASE` is
`media/images/`. A variable with no safe default throws from `validateEnv` at
load, and the message names the variable. Profile preferences (`restSec`,
`sound`, `unit`) are fields on `S`, read when used. Exception: the two Vite
build flags that are not configuration, `import.meta.env.MODE` in `useStore.js`
(Immer's test freeze) and `import.meta.env.DEV` in `components/Modals.jsx`.

**Runs:** `frontend/src/lib/env.test.js` pins the defaults. ESLint
`no-restricted-syntax` selectors on
`MemberExpression[object.type='MetaProperty'][property.name='env']` and on
`process.env` fail outside `lib/env.js`, `vite.config.js`, scripts and tests.
The two build flags above are the allowlist, each with its reason in the
config: `useStore.js` may read only `import.meta.env.MODE` and `Modals.jsx` only
`import.meta.env.DEV`; any other `import.meta.env` read there fails.
`frontend/scripts/env-lint.test.mjs` pins the allowlist. No ratchet.

## Active-workout effects

Sky does not use the functional Effect library. An effect here is a plain
serializable object `{ type, ... }` describing work the UI must perform after a
command (timers, sound, notices, finish sheet). Detail, runner semantics, and
the boundary: [`docs/EFFECT_STANDARDS.md`](./docs/EFFECT_STANDARDS.md).

### Effects are run, never dropped

An effect that is neither performed nor returned to a caller who performs it is
silently skipped. `act` returns the full list. The store runs it through
`runEffects` before returning. The view performs `open-finish` only. A Manual
rest is the view calling `startRest` itself. Tests assert the list on `act`'s
result.

### Failures stay on the result

A refused command returns `{ ok: false, effects: [] }`. Callers branch on `ok`.
An unknown `command.type` throws from `act`. A `hold:start` with no `send`
throws from `runEffects`.

### Effects stay inside their boundary

`lib/` returns effects and never performs them. `runEffects` is the only store
code that touches `useUI`. A view sends commands and renders `sessionView`.

**Runs:** `frontend/src/lib/purity.test.js`, and the closed-set guard test
`frontend/src/effect-types.test.js`.
Detail: [`docs/EFFECT_STANDARDS.md`](./docs/EFFECT_STANDARDS.md).

## Control flow

### A switch over a union names every member

A `switch` on a union type lists every member as its own `case`, even those that
share a branch. A `default` that quietly absorbs leftover members will also absorb
new members added in the future without an explicit decision. Without a `default`,
adding a member to a union forces every switch site to handle it. Exception: none.

**Runs:** oxlint `typescript/switch-exhaustiveness-check` at error (type-aware,
0 hits, no baseline entry). While the code is JavaScript few switches have a
union type for it to check; the stand-in for the effect and command sets is the
closed-set guard test above.

### Functions stay simple

No function has a cyclomatic complexity over 15 (`complexity`, `modified`
variant, so a whole `switch` counts once). Over the limit, split it: extract named
pure helpers or move decision trees into domain reducers. Exception: a function
already over 15 sits in `frontend/lint-baseline.json`, may not grow, and leaves
the file when it is split. A disable comment is never the way out.

**Why:** <!-- ratchet: lint-baseline.json#eslint/complexity -->49 functions in 30 files<!-- /ratchet --> are over the bar today. The worst is
`evaluateSetMilestone` in `lib/progression.js` (83, line 521), then
`evaluateSessionProgression` (74), `parseWorkoutCSV` in `lib/import-csv.js`
(66) and `Home.jsx` (62). A function that size has branches no test reaches.
**Runs:** oxlint `eslint/complexity` at error (`max: 15`, `variant: 'modified'`),
tests excluded. Its <!-- ratchet: lint-baseline.json#eslint/complexity -->49 hits in 30 files<!-- /ratchet --> sit in
`frontend/lint-baseline.json` and may only fall. `scripts/review/audit.mjs` is
the one added after the issue's count.

## Errors

### Throw Errors, not values

Outside command results, throw an `Error` or a subclass of `Error`. A thrown
string or plain object has no stack trace and fails downstream `instanceof Error`
checks. Exception: inside command handlers (`act`), a domain refusal is
`{ ok: false }`, not a throw. An empty `catch {}` is allowed where the failure is
harmless and best effort (`.oxlintrc.json` sets `allowEmptyCatch` for that).
Never use one where the swallowed failure would lose or hide lifter data.

**Why:** the rule already holds (0 thrown literals today), so the tooth is free.
**Runs:** oxlint `typescript/only-throw-error` at error (type-aware, 0 hits, no
baseline entry). It replaced `eslint/no-throw-literal`, which is removed: it
also catches a thrown value that is not typed as an `Error`. It does not cover
`Promise.reject(nonError)`, which `eslint/prefer-promise-reject-errors` used to
catch; `typescript/prefer-promise-reject-errors` is a possible later row.

### A catch hides nothing from the lifter

`lib/` does not catch a refusal and turn it into an empty success; the caller
sees the refusal ([`docs/EFFECT_STANDARDS.md`](./docs/EFFECT_STANDARDS.md)). An
error a lifter reads says what happened and what to do, through `t()`.
Exception: none.

**Judgement call, no tooth.** Two rules: a `catch` that hides a refusal in
`lib/`, and the wording of a lifter-facing error.

### Every promise is awaited, handled or marked void

A promise nobody awaits loses its rejection: the failure turns into an
unhandled rejection rather than an error the caller sees, and the work it
started may still be running after the caller has moved on. Await it, or
`.catch` it where it is made. When fire-and-forget is the intent (a
signal handler, a best-effort log line), write `void promise`. Do not hand an
async function to a slot that expects a `void` callback either (an event
listener, `forEach`), because nothing there awaits or catches what it returns.
Exception: none.

**Why:** a floating promise drops its rejection, so a failed write never
reaches the code that records it (`isMirrorFailing()` for the mobile file
mirror). `nativeSave` in `platform/mobile.js` is not a hit: it rejects on a
failed write and `nativeSink` awaits it.
**Runs:** oxlint `typescript/no-floating-promises` (<!-- ratchet: lint-baseline.json#typescript/no-floating-promises -->14 hits in 10 files<!-- /ratchet -->) and
`typescript/no-misused-promises` (<!-- ratchet: lint-baseline.json#typescript/no-misused-promises -->12 hits in 11 files<!-- /ratchet -->), type-aware, at error
(`frontend/tsconfig.json`, app code and `scripts/`). The old hits are in
`frontend/lint-baseline.json`, and a new one fails
`npm run lint`.

## Function signatures

Optional parameters passed to functions should be scrutinized extremely
carefully. They are a frequent source of bugs by omission. Prioritize correctness
and explicit configuration over backward compatibility. A reviewer asks: does a
caller omit this today, and what does the function assume when it does?

**Judgement call, no tooth.** The clock default is the one case with a tooth: see
"The clock is an argument in `lib/`".

## Types and TypeScript migration

The target is strict TypeScript, reached by checking the JavaScript first. The
tree is JavaScript today (`frontend/` has no `.ts` file yet), checked by
`frontend/tsconfig.json`.

### The checker comes first

`frontend/tsconfig.json` runs with `strict: true`, `allowJs` and `checkJs` over
all app code, and `npm run typecheck` runs in the pre-commit hook and in CI. A probe measured 6247 errors at `strict`: 2950 in app code (`lib/`
1652, `sheets/` 452, `views/` 388, `components/` 291, `platform/` 77, `store/` 65,
the `src` root 25) and 3297 in tests. About three quarters are implicit `any`.
The errors are a ratchet, not a blocker: `frontend/tsc-baseline.json` holds the
error count per file, may only shrink, and fails on a stale entry. One command,
`npm run typecheck:baseline`, rewrites it. A file that is not in the baseline is
new and must be clean. Exception: none.

**Why:** a type that nothing checks is an unenforced rule.
**Runs:** `frontend/tsconfig.json`, `npm run typecheck`
(`frontend/scripts/check-tsc-baseline.mjs`, with its failing fixture in
`npm test`) in `.github/workflows/test.yml` and `.githooks/pre-commit`, and
`frontend/tsc-baseline.json`.

### Name the entities in JSDoc first

The first work after the checker is JSDoc `@typedef`s for `Profile`, `Workout`,
`Entry`, `SetRow` and the Routine exercise (`Target`). They are in
`frontend/src/lib/types.js`, and app code imports them by name (253 `@typedef`
lines in 60 non-test files, counted 2026-11-25). No `@param {Object}` is left in
non-test code: a parameter names its type. After that, rename files to `.ts`
starting with `lib/`. Tests join last.

**Judgement call, no tooth.** The baseline shows the work shrinking.

### Every `any` is a leak

An `any` switches off the type checker for every value that flows through it.
Write the type you mean:
- A known shape gets a named `interface` or `type`.
- An unknown shape gets `unknown` and is narrowed before use.
- A value that varies by caller gets a generic constrained to the real type.

An assertion (`as`, `!`) is a hidden `any`: narrow with type guards instead.
`as const` and `satisfies` pass. Narrow a third-party `any` once, at the edge
(the platform adapter, CSV parser, or external event listener). Never let untyped
external data flow unchecked into `frontend/src/lib/`. A helper that must cast is
a generic whose type parameter is constrained, never a bare `<T>(v: unknown): T`.
Exception: the edge itself.

Until the checker is on, a `.js` file still follows the rule. JSDoc at the
boundary is the stand-in, not a cast.

**Runs:** oxlint `typescript/no-explicit-any`, `typescript/no-non-null-assertion`
and `typescript/ban-ts-comment` at error, 0 hits each today (the JSDoc
`{any}` in `platform/storage.js` is a comment, not a TypeScript node), so no
baseline entry. A new hit is fixed, never baselined.

**Deferred, not rules now:** `typescript/no-unsafe-*` and
`typescript/no-unnecessary-condition` (117 hits in the probe on `ea9b171`).
Today they fire hundreds to thousands of times and mean nothing, because every
value is an implicit `any`. Each becomes a rule, with a baseline, once the
typedefs above are in. Branded `Kg` and `Lb` types are deferred too: once real
types exist they turn the unit mix-up into a compile error.

### Absent is not 0

`undefined` and `0` are different values. Code says which it means and does not
lean on truthiness where both can occur. **Judgement call, no tooth** until
`tsconfig` and strict null checks exist.

## Data integrity and persistence

Detail, target freezing, and the admission boundary:
[`docs/DRAFT_GUARD.md`](./docs/DRAFT_GUARD.md).

### Completed workouts are immutable

Completed workouts in `S.workouts` are an append-only historical log
([ADR 0031](./docs/adr/0031-the-training-log-is-the-only-reading.md)). Finished
sessions are never rewritten, recalculated, or mutated in place. Best records,
e1RM, and progression history are derived by reading the log, not by updating past
records ([ADR 0020](./docs/adr/0020-working-weight-is-read-from-the-log.md)).
When switching units (`kg` <-> `lb`), past workouts retain their logged unit and
are never converted in place (ADR 0031 replaced ADR 0028's rule; the log reads
in the Profile's unit). Exception: deleting a workout, and a Restore.

### Active workout targets are frozen at inception

When a workout begins, `act(S, { type: 'begin', routineId, bw })` freezes a
deep copy of each Routine exercise into `active.entries[].target`
([ADR 0032](./docs/adr/0032-the-active-workout.md)). Subsequent edits or
deletions of a Routine or custom exercise in the plan sheet cannot alter an
in-progress workout or produce stranded writes. Exception: none.

### State ingestion goes through `admit`

Every Profile entering the application — at boot, via multi-tab storage sync,
or JSON backup restore — must pass through `admit` in
`frontend/src/lib/profile/admit.js`
([ADR 0027](./docs/adr/0027-admit-is-the-single-way-a-profile-comes-in.md)).
`admit`:
- Fills missing fields from `DEF` across all depths.
- Runs ordered schema upgrade migrations (`UPGRADES`).
- Refuses newer schema versions by throwing `NewerProfileError`.
- Sorts workouts into canonical training-log order.
- Sanitizes the stored `unit` to `kg` or `lb` at the boundary, so no reader sees an invalid unit.
- Throws on a non-record payload instead of returning it as a Profile.

Never inject raw objects directly into the store or storage. Exception: a CSV
import does not admit a Profile — `mergeImport` adds parsed Workouts to the
Profile the store already admitted and orders them with `sortWorkouts`
(issue #139, ADR 0027 amendment 2026-11-25). No raw Profile crosses the
boundary there, so there is nothing to default, upgrade or refuse.

**Runs:** `admit-defaults.test.js`, `upgrades.test.js`, `workouts.test.js`,
`restore-keys.test.js` and `profile-keys.test.js` under
`frontend/src/lib/profile/`. `profile-keys.test.js` walks `Object.keys(DEF)` and
fails a Profile field that is in none of `PROFILE_CLEAN`, a structural list, or
a pass-through list with a reason, so a new field forces a decision about
cleaning. Of the 26 `DEF` keys, `PROFILE_CLEAN` cleans 9, 10 are structural
(`normalizeState` resets them to their type) and 7 pass through. A hostile
payload comes in through `normalizeState` as a clean Profile.

### Dual-write persistence

Every state persist writes synchronously to `localStorage` (`gym_state_v1`) and
mirrors to IndexedDB (`sky-state` database) via `platform/storage.js` on an
800ms debounce ([ADR 0004](./docs/adr/0004-dual-write-storage.md)). The mobile
Capacitor build additionally mirrors state to a native JSON file
(`platform/mobile.js`).
All debounced writes are immediately flushed on `visibilitychange -> hidden`.
Exception: none.

### Default decides

A control that offers a "Default" choice stores any other pick, even one equal to
the current default. Only "Default" stores nothing, so the exercise keeps
following Settings. A control with no Default choice (the bodyweight switch)
stores only a difference from what it follows (the catalogue's bodyweight flag).
Exception: that second kind is the only control that may drop a pick equal to
what it follows.

**Why:** `6972de7`: the config sheet dropped a picked rest equal to the Profile's,
so the exercise later followed Settings when the lifter changed it. `fb53d9b`: a
save that merged into the old entry let cleared settings survive.
**Runs:** one round-trip test per saving control: pick, save, change the Setting,
assert the entry. `frontend/src/sheets/exercise-config.test.jsx` covers the config
sheet: Rest and the progression Rule (Default stores nothing; a pick equal to
what it follows is kept), Step in the weight unit and in seconds (a value
stepped back to the default is kept), the bodyweight switch (only a difference
from the catalogue is stored), and the controls that follow no Setting.
`frontend/src/views/RoutineEdit.test.jsx` covers the routine editor's
Progression, Icon and superset link.
[`docs/architecture.md`](./docs/architecture.md) states the same rule.

## Front-end state and store discipline

Sky uses two dedicated stores:
1. **Persistent state (`frontend/src/store/useStore.js`)**: Single source of
   truth for persistent profile `S`. Every mutation must go through `update(mut)`
   (or `act(command)` for active workouts, `actRoutine(command)` for routine
   edits), which runs an Immer draft (`produce`), stamps `_ts`, and persists the
   result ([ADR 0026](./docs/adr/0026-update-copies-only-what-changed.md)).
   Only `lib/` and `store/` assign `.active` or `.routines`; a view or sheet
   calls a named store entry point instead. **Runs:** ESLint
   `no-restricted-syntax` fails such an assignment anywhere in `src/` outside
   `lib/`, `store/` and tests, including computed access; fixture in
   `frontend/scripts/eslint-store-selectors.test.mjs`. **Why:**
   `frontend/src/components/ErrorBoundary.jsx:20` discards a crashed workout
   through `act`, not a direct write.
   Substantive change lives in a `lib/` function; a view or sheet may set only
   a single setting inline (e.g. `s.restSec = v`). **Judgement call, no tooth:**
   where the change is written (listed below).
2. **Ephemeral UI state (`frontend/src/store/useUI.js`)**: Ephemeral sheets stack,
   toast queue, and countdown timers. `useUI` never imports `useStore`.

**Judgement call, no tooth:** the split of what lives in which store. The
subscription rules for both are under "The state caps".

### Render stays pure: the React Compiler rules

Write components the React Compiler can compile: read no ref and call no impure
function (`Date.now()`, `Math.random()`) in render, define no component inside a
component, set no state during render or synchronously in an effect, and derive
no state from props in an effect. Keep a dynamic `import()` out of a component
or hook (`App.jsx` and `components/BodyMap.jsx` hold theirs in a module-level
function): the compiler refuses a function that holds one. `react-hooks/todo`
stays off for that reason.

**Why:** NumberField in `components/ui.jsx` wrote a ref in render, and a render
React discarded dropped the lifter's half-typed draft (#135, fixed).
`sheets/session.jsx` read a ref in render (fixed). `components/TabBar.jsx` (line 33) and `sheets/history.jsx` (line 286) use a
component defined in render, so it remounts every render and loses state.
`views/Home.jsx` (line 37) bakes `Date.now()` into a memo keyed on `[S]`.
**Runs:** ESLint, `eslint-plugin-react-hooks` 7.1.1, at error with no hits:
`react-hooks/set-state-in-effect`, `react-hooks/no-deriving-state-in-effects`,
`react-hooks/set-state-in-render`, `react-hooks/immutability`,
`react-hooks/preserve-manual-memoization`, `react-hooks/globals`. At error with
`frontend/eslint-suppressions.json`: `static-components` (<!-- ratchet: eslint-suppressions.json#react-hooks/static-components -->9 hits in 2 files<!-- /ratchet -->) and
`purity` (<!-- ratchet: eslint-suppressions.json#react-hooks/purity -->6 hits in 5 files<!-- /ratchet -->); `refs` and `memo-dependencies` have no hits left (#122).
**Runs:** `babel-plugin-react-compiler` through `@rolldown/plugin-babel` and
`reactCompilerPreset` in `frontend/vite.config.js`, so `vite build` and Vitest
both compile components (`src/lib/` and test files are excluded). It does not
wait for the state ratchets below; the two are independent. `@babel/core` stays
on 7.x: 8.1.3 silently drops memoization for every function with destructured
default props (18 functions, most of them in `components/ui.jsx`), while
7.29.13 compiles them. `scripts/compiler-coverage.test.mjs` transforms such a
component with the same plugin and fails if the compiler output loses its
`react/compiler-runtime` memoization. oxlint's own
`react/*` copies of these rules stay off. The compiler hoists a property read
out of a closure, so guard one that can run on a null (`g?.front` in
`components/BodyMap.jsx`).

### React Doctor: a score floor that only rises

The `React Doctor` CI step fails when the score falls below the number in
`frontend/react-doctor-floor.json`. The floor may only rise: a change that raises
the score also raises the file. A finding counts only after a reviewer confirms
it is real. A confirmed finding becomes a rule in this file with a named check.
Exception: none.

**Why:** in the probe on `ea9b171` the score was 54, and three of its "errors"
(`App.jsx:55`, `components/Modals.jsx:177`, `sheets/volume.jsx:39`) were false
positives; only the ref in `components/ui.jsx:15` was real.
**Runs:** the `React Doctor` step in `.github/workflows/test.yml` calls
`frontend/scripts/check-react-doctor-floor.mjs` against
`frontend/react-doctor-floor.json` (`{ "score": <!-- ratchet: react-doctor-floor.json#score -->57<!-- /ratchet --> }`), with
`frontend/doctor.config.mjs` excluding `scripts/` and tests, disabling
`.oxlintrc.json` adoption (already covered by `npm run lint`), and ignoring
`react-doctor/no-json-parse-stringify-clone` and
`react-doctor/only-export-components`. The `react-hooks-js/static-components` and
`react-hooks-js/purity` hits are baselined in `frontend/eslint-suppressions.json`
and ratcheted by `npm run lint`; React Doctor cannot see that baseline, so it
ignores them too once the Babel plugin is on. `check-react-doctor-floor.test.mjs` in
`npm test` holds the failing fixture for a score below the floor. Confirming each
finding is a judgement call, no tooth.

### The state caps

1. **`use-state <= 4` per file.** Past four independent toggles, the state belongs
   in a pure function or the store. Exception: the two files already over the bar
   (below), whose counts may only fall.
2. **Set no state in an effect.** Covered by `react-hooks/set-state-in-effect`
   above, not by a count.
3. **Subscribe to a slice, never the whole store.** `useStore(s => s.S.unit)`, and
   `useStore(s => s.update)` for an action. Exception: none. A selector returns no
   fresh `[]` or `{}` (zustand 5 compares by reference, so a new array each call
   loops the render): hoist `const EMPTY = []` or use `useShallow`.

**Why:** `App.jsx`, `views/Settings.jsx`, `components/Modals.jsx` and
`components/RestTimer.jsx` called `useStore()` or `useUI()` bare (fixed in #114),
and `views/Workout.jsx` returned a new `[]` from a selector when no workout was
active, which looped the render (#136, fixed).
**Runs:** `use-state` is checked by `frontend/scripts/check-frontend-state.mjs`,
run from `npm test` (`check-frontend-state.test.mjs`, with a failing fixture),
with shrink-only counts in `frontend/frontend-state-allowlist.json`:

- `frontend/src/sheets/custom-exercise.jsx`: <!-- ratchet: frontend-state-allowlist.json#src/sheets/custom-exercise.jsx -->5<!-- /ratchet -->
- `frontend/src/views/Stats.jsx`: <!-- ratchet: frontend-state-allowlist.json#src/views/Stats.jsx -->10<!-- /ratchet -->

A file at 4 passes. A new file over 4 fails, and so does an allowlist count above
the real count or an entry at or under 4 (drop it).
The two subscription rules are ESLint `no-restricted-syntax` selectors in
`frontend/eslint.config.js`, with a failing fixture per selector in
`frontend/scripts/eslint-store-selectors.test.mjs`, at error with 0 suppressions:
`CallExpression[callee.name=/^use(Store|UI)$/][arguments.length=0]` and
`CallExpression[callee.name=/^use(Store|UI)$/] > ArrowFunctionExpression > :matches(ObjectExpression, ArrayExpression, LogicalExpression[right.type=/^(Array|Object)Expression$/])`.

### Derive state during render; no prop-mirroring

Never copy store state or props into `useState` to sync them with `useEffect`.
If a value can be computed from `S` or props, compute it inline during render
(`useMemo` for expensive aggregations). When a component must reset its state on
an entity change, pass a `key` prop (`key={exercise.id}`) instead of writing
synchronization effects. Exception: an editable draft seeded once from the store
and committed on blur (`sheets/profile.jsx`).

**Runs:** `react-hooks/no-deriving-state-in-effects` and
`react-hooks/set-state-in-render`. The `key` advice is a judgement call, no tooth.

### Effects that start a timer, listener or observer return their cleanup

`exhaustive-deps` is an error with a baseline: an effect names every value it reads, and a dependency
list holds no expression such as `[!!on]` (name it first: `const active = !!on`).
Exception: none.

**Why:** `components/RestTimer.jsx` (line 15) omits `on` on purpose behind
`[!!on]`. A stale value read in a timer was the bug in `2cc8dd5` (mute during a
rest did not silence it) and `f6db88f` (the week streak went stale).
**Runs:** oxlint `react/exhaustive-deps` at error. Its <!-- ratchet: lint-baseline.json#react-hooks/exhaustive-deps -->11 hits in 5 files<!-- /ratchet --> sit in `frontend/lint-baseline.json` and may only fall.

### Lists keep stable keys; interactive elements are real elements

Do not use an array index as the `key` of a row that holds state or can be
reordered or edited; give the row an id. Use a `<button>` or `<a>` for anything
clickable, or add `role`, `tabIndex` and a key handler. Exception: a static
display list (barbell plates, instruction steps) may key by index.

**Why:** Editable set rows in `views/Workout.jsx` (line 179) key on `s.id`, and
editable Routine rows in `views/RoutineEdit.jsx` (line 70) key on `rowId`, so a
row keeps what the lifter typed when the list shifts. Clickable `div` rows ship
without a keyboard path; the a11y hit list is the count.
**Runs:** oxlint `react/no-array-index-key` at error. Its <!-- ratchet: lint-baseline.json#react/no-array-index-key -->15 hits in 9 files<!-- /ratchet --> sit in `frontend/lint-baseline.json` and may only fall.
**Runs:** oxlint `jsx-a11y/click-events-have-key-events`,
`jsx-a11y/no-static-element-interactions`, `jsx-a11y/prefer-tag-over-role` and
`jsx-a11y/no-autofocus` (<!-- ratchet: lint-baseline.json#jsx-a11y/* -->54 hits in 20 files<!-- /ratchet -->), in
`frontend/lint-baseline.json`.

### Sort a copy, never the state

Use `toSorted()` and `toReversed()`, or copy first (`[...a].sort()`). Immer
freezes state, so an in-place `sort` or `reverse` on it throws or corrupts a
selector. Exception: an array built in the same function.

**Why:** `lib/strength-exercises.js` (line 56) and `lib/profile/workouts.js`
(line 24) sort in place.
**Runs:** oxlint `unicorn/no-array-sort` and `unicorn/no-array-reverse` at error.
<!-- ratchet: lint-baseline.json#unicorn/no-array-sort -->22 hits in 13 files<!-- /ratchet --> and
<!-- ratchet: lint-baseline.json#unicorn/no-array-reverse -->5 hits in 4 files<!-- /ratchet --> sit in `frontend/lint-baseline.json` and may
only fall. None were autofixed.

## Entities, actions, and interaction design

### Filters stay in sync with the entity

Filters must stay in sync with the shape of the data they filter. When a new
field is added to an entity that affects what something is (status, category,
bodypart, equipment, shoulder heads), every filter in `lib/catalogue-query.js`,
badge in `sheets/exercise-detail.jsx`, `sheets/exercise-picker.jsx` and
`sheets/exercise-config.jsx`, and aggregate in `lib/stats-selectors.js` must be
updated to take the new field into account. Drift between filters and entity
definitions produces silently wrong results.

**Judgement call, no tooth.** The finite facets (bodypart, equipment) could
get a test that every catalogue value is a filter option, but none exists.

### Action consistency

1. **Labels are verb-first sentence case without articles**: "Add exercise",
   "Start workout", "Discard workout", "Replace". Sentence case is
   [`DESIGN.md`](./DESIGN.md)'s rule.
2. **An action on the entity's own card or sheet drops its noun**: "Rename",
   not "Rename routine"; "Delete", not "Delete exercise".
3. **A toggle names what it will do**: "Mark as done", not "Done / Not done".
4. **On a sheet, the frequent action is first and the destructive one is last.**
   Sky has no right-click menu, so there is no `open` → `edit` → `create` →
   `move` → `copy` → `danger` menu to build.
5. **A confirm is a sheet, not an ellipsis in the label.** "Delete",
   "Discard workout", and "Remove exercise" name the action. The confirm sheet
   is what asks. Do not append "…" to those labels. _Amended 2026-11-25: the
   example was "Delete workout", which broke rule 2 on the Workout's own
   sheet. The Workout, Routine and custom-exercise sheets now say "Delete", and
   clearing the body-weight goal says "Delete goal"._
6. **Destructive is `danger` and confirms.** Undoable actions act at once.
7. **Hide what never applies; disable what cannot run yet.** Omit an action
   that never applies in this state; disable one that is temporarily blocked.
8. **Same action, same words, same icon everywhere.** "Delete" destroys a saved
   thing (a workout, a routine, a custom exercise). "Remove" takes a set or an
   exercise off the workout or the routine in front of the lifter. "Copy" is
   the clipboard.

Judgement calls, no tooth: 1, 2, 3, 4, 7 and 8 (wording and order).
**Runs** for 5 and 6: `frontend/src/i18n-lint.test.js` reads the label of every
text button, menu row, icon button (`aria-label`) and `confirmSheet` confirm
and cancel. It fails a label that ends in "…" or "..." (a placeholder such as
`Search…` is not an action), the cancel label included. Rule 6's **danger half**
keeps #130's label check: a destructive label (Delete, Discard, Reset, Erase,
Wipe, Clear all, Clear everything, or Remove except "Remove set" and "Remove
from favorites") that is not `<Button variant="danger">`, a `danger` class,
`Row`'s `danger` prop, or `danger: true` on `confirmSheet` fails; a cancel label
is not checked for this. Its **confirm half** is layered on top and is signalled
by `variant="danger"` or a trash icon (`icon="trash"` or a nested
`<Icon name="trash" />`), not by the label verb: such an action fails when the
click changes anything before a `danger: true` confirm, even if its label is
harmless. Both signals can fail the same button. A click passes when it is that
confirm, a same-file function that ends in one (an early return or `close()` may
come first), a sheet chooser whose own clicks confirm, a prop callback every
passer of which confirms (in the same file, or where another file imports the
component and passes the prop), or `undo()` alone. A
conditional that can reach another path fails, and so does a name declared
twice. Actions the check cannot prove are in a fixed exemption list keyed by
file and source text, each with a reason naming the file that confirms; an
entry that no longer matches an action fails too. ErrorBoundary's discard is
the one inline exception: its local two-step confirm (first tap relabels,
second discards) runs because the shared sheet host may be part of the crashed
tree. The red text keys Delete (on the Routine screen) and Discard workout (see `DESIGN.md`)
work this way. "Remove set" takes a set off the running workout and acts at
once; "Remove from favorites" is the favorites toggle; a bare "Clear" empties
a field.
Hits at the start: 0 for rule 5, 0 for rule 6.

## Sheets and dialogs

Sky uses a touch-first interface. Desktop right-click menus are not used.

1. **Direct imports**: Domain sheets in `frontend/src/sheets/` are imported
   directly by the views that trigger them. There is no central late-binding hub
   or registry.
2. **Accessible dialogs**: Every sheet or modal must contain an `h2` or `h3`
   heading or pass an explicit `label` to `openSheet` to guarantee an
   `aria-labelledby` reference. Focus trapping and restoration of previous focus
   are mandatory (`components/Modals.jsx`).
3. **Mobile interaction**: Sheets must support drag-to-dismiss gestures, backdrop
   dismissal, and Escape key handling.

**Runs:** `frontend/src/sheets/dialog-names.test.jsx` (rule 2, the name only).
Rules 1 and 3 and the focus trap are judgement calls, no tooth.

## Visual and design tokens

The rules live in [`DESIGN.md`](./DESIGN.md). This file does not restate them.
Restating them here is how the two documents drift.

**Runs:** `frontend/src/design-tokens.test.js` (contrast, accents) and
`frontend/src/design-lint.test.js` (at most 12 `--fs-*` tokens, every
`font-size` outside `tokens.css` is `var(--fs-*)`, inline colour only on that
test's allowlist). A new colour or size that the test rejects is a change to
`DESIGN.md` and the test together.

## Display formatting and text

### One owner per derived value

Each derived value is read from the function that owns it and never recomputed
inline. A second copy drifts. Exception: none; a copy is deleted, not allowlisted.

| Value | Owner |
|---|---|
| Day key, month key, today, Monday-first week, the length of a day | `lib/dates.js` (`todayISO`, `isoOf`, `monthKey`, `mondayOf`, `DAY_MS`) |
| kg and lb conversion, one-decimal rounding, the unit cascade | `lib/units.js` (`normalizeWeight`, `round1`, `resolveSetWeight`) |
| Best, Records, Tonnage, last session, Estimated 1RM series | `lib/training-log.js` |
| Estimated 1RM formula and `REP_CAP` | `lib/onerm.js` |
| A Workout's timestamp | `workoutTimestamp` in `lib/dates.js` |
| Durations and clock text | `lib/format.js` |

**Why:** the strongest bug class in the history: `fbff6fd` (Step done),
`b85ff0a` (set counts), `a1703bd` (body weight), `6cd4bf9` (raw catalogue),
`24f1969` and `c4e36a8` (kind to icon), `2ce7f79` (unit), `9c89dd8` (streak). The
review on 2026-11-25 found `latestWorkSetAt` re-implementing `workoutTimestamp`,
four copies of `round1` and the length of a day spelled seven ways; all three
now import the owner. Still live: `lib/recovery.js` re-writes Epley with a
different rep cap.
**Runs:** ESLint `no-restricted-syntax` selectors in `frontend/eslint.config.js`,
each failing outside its owner with a message naming the owner:
`Identifier[name='LB_TO_KG']` and the literals `2.2046` and `0.4535` (0 hits; the
copies in `lib/import-csv.js` and `lib/bodyweight.js` are fixed);
`LogicalExpression[right.value='kg']` (<!-- ratchet: eslint-selector-suppressions.json#No `|| 'kg'` fallback: S.unit is cleaned by PROFILE_CLEAN; other units go through lib/units.js (sanitizeUnit, entryUnit). -->14 hits in 6 files<!-- /ratchet -->, exempt in `lib/units.js`); the inline
`Math.round(x * 10) / 10`, selector
`BinaryExpression[operator='/'][right.value=10][left.callee.object.name='Math'][left.callee.property.name='round'][left.arguments.0.operator='*'][left.arguments.0.right.value=10]`
(<!-- ratchet: eslint-selector-suppressions.json#Round to one decimal with round1 from lib/units.js, not Math.round(x * 10) / 10. -->15 hits in 10 files<!-- /ratchet --> outside `lib/units.js`);
`(getDay() + 6) % 7`, selector
`BinaryExpression[operator='%'][right.value=7][left.type='BinaryExpression'][left.operator='+'][left.right.value=6][left.left.callee.property.name='getDay']`
(<!-- ratchet: eslint-selector-suppressions.json#Get the Monday-first weekday from lib/dates.js (mondayIndexOf), not (getDay() + 6) % 7. -->3 hits in 3 files<!-- /ratchet --> outside `lib/dates.js`: `components/Heatmap.jsx`, `sheets/history.jsx`
and `views/Home.jsx`). The `% 7` selector does not hit `padded.length % 7`
(`sheets/history.jsx`). Every hit is baselined in
`frontend/eslint-suppressions.json`; `frontend/scripts/owner-selectors.test.mjs`
pins each selector and its owner. The `|| 'kg'` count falls as callers read the
cleaned `S.unit`. Epley and the timestamp copies are judgement calls, no tooth;
a duplicate-code tool would be noise.

### Local dates, never UTC

Build a day key with `todayISO()` or `isoOf()`, and parse a day-only string with
one helper in `lib/dates.js`. Never write `toISOString().slice(0, 10)` and never
`new Date('YYYY-MM-DD')`. Exception: `lib/plans/scenarios.js`, the dev scenario
generator, which is UTC end to end on purpose.

**Why:** `toISOString()` is UTC, so a lifter west of Greenwich logging in the
evening gets tomorrow's key. `lib/progression.js` (line 762) does exactly that.
A day-only string parses as UTC midnight, so an unstamped Workout sorts hours
off a stamped one: `lib/dates.js` (line 89), `lib/training-log.js` (line 182),
`lib/import-csv.js` (lines 400 and 412).
**Runs:** ESLint `no-restricted-syntax` in `frontend/eslint.config.js` on
`CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString']`
and on
`NewExpression[callee.name='Date'][arguments.length=1] > :matches(MemberExpression[property.name='d'], Identifier[name='d'])`.
Both messages name `todayISO`, `isoOf` and `parseDay`. A `files` override exempts
`lib/plans/scenarios.js` alone. A hand-padded day or month key fails too:
`CallExpression[callee.property.name='padStart'][arguments.0.value=2][arguments.1.value='0']`
in `src/`, exempt in `lib/dates.js`, `lib/format.js` (clock text) and tests, 0
suppressions. `frontend/scripts/local-dates-lint.test.mjs` pins the selectors and
the exemptions.

### The clock is an argument in `lib/`

`lib/` takes `now` as an argument and never reads the clock. No `Date.now()`,
no `new Date()`, and no `now = Date.now()` default. Outside `lib/` the clock is
read at the edge: `store/`, `platform/` and event handlers. Exception: `uid()`
in `lib/format.js` and `todayISO()` in `lib/dates.js`. This is the only place
the rule is stated; the other sections point here.

**Why:** a default hides the clock from every caller that omits it, and tests run
on wall time without saying so. `streakOf(S, today = Date.now())` even names a
millisecond value `today`. Seven reads sat outside the two owners: four were
defaults (`lib/active-finish.js`, `lib/history.js`, `lib/streak.js`,
`lib/profile/normalize.js`), one a bare `Date.now()` inside a filter
(`lib/effort.js`). Those five are fixed: the caller passes `now`. Two remain in
`lib/active-finish.js` and `lib/active-session.js`, baselined.
**Runs:** oxlint `eslint/no-restricted-properties` (`Date.now`), in an
`overrides` block for `src/lib/**` with the two owner files and tests excluded,
and ESLint `no-restricted-syntax`
(`NewExpression[callee.name='Date'][arguments.length=0]`) scoped the same way.
The two remaining `Date.now()` reads are in `frontend/lint-baseline.json`
(oxlint, one each); `frontend/eslint-suppressions.json` holds none, because no
`new Date()` read sits outside the owners.

### Single-owner formatting

Formatting logic must never be duplicated across components:
- **Durations, timestamps, and numbers**: the owner table above names the owners
  (`lib/format.js`, `lib/dates.js`). Hand-rolled division (`seconds % 60`) or
  `padStart(2)` formatting is prohibited.
- **Set badges**: Format via `frontend/src/lib/set-label.js`.
- **Units and plate grids**: Format via `frontend/src/lib/units.js` and
  `frontend/src/lib/plates.js`.
- **Toasts**: Dispatched exclusively through `useUI().toast()` and rendered by
  `components/Toast.jsx`.

Exception: the owner files themselves.
**Runs:** ESLint `no-restricted-syntax` on `BinaryExpression[operator='%'][right.value=60]`,
failing outside `lib/format.js` and `lib/dates.js`, 0 suppressions. The rest is a
judgement call, no tooth.

### Localization readiness

All user-facing strings must be wrapped in `t('literal')` from
`frontend/src/lib/i18n.js` ([ADR 0003](./docs/adr/0003-english-only.md)).
Although Sky currently ships in English only, `t()` enables parameter
interpolation (`{0}`) and keeps the application translation-ready without
re-architecting string calls. Exception: a dev-only error message that no
lifter sees.

**Runs:** `frontend/src/i18n-lint.test.js` walks the JSX strings of views,
sheets and components, and their attribute text (`aria-label`, `title`,
`placeholder`, `alt`): a literal word there fails.

## Interface design

### Deep modules

Every `lib/` module is a **deep module**: a small **interface** over a hidden implementation. Tests cross the **seam** and nothing else. A test-only export is a **seam leak**. A module that only re-exports is a **middle man**. Exception: none.

**Why:** `lib/active-workout.js` was a middle man before ADR 0023: five re-exports, 17 store wrappers, and about 95 render tests checking domain rules through React. It is now one deep module, `act` and `sessionView`.

**Judgement call, no tooth.**

### Pure training logic boundary

Pure training logic lives exclusively in `frontend/src/lib/` (progression, 1RM,
recovery, catalogue search, volume). `lib/` must never import from `store/`,
`views/`, `sheets/`, `components/`, or `platform/`. It has zero knowledge of the
DOM or browser APIs. Exception: none.
**Runs:** `frontend/src/lib/purity.test.js`.

### Global APIs have one owner

Each global has an owner. A new call site outside the owner is a bug. The
owners below are the legal ones, including the call sites that exist today.

| API | Owner |
|---|---|
| `localStorage`, `indexedDB` | `frontend/src/platform/storage.js` |
| `AudioContext`, `webkitAudioContext`, `navigator.vibrate` | `frontend/src/platform/sound.js` |
| `wakeLock` | `frontend/src/platform/wakelock.js` |
| `Notification`, `navigator.serviceWorker` | `platform/`. Today `store/useUI.js` calls both (`Notification`, and `navigator.serviceWorker.getRegistration`) and `main.jsx` registers the worker. They are the allowlist until that code moves into `platform/`. `platform/media-warm.js` already reads `navigator.serviceWorker`. |
| `Date.now()`, `new Date()` | See "The clock is an argument in `lib/`". `useStore.js` stamps `_ts`. |
| `Math.random()` | `uid()` in `lib/format.js` |
| `console` | `components/ErrorBoundary.jsx`, `components/Modals.jsx` |
| `fetch` | `platform/media-warm.js`, for static media. There is no API client. |

**Runs:** `purity.test.js` bans `localStorage`, `document`, `window`, and the
other browser globals inside `lib/` only.
**Runs:** oxlint `eslint/no-restricted-globals` and
`eslint/no-restricted-properties` (`checkGlobalObject`, so `window.AudioContext`
and `window.webkitAudioContext` count) for every row but the clock, failing outside the owner file. Allowlisted
with a reason until that code moves into `platform/`: `store/useUI.js` and
`main.jsx` (`Notification` and `navigator.serviceWorker`). Tests that clear
`localStorage` are an overrides entry for `**/*.test.js` and `**/*.test.jsx`;
`ignorePatterns` still skips tests. Non-owner hits in `scripts/` and
`vite.config.js` sit in `frontend/lint-baseline.json` and may only fall:
<!-- ratchet: lint-baseline.json#eslint/no-restricted-globals -->54 hits in 13 files<!-- /ratchet --> for `eslint/no-restricted-globals` and
<!-- ratchet: lint-baseline.json#eslint/no-restricted-properties -->6 hits in 4 files<!-- /ratchet --> for `eslint/no-restricted-properties`
(`console`, `localStorage` in the review scripts, and
`navigator.serviceWorker` in `scripts/review/offline.mjs` and
`scripts/review/audit.mjs`). No non-owner `fetch` hit remains inside `frontend/`.

### Modern ESM: no CommonJS globals

Sky is pure ECMAScript (`"type": "module"`). Use `import.meta.url`,
`import.meta.dirname`, or `import.meta.filename`. Never use CommonJS globals
(`__dirname`, `__filename`, `require`) or create shims named after them.
Exception: none.

**Runs:** oxlint `eslint/no-restricted-globals` bans `__dirname`, `__filename`
and `require`; oxlint skips tests, so ESLint `no-restricted-globals` bans them in
test files. ESLint `no-restricted-syntax` on
`VariableDeclarator[id.name=/^(__dirname|__filename|require)$/]` bans shims. No
baseline entries.

### Session performance: nothing starves the lifter

Work running during an active workout must never drop frames, freeze gestures,
or delay rest timers and audio cues:
- Heavy calculations (30-day EWMA fatigue scans, large CSV imports, PDF plan
  rendering) must not run synchronously on the main thread during an active workout.
- Storage writes must remain debounced (800ms) to prevent IndexedDB disk stalls.
- `warmArt` fetches. `App.jsx` is what schedules it, on `requestIdleCallback`
  (timeout 5s, or a 3s `setTimeout` when the API is missing). Do not call
  `warmArt` from a render or from a logged-set handler.

The first bullet is a judgement call, no tooth.
**Runs:** `platform/storage.test.js` holds the 800ms debounce (`DRAIN_MS`).
`App.warm-art.test.jsx` holds the `warmArt` call in `App.jsx` inside
`requestIdleCallback`.

### Design for testability

1. **Accept dependencies, don't create them** — pass external dependencies in rather than constructing them internally.
2. **Return results, don't produce side effects** — a function that returns a value is easier to test than one that mutates state.
3. **Small surface area** — fewer methods = fewer tests needed, fewer params = simpler test setup.

**Judgement call, no tooth.**

## Comments

Only public interface entry points receive concise JSDoc explaining the
contract. Implementation mechanics should be readable without comments.
Architectural rationale and design decisions live in `docs/adr/`. A comment names
no ticket or issue number: the number rots, and the reason belongs in the
comment or the ADR. A change that departs from an ADR adds a dated amendment to
that ADR in the same change (judgement call, no tooth). Exception: none.

**Why:** `1dd9352` and `add69cd` removed ticket ids from the source; the
last two, in `lib/import-csv.js` and `lib/catalogue-corrections.js`, were
reworded when the guard landed.
**Runs:** `frontend/src/comments.test.js`, a regex over the parsed comments of
non-test source, with a fixture it must reject (`#97`). No allowlist. Commit
hashes stay allowed. The rest of this rule is a judgement call, no tooth.

## Testing

Tests verify behaviour through the public interface. Code can change entirely;
a test should not break unless the behaviour changed. Mock at system boundaries
only (`localStorage`, audio, the clock, the wake lock, Capacitor). Never mock
our own modules. Exception: a module in `platform/`, which is the boundary. A
test must be able to fail for a bug a lifter or a caller would see. If you can't
name the bug, don't write the test (a judgement call, no tooth).

**Runs:** ESLint `no-restricted-syntax` selectors on test files (own-module mocks,
snapshots, `lib/active-*` imports, class and id queries in UI tests), ratcheted by `check-eslint-selectors.mjs` in
`npm run lint`. Each selector, its hit count and its failing fixture are kept in one
place, "Teeth" in [`docs/TESTING_STANDARDS.md`](./docs/TESTING_STANDARDS.md).

Worked examples, the seam table, and the red flags:
[`docs/TESTING_STANDARDS.md`](./docs/TESTING_STANDARDS.md).

## Judgement calls with no tooth

These rules stay in review. Each is named in its section above, and this list
names every one:

- optional parameters (Function signatures);
- the JSDoc-first order of the migration (Name the entities in JSDoc first);
- absent versus 0, until `tsconfig` (Absent is not 0);
- a `switch` that names every member, until `tsconfig`;
- a `catch` that hides a refusal in `lib/`, and the wording of an error a lifter
  reads (A catch hides nothing from the lifter);
- which of the two stores holds a piece of state (Front-end state);
- where the change is written: a `lib/` function rather than inline in a view (Front-end state);
- the `key` advice for resetting state (Derive state during render);
- filters stay in sync with the entity;
- action consistency rules 1, 2, 3, 4, 7 and 8 (wording and order of actions);
- sheet rules 1 and 3 and the focus trap;
- the Epley and timestamp copies, and the rest of Single-owner formatting
  (One owner per derived value);
- deep modules, and design for testability;
- the first bullet of Session performance;
- a change that departs from an ADR adds a dated amendment (Comments), and the
  rest of the Comments rule beyond ticket ids;
- "name the bug" for a test (Testing).

## What runs, and what is still to build

| Tool | Runs today | To add |
|---|---|---|
| Vitest guard tests, in `npm test` | `purity.test.js`, `import-cycles.test.js`, `design-tokens.test.js`, `design-lint.test.js`, `env.test.js`, `eslint-store-selectors.test.mjs`, `eslint-test-rules.test.mjs`, `i18n-lint.test.js`, `sheets/dialog-names.test.jsx`, `docs.test.js`, `platform/storage.test.js` (the 800ms debounce), `comments.test.js`, `effect-types.test.js`, the `warmArt` test (`App.warm-art.test.jsx`), the `flush()` test (`store/useStore.flush.test.jsx`), the save round-trip tests (`sheets/exercise-config.test.jsx`, `views/RoutineEdit.test.jsx`), `lib/profile/profile-keys.test.js` | |
| ESLint 10, `npm run lint` after the oxlint ratchet (CI only) | `react-hooks/set-state-in-effect`, `react-hooks/no-deriving-state-in-effects`, `react-hooks/set-state-in-render`, `react-hooks/immutability`, `react-hooks/preserve-manual-memoization`, `react-hooks/globals`, all at error, 0 hits. `static-components` (<!-- ratchet: eslint-suppressions.json#react-hooks/static-components -->9 hits in 2 files<!-- /ratchet -->) and `purity` (<!-- ratchet: eslint-suppressions.json#react-hooks/purity -->6 hits in 5 files<!-- /ratchet -->), at error with `frontend/eslint-suppressions.json`. `react-hooks/todo` stays off. `no-restricted-syntax` selectors, one table in `frontend/eslint.config.js`: One-owner (`LB_TO_KG` and the `2.2046` and `0.4535` literals at 0 suppressions, inline `Math.round(x * 10) / 10`, `(getDay() + 6) % 7`, `\|\| 'kg'`), `% 60`, local dates (including hand-padded day keys), store selectors, assignments to `.active` and `.routines` outside `lib/`, `store/` and tests (including computed access), the `lib/` clock, `import.meta.env` and `process.env`, the CommonJS shim, and `vi.mock`/`vi.doMock` scope, snapshots, and `lib/active-*` internal imports in tests. `noInlineConfig`, with `--max-warnings 0`, so no disable comment hides a hit. Ratchets: `frontend/eslint-suppressions.json` for counts, and `frontend/eslint-selector-suppressions.json` for the selector message of each suppressed `no-restricted-syntax` hit — `check-eslint-selectors.mjs` runs in `npm run lint` with its fixture | nothing |
| oxlint, ratchet in the pre-commit hook and in `npm run lint` (CI) | `correctness` category (with the dated `no-unused-vars` carve-out: 0 hits, no baseline entry; the old "baseline the 24 probe hits" line is superseded — see the amendment above), `react/rules-of-hooks`, `react/exhaustive-deps`, `complexity`, restricted globals and properties (including `Date.now` in `lib/`), `unicorn/no-array-sort`, `unicorn/no-array-reverse`, `react/no-array-index-key`, `jsx-a11y/click-events-have-key-events`, `jsx-a11y/no-static-element-interactions`, `jsx-a11y/prefer-tag-over-role`, `jsx-a11y/no-autofocus`, all at error. `frontend/.oxlintrc.tests.json` adds the `jest` rules `expect-expect`, `no-conditional-expect`, `no-focused-tests`, `no-disabled-tests` and `no-identical-title` on test files, 0 hits. Ratchet: `frontend/lint-baseline.json`, checked by `scripts/check-lint-baseline.mjs` with its failing fixture in `npm test` | nothing |
| tsc | `frontend/tsconfig.json` (`strict`, `allowJs`, `checkJs` over app code), `npm run typecheck` in the hook and CI. Ratchet: `frontend/tsc-baseline.json`, checked by `frontend/scripts/check-tsc-baseline.mjs` with its failing fixture in `npm test`. `check-ts-comments.mjs` (fixture: `check-ts-comments.test.mjs`) fails `@ts-ignore` and `@ts-nocheck` in `.js`/`.jsx` files | tests joining `tsconfig.json` (last) |
| oxlint type-aware (`oxlint-tsgolint` 7.0.2008, `--type-aware` in the same ratchet) | `typescript/no-floating-promises` (<!-- ratchet: lint-baseline.json#typescript/no-floating-promises -->14 hits in 10 files<!-- /ratchet -->) and `no-misused-promises` (<!-- ratchet: lint-baseline.json#typescript/no-misused-promises -->12 hits in 11 files<!-- /ratchet -->) at error with `frontend/lint-baseline.json`; `only-throw-error`, `switch-exhaustiveness-check`, `no-explicit-any`, `no-non-null-assertion`, `ban-ts-comment` at error, 0 hits. Failing fixture: `check-lint-baseline.test.mjs` with a floating promise | `no-unsafe-*`, `no-unnecessary-condition` and branded `Kg` / `Lb` types (deferred until typedefs exist) |
| `frontend/scripts/check-frontend-state.mjs`, in `npm test` | The `use-state` cap, with its failing fixture. Ratchet: `frontend/frontend-state-allowlist.json` | nothing |
| Babel and CI | `babel-plugin-react-compiler` (done, #122), `@babel/core` pinned to 7.x with `scripts/compiler-coverage.test.mjs` guarding against silent compiler skips, `npm run test:fatigue-probe`, `npm run build`, and the `React Doctor` floor (`frontend/react-doctor-floor.json`, checked by `frontend/scripts/check-react-doctor-floor.mjs` with its failing fixture in `npm test`) | |
| Doc count claims | `CODING_STANDARDS.md` and `docs/TESTING_STANDARDS.md`: `<!-- ratchet: source#key -->` claims checked against the named ratchet JSON by `frontend/scripts/check-doc-counts.mjs` in `npm test`, refreshed by `npm run doc-counts:baseline`, with failing fixture `check-doc-counts.test.mjs` | nothing |

`npm run test:fatigue-probe` stays out of `npm test` on purpose: the workflow
says it is too slow for the unit suite.

**Build order**, cheapest and highest value first:

1. The six zero-hit `react-hooks` compiler rules are on at error, and
   `static-components` and `purity` are on at
   error with `frontend/eslint-suppressions.json`. Fix the small real hits
   first: 4 bare store reads, 1 selector `[]`, 1 UTC day key, the `LB_TO_KG` copies.
2. The ESLint `no-restricted-syntax` selector table with its allowlists runs.
3. oxlint, `frontend/lint-baseline.json` and its failing fixture already run
   `complexity`, restricted globals and properties, `exhaustive-deps`,
   `unicorn/no-array-sort`, `unicorn/no-array-reverse`, `react/no-array-index-key`
   and the `jsx-a11y` rules named under "Lists keep stable keys". What this step
   adds, the `Date.now` override for `lib/`, is on too. ESLint has left the
   pre-commit hook: the hook runs the oxlint ratchet, and ESLint (about 19 s
   with the compiler rules) runs in CI. The `use-state` cap stays in its own row.
4. `tsconfig.json`, `npm run typecheck` and `frontend/tsc-baseline.json` run in
   the hook and CI; the JSDoc `@typedef`s are in and oxlint's type-aware rows are on.
5. The guard tests still to add.
6. Rename `lib/` to `.ts`, then the rest, then tests.
7. `babel-plugin-react-compiler` (done, #122).
8. React Doctor is on as its own CI step named `React Doctor`, with
   `frontend/react-doctor-floor.json` (see its rule above).
