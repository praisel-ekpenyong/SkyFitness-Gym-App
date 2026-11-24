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
  ESLint's old options), `react/rules-of-hooks`, `react/exhaustive-deps`,
  `eslint/no-throw-literal` and `eslint/prefer-promise-reject-errors`, all at
  error, tests excluded. Its own `react/*` copies of the compiler rules are off.
- **ESLint 10** runs after the oxlint ratchet in `npm run lint`, and only in CI:
  `frontend/eslint.config.js`. The pre-commit hook does not call ESLint. It
  keeps only what oxlint cannot do: the official `eslint-plugin-react-hooks`
  compiler rules, and `no-restricted-syntax` selectors (oxlint has no AST
  selectors). Ten compiler rules are on at error (see "Render stays pure"): six
  with 0 hits, and `static-components`, `purity`, `refs`, and
  `memo-dependencies` baselined in `frontend/eslint-suppressions.json`.
  `react-hooks/todo` stays off. The `no-restricted-syntax` selectors are not on
  yet. A rule runs in one tool, never two.
- **tsc** (strict, `allowJs`, `checkJs`) joins when `frontend/tsconfig.json`
  exists. Then oxlint adds its type-aware rows through `oxlint-tsgolint`.
- **Vitest guard tests** (`npm test`) and `frontend/scripts/check-*.mjs`
  scripts cover what no linter can express.

Where today's code is over the bar, the check is a ratchet, and each tool has
one format. Every ratchet fails on a new hit, and fails on a stale entry (a
recorded count above the real count), so a fix has to lower the file too.

