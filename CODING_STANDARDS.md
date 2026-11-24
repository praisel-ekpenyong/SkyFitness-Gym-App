# Coding standards

The rules a human or an agent holds in their head while writing and reviewing
code in Sky. Each rule's essence is here; the longer reasoning lives in the doc it
links.

Sky is a single-user, no-login, backend-free gym and body-weight tracker built
with React 19, Zustand, Immer, and Vite PWA.

A rule the code already breaks stays. The code is not the bar. Under each
rule, **Runs** names the check that fails today. **To add** names a check that
does not exist yet. An agent must not pretend a **To add** check is already in
CI. Where today's code is over the bar, the check is a ratchet: the first run
records the current count, and a later run may only shrink it.

## Configuration

Read every environment variable in `validateEnv`
([`frontend/src/lib/env.js`](./frontend/src/lib/env.js)). Callers use
`env.imgBase`, never `import.meta.env` inside a feature branch. An optional
variable has its default in `validateEnv`: a missing `VITE_IMG_BASE` is
`media/images/`. A variable with no safe default throws from `validateEnv` at
load, and the message names the variable. Profile preferences (`restSec`,
`sound`, `unit`) are fields on `S`, read when used.

**Runs:** `frontend/src/lib/env.test.js` pins the defaults.
**To add:** a lint that fails `import.meta.env` and `process.env` outside
`lib/env.js`. Seed the allowlist with the reads that are the edge itself:
`lib/env.js`, `useStore.js` (`import.meta.env.MODE` for Immer's test freeze),
and `components/Modals.jsx` (`import.meta.env.DEV`).

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

**Runs:** `frontend/src/lib/purity.test.js`.
Detail, the `restSec` / `sound` read, and the effect-type check to add:
[`docs/EFFECT_STANDARDS.md`](./docs/EFFECT_STANDARDS.md).

## Control flow

### A switch over a union names every member

A `switch` on a union type lists every member as its own `case`, even those that
share a branch. A `default` that quietly absorbs leftover members will also absorb
new members added in the future without an explicit decision. Without a `default`,
adding a member to a union forces every switch site to handle it.

**To add:** oxlint `typescript/switch-exhaustiveness-check`, type-aware, after
`tsconfig` exists. See "What runs, and what is still to build".

### Functions stay simple

No function has a cyclomatic complexity over 15 (`complexity`, `modified`
variant, so a whole `switch` counts once). Over the limit, split it: extract named
pure helpers or move decision trees into domain reducers. Never use a disable
comment to bypass the limit. Functions already over 15 live in the shared
shrink-only `frontend/lint-baseline.json` with the other oxlint hits. They do
not get a complexity file of their own.

**To add:** the `complexity` row below.

## Errors

### Throw Errors, not values

Outside command results, throw an `Error` or a subclass of `Error`. A thrown
string or plain object has no stack trace and fails downstream `instanceof Error`
checks. Inside command handlers (`act`), represent domain refusals via `{ ok: false }`.
Never write an empty `catch` block (`catch (_) {}`) that silently swallows errors:
catch the specific error you expect, or log what you drop.

**To add:** oxlint `typescript/only-throw-error`. See "What runs, and what is still to build".

### Every promise is awaited, handled or marked void

A promise nobody awaits loses its rejection: the failure turns into an
unhandled rejection rather than an error the caller sees, and the work it
started may still be running after the caller has moved on. Await it, or
`.catch` it where it is made. When fire-and-forget is the intent (a
signal handler, a best-effort log line), write `void promise`. Do not hand an
async function to a slot that expects a `void` callback either (an event
listener, `forEach`), because nothing there awaits or catches what it returns.

**To add:** oxlint `typescript/no-floating-promises` and
`typescript/no-misused-promises`. Older hits go in `frontend/lint-baseline.json`
when that checker is turned on, and the count only shrinks. The file does not
exist yet.

## Function signatures

Optional parameters passed to functions should be scrutinized extremely
carefully. They are a frequent source of bugs by omission. Prioritize correctness
and explicit configuration over backward compatibility.

## Types and TypeScript migration

The target is strict TypeScript. The tree is JavaScript today: `frontend/` has
no `.ts` file and no `tsconfig`. Do not add a `.ts` file until
`frontend/tsconfig.json` (`strict: true`) and `npm run typecheck` exist. A
TypeScript file with nothing checking it is an unenforced rule.

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

Until the type-aware rows are on, a `.js` file still follows the rule. JSDoc at
the boundary is the stand-in, not a cast.

**To add:** oxlint `typescript/no-explicit-any`, `typescript/no-non-null-assertion`,
`typescript/ban-ts-comment`, and `typescript/no-unsafe-*`, after `tsconfig`.
Old hits go in `frontend/lint-baseline.json` and only shrink.

### Migration discipline

Once `typecheck` is red/green in CI:

1. **`frontend/src/lib/` migrates first.** Pure domain logic has no browser
   dependency and is the first code under `strict`.
2. **After `lib/` is on the checker, a new file is `.ts` or `.tsx`.**
3. **A `.js` file that has not moved yet is not loosened.** A boundary that
   other modules call gets JSDoc for its arguments and return.

**To add:** `npm run typecheck` in `.github/workflows/test.yml`, then the
type-aware oxlint rows.

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
are never converted in place ([ADR 0028](./docs/adr/0028-one-rule-for-kg-and-lb.md)).

### Active workout targets are frozen at inception

When a workout begins, `act(S, { type: 'begin', routineId, bw })` freezes a
deep copy of each Routine exercise into `active.entries[].target`
([ADR 0032](./docs/adr/0032-the-active-workout.md)). Subsequent edits or
deletions of a Routine or custom exercise in the plan sheet cannot alter an
in-progress workout or produce stranded writes.

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

Never inject raw objects directly into the store or storage.

### Dual-write persistence

Every state persist writes synchronously to `localStorage` (`gym_state_v1`) and
mirrors to IndexedDB (`sky-state` database) via `platform/storage.js` on an
800ms debounce ([ADR 0004](./docs/adr/0004-dual-write-storage.md)). The mobile
Capacitor build additionally mirrors state to a native JSON file
(`platform/mobile.js`).
All debounced writes are immediately flushed on `visibilitychange -> hidden`.

## Front-end state and store discipline

Sky uses two dedicated stores:
1. **Persistent state (`frontend/src/store/useStore.js`)**: Single source of
   truth for persistent profile `S`. Every mutation must go through `update(mut)`
   (or `act(command)` for active workouts), which runs an Immer draft (`produce`),
   stamps `_ts`, and persists the result ([ADR 0026](./docs/adr/0026-update-copies-only-what-changed.md)).
2. **Ephemeral UI state (`frontend/src/store/useUI.js`)**: Ephemeral sheets stack,
   toast queue, and countdown timers. `useUI` never imports `useStore`.

### The three frontend state invariants

These are the bar. The current UI is over it in two files. The check is a
ratchet, not a rewrite ticket hidden in a doc.

1. **`use-state <= 4`.** Past four independent toggles, the state belongs in a
   pure function or the store.
2. **`effect-sets-state <= 1`.** At most one `useEffect` / `useLayoutEffect` in
   a file calls a `useState` setter. Derive during render, or dispatch.
3. **`whole-store == 0`.** Subscribe to a slice (`useStore(s => s.S.unit)`).

**Runs:** nothing.
**To add:** `frontend/scripts/check-frontend-state.mjs`, run from `npm test`.
Shrink-only counts in `frontend/frontend-state-allowlist.json`.

Seed `use-state` with the files already over 4:

- `frontend/src/sheets/catalogue.jsx` — 12
- `frontend/src/views/Stats.jsx` — 10

A file at 4 passes. A new file over 4 fails. Those two counts may only fall.

`effect-sets-state`: the script's first run writes the baseline, and every run
after that may only shrink it. Do not hand-pick the numbers.

`whole-store` has no current hit. The script fails it with an empty allowlist
on the first run.

### Derive state during render; no prop-mirroring

Never copy store state or props into `useState` to sync them with `useEffect`.
If a value can be computed from `S` or props, compute it inline during render
(`useMemo` for expensive aggregations). When a component must reset its state on
an entity change, pass a `key` prop (`key={exercise.id}`) instead of writing
synchronization effects.

## Entities, actions, and interaction design

### Filters stay in sync with the entity

Filters must stay in sync with the shape of the data they filter. When a new
field is added to an entity that affects what something is (status, category,
bodypart, equipment, shoulder heads), every filter in `lib/catalogue-query.js`,
badge in `sheets/catalogue.jsx`, and aggregate in `lib/stats-selectors.js` must be
updated to take the new field into account. Drift between filters and entity
definitions produces silently wrong results.

### Action consistency

1. **Labels are verb-first Title Case without articles**: "Add Exercise",
   "Start Workout", "Discard Workout", "Replace".
2. **An action on the entity's own card or sheet drops its noun**: "Rename",
   not "Rename Routine"; "Delete", not "Delete Exercise".
3. **A toggle names what it will do**: "Mark as Done", not "Done / Not Done".
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

**To add:** extend `frontend/src/i18n-lint.test.js`, which already walks
user-facing strings. Fail an action label that ends in "…". A placeholder
such as `Search…` is not an action. Fail a destructive button that is not
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

## Visual and design tokens

The rules live in [`DESIGN.md`](./DESIGN.md). This file does not restate them.
Restating them here is how the two documents drift.

**Runs:** `frontend/src/design-tokens.test.js` (contrast, accents) and
`frontend/src/design-lint.test.js` (at most 12 `--fs-*` tokens, every
`font-size` outside `tokens.css` is `var(--fs-*)`, inline colour only on that
test's allowlist). A new colour or size that the test rejects is a change to
`DESIGN.md` and the test together.

## Display formatting and text

### Single-owner formatting

Formatting logic must never be duplicated across components:
- **Durations, timestamps, and numbers**: Format via `frontend/src/lib/format.js`
  and `frontend/src/lib/dates.js`. Hand-rolled division (`seconds % 60`) or
  `padStart(2)` formatting is prohibited.
- **Set badges**: Format via `frontend/src/lib/set-label.js`.
- **Units and plate grids**: Format via `frontend/src/lib/units.js` and
  `frontend/src/lib/plates.js`.
- **Toasts**: Dispatched exclusively through `useUI().toast()` and rendered by
  `components/Toast.jsx`.

### Localization readiness

All user-facing strings must be wrapped in `t('literal')` from
`frontend/src/lib/i18n.js` ([ADR 0003](./docs/adr/0003-english-only.md)).
Although Sky currently ships in English only, `t()` enables parameter
interpolation (`{0}`) and keeps the application translation-ready without
re-architecting string calls.

## Interface design

### Deep modules

Prefer deep modules: small interface, deep implementation.

Avoid shallow modules: large interface with many methods that just pass through
to thin implementation. When designing, ask: can I reduce the number of methods?
Can I simplify the parameters? Can I hide more complexity inside?

### Pure training logic boundary

Pure training logic lives exclusively in `frontend/src/lib/` (progression, 1RM,
recovery, catalogue search, volume). `lib/` must never import from `store/`,
`views/`, `sheets/`, `components/`, or `platform/`. It has zero knowledge of the
DOM or browser APIs. **Runs:** `frontend/src/lib/purity.test.js`.

### Global APIs have one owner

Each global has an owner. A new call site outside the owner is a bug. The
owners below are the legal ones, including the call sites that exist today.

| API | Owner |
|---|---|
| `localStorage`, `indexedDB` | `frontend/src/platform/storage.js` |
| `Audio`, `navigator.vibrate` | `frontend/src/platform/sound.js` |
| `wakeLock` | `frontend/src/platform/wakelock.js` |
| `Date.now()`, `new Date()` | `useStore.js` stamps `_ts`. `uid()` in `lib/format.js` builds ids. `lib/dates.js` owns calendar keys. Training logic takes `now` as an argument. |
| `Math.random()` | `uid()` in `lib/format.js` |
| `console` | `components/ErrorBoundary.jsx`, `components/Modals.jsx` |
| `fetch` | `platform/media-warm.js`, for static media. There is no API client. |

**Runs:** `purity.test.js` bans `localStorage`, `document`, `window`, and the
other browser globals inside `lib/` only.
**To add:** oxlint `no-restricted-globals` / `no-restricted-properties` for
every row, failing outside the owner file. Tests that clear `localStorage`
are the test setup, listed in the allowlist by path suffix `.test.js` and
`.test.jsx`.

### Modern ESM: no CommonJS globals

Sky is pure ECMAScript (`"type": "module"`). Use `import.meta.url`,
`import.meta.dirname`, or `import.meta.filename`. Never use CommonJS globals
(`__dirname`, `__filename`, `require`) or create shims named after them.

### Session performance: nothing starves the lifter

Work running during an active workout must never drop frames, freeze gestures,
or delay rest timers and audio cues:
- Heavy calculations (30-day EWMA fatigue scans, large CSV imports, PDF plan
  rendering) must not run synchronously on the main thread during an active workout.
- Storage writes must remain debounced (800ms) to prevent IndexedDB disk stalls.
- `warmArt` fetches. `App.jsx` is what schedules it, on `requestIdleCallback`
  (timeout 5s, or a 3s `setTimeout` when the API is missing). Do not call
  `warmArt` from a render or from a logged-set handler.

**Runs:** `platform/storage.test.js` holds the 800ms debounce (`DRAIN_MS`).
**To add:** a test that the `warmArt` call in `App.jsx` sits inside
`requestIdleCallback`.

### Design for testability

1. **Accept dependencies, don't create them** — pass external dependencies in rather than constructing them internally.
2. **Return results, don't produce side effects** — a function that returns a value is easier to test than one that mutates state.
3. **Small surface area** — fewer methods = fewer tests needed, fewer params = simpler test setup.

## Comments

Only public interface entry points receive concise JSDoc explaining the
contract. Implementation mechanics should be readable without comments.
Architectural rationale and design decisions live in `docs/adr/`.

## Testing

Tests verify behaviour through the public interface. Code can change entirely;
a test should not break unless the behaviour changed. Mock at system boundaries
only (`localStorage`, audio, the clock, the wake lock, Capacitor). Never mock
our own modules. A test must be able to fail for a bug a lifter or a caller
would see. If you can't name the bug, don't write the test.

Worked examples, the seam table, and the red flags:
[`docs/TESTING_STANDARDS.md`](./docs/TESTING_STANDARDS.md).

## What runs, and what is still to build

Oxlint is the checker for the prose rules above. It is not installed. There is
no `frontend/.oxlintrc.json` and no `frontend/lint-baseline.json`. Adding the
dependency is part of building the tooth, not a sign the rule is already on.

When a rule is turned on, the first run writes `frontend/lint-baseline.json`
(count per file). A later run may only shrink a count. A new file is not in
the baseline, so it must be clean. A suppression is illegal unless the
baseline names it and says why.

| Rule | Oxlint | Type-aware |
|---|---|---|
| A switch names every member | `typescript/switch-exhaustiveness-check` | yes, after `tsconfig` |
| Throw `Error`, not a string | `typescript/only-throw-error` | yes |
| Every promise awaited, handled, or `void` | `typescript/no-floating-promises`, `typescript/no-misused-promises` | yes |
| No `any`, no `as`, no `!` | `typescript/no-explicit-any`, `typescript/no-non-null-assertion`, `typescript/ban-ts-comment`, `typescript/no-unsafe-*` | yes |
| Complexity ≤ 15, `modified` variant | `complexity` | no |
| Globals stay in their owner | `no-restricted-globals`, `no-restricted-properties` | no |

**Runs, `npm test`:**

- `frontend/src/lib/purity.test.js`
- `frontend/src/import-cycles.test.js`
- `frontend/src/design-tokens.test.js`
- `frontend/src/design-lint.test.js`
- `frontend/src/lib/env.test.js`
- `frontend/src/i18n-lint.test.js`
- `frontend/src/platform/storage.test.js` (the 800ms debounce)

**Runs, CI only** (`.github/workflows/test.yml`, after `npm test` and `npm run build`):

- `npm run test:fatigue-probe`. It stays out of `npm test` on purpose. The
  workflow says the probe is too slow for the unit suite.

**To add, in this order:**

1. `frontend/scripts/check-frontend-state.mjs` (the three UI caps) and
   `frontend/scripts/check-effects.mjs` (every effect type has a branch).
   Neither needs a typechecker.
2. Oxlint with the non-type-aware rows (`complexity`, restricted globals).
   First run writes `frontend/lint-baseline.json`. Shrink only.
3. `tsconfig` strict and `npm run typecheck` on `lib/` first. Then the
   type-aware oxlint rows.
4. React Compiler, as `babel-plugin-react-compiler` on the Vite React plugin,
   plus its lint rule failing a component the compiler refuses. Wire it only
   after the `useState` and set-state-in-effect ratchets are already counting,
   and the component is under those caps.
5. React Doctor as its own CI step. It does not replace rows 1–4. A Doctor
   finding becomes a row in this file with a named check, or it is noise.