| Tool | Ratchet file | Rewritten by |
|---|---|---|
| ESLint | `frontend/eslint-suppressions.json` (ESLint's own, count per file per rule) | `eslint --suppress-rule <id>`, `eslint --prune-suppressions` |
| oxlint | `frontend/lint-baseline.json` (count per file per rule, rule as oxlint reports it, e.g. `react-hooks/exhaustive-deps`) | `npm run lint:baseline` (`frontend/scripts/check-lint-baseline.mjs --write`), which lowers counts and never raises one |
| Custom checks | `*-allowlist.json`, `{ "path": { "count": N, "reason": "..." } }` | by hand, with a reason |
| tsc | `frontend/tsc-baseline.json` (error count per file) | `npm run typecheck:baseline` |

Every check script has a fixture that must fail, so the check cannot rot into
always-green. A file that is not in a baseline must be clean. A disable comment
for a ratcheted rule is illegal. The decisions are in
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

**Runs:** `frontend/src/lib/env.test.js` pins the defaults.
**To add:** ESLint `no-restricted-syntax` selectors on
`MemberExpression[object.type='MetaProperty'][property.name='env']` and on
`process.env`, failing outside `lib/env.js`, `vite.config.js`, scripts and
tests. The two build flags above are the allowlist, each with its reason in the
config. No ratchet: the code is clean once those two are listed.

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

**Judgement call, no tooth** while the code is JavaScript. The stand-in for the
effect and command sets is the closed-set guard test above.
**To add:** oxlint `typescript/switch-exhaustiveness-check` (type-aware, after
`tsconfig`).

### Functions stay simple

No function has a cyclomatic complexity over 15 (`complexity`, `modified`
variant, so a whole `switch` counts once). Over the limit, split it: extract named
pure helpers or move decision trees into domain reducers. Exception: a function
already over 15 sits in `frontend/lint-baseline.json`, may not grow, and leaves
the file when it is split. A disable comment is never the way out.

**Why:** 54 functions in 29 files are over the bar today. The worst is
`evaluateSetMilestone` in `lib/progression.js` (83, line 521), then
`evaluateSessionProgression` (74), `parseWorkoutCSV` in `lib/import-csv.js`
(66) and `Home.jsx` (62). A function that size has branches no test reaches.
**Runs:** oxlint `eslint/complexity` at error (`max: 15`, `variant: 'modified'`),
tests excluded. Its 55 hits in 30 files (measured 2026-11-24) sit in
`frontend/lint-baseline.json` and may only fall. `scripts/review/audit.mjs` is
the one past the issue's 54 functions in 29 files.

## Errors

### Throw Errors, not values

Outside command results, throw an `Error` or a subclass of `Error`. A thrown
string or plain object has no stack trace and fails downstream `instanceof Error`
checks. Exception: inside command handlers (`act`), a domain refusal is
`{ ok: false }`, not a throw. An empty `catch {}` is allowed where the failure is
harmless and best effort (`.oxlintrc.json` sets `allowEmptyCatch` for that).
Never use one where the swallowed failure would lose or hide lifter data.

**Why:** the rule already holds (0 thrown literals today), so the tooth is free.
**Runs:** oxlint `eslint/no-throw-literal` and `eslint/prefer-promise-reject-errors`
at error, no baseline entry.
**To add:** after `tsconfig`, `typescript/only-throw-error` replaces them.

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

**Why:** `nativeSave` in `platform/mobile.js` swallows its errors and is called
floating, so `isMirrorFailing()` never sees a mobile write fail.
**To add:** oxlint `typescript/no-floating-promises` (17 hits in 11 files) and
`typescript/no-misused-promises` (2 hits in 2 files), type-aware, after
`tsconfig` (measured 2026-11-24 with oxlint 1.95.0, `oxlint-tsgolint` and a
throwaway tsconfig, app code only). Older hits go in
`frontend/lint-baseline.json`.

## Function signatures

Optional parameters passed to functions should be scrutinized extremely
carefully. They are a frequent source of bugs by omission. Prioritize correctness
and explicit configuration over backward compatibility. A reviewer asks: does a
caller omit this today, and what does the function assume when it does?

**Judgement call, no tooth.** The clock default is the one case with a tooth: see
"The clock is an argument in `lib/`".

## Types and TypeScript migration

The target is strict TypeScript, reached by checking the JavaScript first. The
tree is JavaScript today: `frontend/` has no `.ts` file and no `tsconfig`.

### The checker comes first

Add `frontend/tsconfig.json` with `strict: true`, `allowJs` and `checkJs` over
all app code, and run `npm run typecheck` in the pre-commit hook and in CI
(about 1.6 s). A probe measured 6247 errors at `strict`: 2950 in app code (`lib/`
1652, `sheets/` 452, `views/` 388, `components/` 291, `platform/` 77, `store/` 65,
the `src` root 25) and 3297 in tests. About three quarters are implicit `any`.
The errors are a ratchet, not a blocker: `frontend/tsc-baseline.json` holds the
error count per file, may only shrink, and fails on a stale entry. One command,
`npm run typecheck:baseline`, rewrites it. A file that is not in the baseline is
new and must be clean. Exception: none.

**Why:** a type that nothing checks is an unenforced rule.
**To add:** `frontend/tsconfig.json`, `npm run typecheck` in
`.github/workflows/test.yml` and `.githooks/pre-commit`, and
`frontend/tsc-baseline.json`.

### Name the entities in JSDoc first

The first work after the checker is JSDoc `@typedef`s for `Profile`, `Workout`,
`Entry`, `SetRow` and the Routine exercise (`Target`). There is no `@typedef` in
the tree today, and every `@param {Object}` is a future `any`. After that, rename
files to `.ts` starting with `lib/`. Tests join last.

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

**To add:** oxlint `typescript/no-explicit-any`, `typescript/no-non-null-assertion`
and `typescript/ban-ts-comment`, after `tsconfig`. Old hits go
in `frontend/lint-baseline.json`. Branded `Kg` and `Lb` types, once real types
exist, turn the unit mix-up into a compile error.

**Deferred until real types exist, not rules now:** `typescript/no-unsafe-*`
and `typescript/no-unnecessary-condition` (117 hits in the probe on `ea9b171`).
Today they fire hundreds to thousands of times and mean nothing, because
every value is an implicit `any`. Each becomes a rule, with a baseline, once
the typedefs above are in.

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
JSON backup restore, or CSV import — must pass through `admit` in
`frontend/src/lib/profile/admit.js`
([ADR 0027](./docs/adr/0027-admit-is-the-single-way-a-profile-comes-in.md)).
`admit`:
- Fills missing fields from `DEF` across all depths.
- Runs ordered schema upgrade migrations (`UPGRADES`).
- Refuses newer schema versions by throwing `NewerProfileError`.
- Sorts workouts into canonical training-log order.

Never inject raw objects directly into the store or storage. Exception: none.

**Runs:** `admit-defaults.test.js`, `upgrades.test.js`, `workouts.test.js` and
`restore-keys.test.js` under `frontend/src/lib/profile/`.
**To add:** a test that walks `Object.keys(DEF)` and fails a Profile field that
is in none of `PROFILE_CLEAN`, a structural list, or a pass-through list with a
reason, so a new field forces a decision about cleaning
(`frontend/src/lib/profile/profile-keys.test.js`). Today `PROFILE_CLEAN` cleans
two fields and `normalizeState` hand-cleans five more, and readers defend
themselves with 18 `|| 'kg'` fallbacks.

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
assert the entry. `frontend/src/sheets/catalogue.test.jsx` covers the config
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
   (or `act(command)` for active workouts), which runs an Immer draft (`produce`),
   stamps `_ts`, and persists the result ([ADR 0026](./docs/adr/0026-update-copies-only-what-changed.md)).
2. **Ephemeral UI state (`frontend/src/store/useUI.js`)**: Ephemeral sheets stack,
   toast queue, and countdown timers. `useUI` never imports `useStore`.

**Judgement call, no tooth:** the split of what lives in which store. The
subscription rules for both are under "The state caps".

### Render stays pure: the React Compiler rules

Write components the React Compiler can compile: read no ref and call no impure
function (`Date.now()`, `Math.random()`) in render, define no component inside a
component, set no state during render or synchronously in an effect, and derive
no state from props in an effect. Exception: the two files with a dynamic
`import()` (`App.jsx` and `components/BodyMap.jsx`) will need `'use no memo'`,
or a moved import, when the compiler lands; no file carries it today.
`react-hooks/todo` stays off for that reason.

**Why:** NumberField in `components/ui.jsx` wrote a ref in render, and a render
React discarded dropped the lifter's half-typed draft (#135, fixed).
`sheets/session.jsx` (line 149) still reads a ref in render. `components/TabBar.jsx` (line 33) and `sheets/history.jsx` (line 286) use a
component defined in render, so it remounts every render and loses state.
`views/Home.jsx` (line 37) bakes `Date.now()` into a memo keyed on `[S]`.
**Runs:** ESLint, `eslint-plugin-react-hooks` 7.1.1, at error with no hits:
`react-hooks/set-state-in-effect`, `react-hooks/no-deriving-state-in-effects`,
`react-hooks/set-state-in-render`, `react-hooks/immutability`,
`react-hooks/preserve-manual-memoization`, `react-hooks/globals`. At error with
`frontend/eslint-suppressions.json`: `static-components` (9 hits, 2 files),
`purity` (5), `refs` (2, 1 file), `memo-dependencies` (1); all counts
re-measured 2026-11-24, `refs` after #135 with `eslint-plugin-react-hooks` 7.1.1.
**To add:** `babel-plugin-react-compiler` on the Vite React plugin: 91 of 98 functions compiled
before #135, and the 7 refusals were the four `refs` hits (two now fixed), the two dynamic imports and
the one `memo-dependencies` hit. The Babel plugin does not wait for the state
ratchets below; the two are independent. oxlint's own `react/*` copies of these
rules stay off.

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
`frontend/react-doctor-floor.json` (`{ "score": 57 }`), with
`frontend/doctor.config.mjs` excluding `scripts/` and tests, disabling
`.oxlintrc.json` adoption (already covered by `npm run lint`), and ignoring
`react-doctor/no-json-parse-stringify-clone` and
`react-doctor/only-export-components`. `check-react-doctor-floor.test.mjs` in
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

**Why:** `App.jsx` (line 43) and `views/Settings.jsx` (line 27) call `useStore()`
bare, `components/Modals.jsx` (line 5) and `components/RestTimer.jsx` (line 10)
call `useUI()` bare, and `views/Workout.jsx` returned a new `[]` from a selector
when no workout was active, which looped the render (#136, fixed).
**Runs:** `use-state` is checked by `frontend/scripts/check-frontend-state.mjs`,
run from `npm test` (`check-frontend-state.test.mjs`, with a failing fixture),
with shrink-only counts in `frontend/frontend-state-allowlist.json`:

- `frontend/src/sheets/catalogue.jsx`: 12
- `frontend/src/views/Stats.jsx`: 10

A file at 4 passes. A new file over 4 fails, and so does an allowlist count above
the real count or an entry at or under 4 (drop it).
**To add:** ESLint `no-restricted-syntax` selectors
`CallExpression[callee.name=/^use(Store|UI)$/][arguments.length=0]` (4 hits, fix
them first) and
`CallExpression[callee.name=/^use(Store|UI)$/] > ArrowFunctionExpression > :matches(ObjectExpression, ArrayExpression, LogicalExpression[right.type=/^(Array|Object)Expression$/])`
(no hits since #136).

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
**Runs:** oxlint `react/exhaustive-deps` at error. Its 12 hits (6 files,
measured 2026-11-24) sit in `frontend/lint-baseline.json` and may only fall.

### Lists keep stable keys; interactive elements are real elements

Do not use an array index as the `key` of a row that holds state or can be
reordered or edited; give the row an id. Use a `<button>` or `<a>` for anything
clickable, or add `role`, `tabIndex` and a key handler. Exception: a static
display list (barbell plates, instruction steps) may key by index.

**Why:** Editable set rows in `views/Workout.jsx` (line 179) key on `s.id`, and
editable Routine rows in `views/RoutineEdit.jsx` (line 70) key on `rowId`, so a
row keeps what the lifter typed when the list shifts. Clickable `div` rows ship
without a keyboard path; the a11y hit list is the count.
**Runs:** oxlint `react/no-array-index-key` at error. Its 16 hits (10 files,
re-measured 2026-11-24) sit in `frontend/lint-baseline.json` and may only fall.
**Runs:** oxlint `jsx-a11y/click-events-have-key-events`,
`jsx-a11y/no-static-element-interactions`, `jsx-a11y/prefer-tag-over-role` and
`jsx-a11y/no-autofocus` (57 hits in 19 files, re-measured 2026-11-24), in
`frontend/lint-baseline.json`.

### Sort a copy, never the state

Use `toSorted()` and `toReversed()`, or copy first (`[...a].sort()`). Immer
freezes state, so an in-place `sort` or `reverse` on it throws or corrupts a
selector. Exception: an array built in the same function.

**Why:** `lib/strength-exercises.js` (line 56) and `lib/profile/workouts.js`
(line 24) sort in place.
**Runs:** oxlint `unicorn/no-array-sort` and `unicorn/no-array-reverse` at error.
27 hits in 16 files (22 `no-array-sort` in 13 files, 5 `no-array-reverse` in
4 files, re-measured 2026-11-24) sit in `frontend/lint-baseline.json` and may
only fall. None were autofixed.

## Entities, actions, and interaction design

### Filters stay in sync with the entity

Filters must stay in sync with the shape of the data they filter. When a new
field is added to an entity that affects what something is (status, category,
bodypart, equipment, shoulder heads), every filter in `lib/catalogue-query.js`,
badge in `sheets/catalogue.jsx`, and aggregate in `lib/stats-selectors.js` must be
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
5. **A confirm is a sheet, not an ellipsis in the label.** "Delete workout",
   "Discard workout", and "Remove exercise" name the action. The confirm sheet
   is what asks. Do not append "…" to those labels.
6. **Destructive is `danger` and confirms.** Undoable actions act at once.
7. **Hide what never applies; disable what cannot run yet.** Omit an action
   that never applies in this state; disable one that is temporarily blocked.
8. **Same action, same words, same icon everywhere.** "Delete" destroys a saved
   thing (a workout, a routine, a custom exercise). "Remove" takes a set or an
   exercise off the workout or the routine in front of the lifter. "Copy" is
   the clipboard.

Judgement calls, no tooth: 1, 2, 3, 4, 7 and 8 (wording and order).
**To add** for 5 and 6: extend `frontend/src/i18n-lint.test.js`, which already
walks user-facing strings. Fail an action label that ends in "…" (a placeholder
such as `Search…` is not an action). Fail a destructive button that is not
`variant="danger"` or `danger: true` on `confirmSheet`.

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
| Day key, today, Monday-first week | `lib/dates.js` (`todayISO`, `isoOf`, `mondayOf`) |
| kg and lb conversion, one-decimal rounding, the unit cascade | `lib/units.js` (`normalizeWeight`, `round1`, `resolveSetWeight`) |
| Best, Records, Tonnage, last session, Estimated 1RM series | `lib/training-log.js` |
| Estimated 1RM formula and `REP_CAP` | `lib/onerm.js` |
| A Workout's timestamp | `workoutTimestamp` in `lib/dates.js` |
| Durations and clock text | `lib/format.js` |

**Why:** the strongest bug class in the history: `fbff6fd` (Step done),
`b85ff0a` (set counts), `a1703bd` (body weight), `6cd4bf9` (raw catalogue),
`24f1969` and `c4e36a8` (kind to icon), `2ce7f79` (unit), `9c89dd8` (streak). Live
copies today: `lib/import-csv.js` and `lib/bodyweight.js` convert kg and lb
by hand (the one in `lib/bodyweight.js` is unrounded, so a weigh-in and a logged
Set disagree); `lib/recovery.js` re-writes Epley with a different rep cap;
`latestWorkSetAt` in `lib/training-log.js` re-implements `workoutTimestamp`;
`round1` is defined five times (four copies); a day is spelled seven ways
(`DAY_MS` in two files, `86400000`, `24 * 60 * 60 * 1000`).
**To add:** ESLint `no-restricted-syntax` selectors, each failing outside its
owner with a message naming the owner: `Identifier[name='LB_TO_KG']` and the
literals `2.2046` and `0.4535` (`lib/import-csv.js`, `lib/bodyweight.js`);
`LogicalExpression[right.value='kg']` (18 hits in `lib/`); the inline
`Math.round(x * 10) / 10`, selector
`BinaryExpression[operator='/'][right.value=10][left.callee.object.name='Math'][left.callee.property.name='round'][left.arguments.0.operator='*'][left.arguments.0.right.value=10]`
(25 hits in 12 files outside `lib/units.js`, 4 of them `round1` definitions);
`(getDay() + 6) % 7`, selector
`BinaryExpression[operator='%'][right.value=7][left.type='BinaryExpression'][left.operator='+'][left.right.value=6][left.left.callee.property.name='getDay']`
(3 hits outside `lib/dates.js`: `components/Heatmap.jsx:36`,
`sheets/history.jsx:139` and `views/Home.jsx:59`). All counts and selectors were
run on 2026-11-24; the `% 7` selector does not hit `padded.length % 7`
(`sheets/history.jsx:173`).
Baseline each in `frontend/eslint-suppressions.json`, and fix the `LB_TO_KG`
copies first because they hold real value drift. The `|| 'kg'` count falls as
`unit` joins `PROFILE_CLEAN`. Epley and the timestamp copies are judgement
calls, no tooth; a duplicate-code tool would be noise.

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
**To add:** ESLint `no-restricted-syntax` on
`CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString']`
(2 hits: fix `lib/progression.js`, allowlist the scenario file) and on
`NewExpression[callee.name='Date'][arguments.length=1] > :matches(MemberExpression[property.name='d'], Identifier[name='d'])`
(4 hits, fix first). `lib/dates.js` has no day parser yet; add one (noon local)
so the fix has a home.

### The clock is an argument in `lib/`

`lib/` takes `now` as an argument and never reads the clock. No `Date.now()`,
no `new Date()`, and no `now = Date.now()` default. Outside `lib/` the clock is
read at the edge: `store/`, `platform/` and event handlers. Exception: `uid()`
in `lib/format.js` and `todayISO()` in `lib/dates.js`. This is the only place
the rule is stated; the other sections point here.

**Why:** a default hides the clock from every caller that omits it, and tests run
on wall time without saying so. `streakOf(S, today = Date.now())` even names a
millisecond value `today`. Eight reads sit outside the two owners: four are
defaults (`lib/active-finish.js`, `lib/history.js`, `lib/streak.js`,
`lib/profile/normalize.js`), the rest are in `lib/active-finish.js`,
`lib/active-session.js`, `lib/effort.js` (a bare `Date.now()` inside a filter)
and `lib/progression.js`.
**To add:** oxlint `eslint/no-restricted-properties` (`Date.now`), in an
`overrides` block for `src/lib/**` with the two owner files and tests excluded,
and ESLint `no-restricted-syntax`
(`NewExpression[callee.name='Date'][arguments.length=0]`) scoped the same way.
Fix the four defaults and `lib/effort.js` first; baseline the rest in
`frontend/lint-baseline.json` (oxlint) and `frontend/eslint-suppressions.json`
(ESLint).

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
sheets and components.
**To add:** extend it to attribute text (`aria-label`, `title`, `placeholder`,
`alt`): three literal `aria-label`s break today, two in `views/RoutineEdit.jsx`
and one in `components/ui.jsx`.

## Interface design

### Deep modules

Prefer deep modules: small interface, deep implementation.

Avoid shallow modules: large interface with many methods that just pass through
to thin implementation. When designing, ask: can I reduce the number of methods?
Can I simplify the parameters? Can I hide more complexity inside?

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
`vite.config.js` sit in `frontend/lint-baseline.json` and may only fall: 53
`eslint/no-restricted-globals` and 4 `eslint/no-restricted-properties`, 57 hits
in 12 files (`console`, `localStorage` in the review scripts, and
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

**To add:** an ESLint rule in the test files, scoped in
[`docs/TESTING_STANDARDS.md`](./docs/TESTING_STANDARDS.md): fail `vi.mock` of a
relative path that is not in `platform/`, with the selector run on 2026-11-24:
39 hits in 11 files, baseline in `frontend/eslint-suppressions.json`.

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
| Vitest guard tests, in `npm test` | `purity.test.js`, `import-cycles.test.js`, `design-tokens.test.js`, `design-lint.test.js`, `env.test.js`, `i18n-lint.test.js`, `sheets/dialog-names.test.jsx`, `docs.test.js`, `platform/storage.test.js` (the 800ms debounce), `comments.test.js`, `effect-types.test.js`, the `warmArt` test (`App.warm-art.test.jsx`), the `flush()` test (`store/useStore.flush.test.jsx`), the save round-trip tests (`sheets/catalogue.test.jsx`, `views/RoutineEdit.test.jsx`) | `profile-keys.test.js` |
| ESLint 10, `npm run lint` after the oxlint ratchet (CI only) | `react-hooks/set-state-in-effect`, `react-hooks/no-deriving-state-in-effects`, `react-hooks/set-state-in-render`, `react-hooks/immutability`, `react-hooks/preserve-manual-memoization`, `react-hooks/globals`, all at error, 0 hits. `static-components` (9 hits, 2 files), `purity` (5), `refs` (2, 1 file), `memo-dependencies` (1), at error with `frontend/eslint-suppressions.json`. `react-hooks/todo` stays off | the `no-restricted-syntax` selectors (including `vi.mock` scope). Ratchet: `frontend/eslint-suppressions.json` |
| oxlint, ratchet in the pre-commit hook and in `npm run lint` (CI) | `correctness` category, `react/rules-of-hooks`, `react/exhaustive-deps`, `no-throw-literal`, `prefer-promise-reject-errors`, `complexity`, restricted globals and properties (except `Date.now` in `lib/`), `unicorn/no-array-sort`, `unicorn/no-array-reverse`, `react/no-array-index-key`, `jsx-a11y/click-events-have-key-events`, `jsx-a11y/no-static-element-interactions`, `jsx-a11y/prefer-tag-over-role`, `jsx-a11y/no-autofocus`, all at error. Ratchet: `frontend/lint-baseline.json`, checked by `scripts/check-lint-baseline.mjs` with its failing fixture in `npm test` | `Date.now` in `lib/` (the clock). Ratchet when it lands: `frontend/lint-baseline.json` |
| tsc | nothing | `tsconfig.json`, `npm run typecheck` in the hook and CI. Ratchet: `frontend/tsc-baseline.json` |
| oxlint type-aware (`oxlint-tsgolint`) | nothing | `no-floating-promises`, `no-misused-promises`, `only-throw-error`, `switch-exhaustiveness-check`, `no-explicit-any`, `no-non-null-assertion`, `ban-ts-comment` |
| `frontend/scripts/check-frontend-state.mjs`, in `npm test` | The `use-state` cap, with its failing fixture. Ratchet: `frontend/frontend-state-allowlist.json` | nothing |
| Babel and CI | `npm run test:fatigue-probe`, `npm run build`, and the `React Doctor` floor (`frontend/react-doctor-floor.json`, checked by `frontend/scripts/check-react-doctor-floor.mjs` with its failing fixture in `npm test`) | `babel-plugin-react-compiler` |

`npm run test:fatigue-probe` stays out of `npm test` on purpose: the workflow
says it is too slow for the unit suite.

**Build order**, cheapest and highest value first:

1. The six zero-hit `react-hooks` compiler rules are on at error, and
   `static-components`, `purity`, `refs`, and `memo-dependencies` are on at
   error with `frontend/eslint-suppressions.json`. Fix the small real hits
   first: 4 bare store reads, 1 selector `[]`, 1 UTC day key, the `LB_TO_KG` copies.
2. The ESLint `no-restricted-syntax` selector block with its allowlists.
3. oxlint, `frontend/lint-baseline.json` and its failing fixture already run
   `complexity`, restricted globals and properties, `exhaustive-deps`,
   `unicorn/no-array-sort`, `unicorn/no-array-reverse`, `react/no-array-index-key`
   and the `jsx-a11y` rules named under "Lists keep stable keys". What this step
   still adds is the `Date.now` override for `lib/`. ESLint has left the
   pre-commit hook: the hook runs the oxlint ratchet, and ESLint (about 19 s
   with the compiler rules) runs in CI. `tsc` stays in step 4, with type-aware
   oxlint. The `use-state` cap stays in its own row.
4. `tsconfig.json`, `npm run typecheck` and `frontend/tsc-baseline.json`, then
   the JSDoc `@typedef`s. Then oxlint's type-aware rows.
5. The guard tests still to add.
6. Rename `lib/` to `.ts`, then the rest, then tests.
7. `babel-plugin-react-compiler`, after the ESLint compiler rules are green.
   Add `'use no memo'` (or move the import) in `App.jsx` and
   `components/BodyMap.jsx` first.
8. React Doctor is on as its own CI step named `React Doctor`, with
   `frontend/react-doctor-floor.json` (see its rule above).
