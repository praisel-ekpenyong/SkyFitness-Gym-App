# Testing standards

The worked examples behind the testing rules in
[`CODING_STANDARDS.md`](../CODING_STANDARDS.md). Read those two rules first —
behaviour through public interfaces, and mocking at system boundaries only.
Everything here is how they look in Sky.

Run the suite from `frontend/` with `npm test` (`vitest run`).

## What earns a test its place

A test must be able to fail for a plausible bug in behaviour a lifter or a
caller observes.

Worth a test:

- A training rule: progression, a prescription, what counts as a hard set,
  what a unit switch converts.
- A parser or serialiser: CSV import, a shared plan, `admit` filling a
  missing field and refusing a newer Profile.
- Data integrity: warm-ups staying out of tonnage and estimated 1RM, a
  finished Workout keeping the unit it was logged in, a copy that does not
  share the Routine's object.
- A regression for a real bug. A test that arrived with a fix stays.
- A guard: `purity.test.js`, `import-cycles.test.js`.

Not worth a test:

- **Tautologies.** A mock returning what it was told. A restated constant,
  default, or lookup table. A snapshot of static markup.
- **Implementation details.** Call counts, call order, private helpers or
  internal state shape. Anything that breaks on a harmless refactor.
- **Near-duplicates.** The same rule at the same seam with another literal,
  unless the literal is a boundary (0, the rep cap, an empty Profile).
- **Glue.** A pass-through, a one-line mapping. Test what it delegates to.
- **Someone else's code.** That React renders, that immer freezes, that
  Vitest mocks.

Prefer one test at the right seam over the same rule re-checked through the
view, the store, and the lib function.

## The seam

| Behaviour | Test it through |
|---|---|
| Training rules, prescriptions, history | The pure function in `lib/`, Profile in, value out |
| Changing the Active workout | `act(S, command)` and `sessionView` |
| What a command asks the UI to do | The `effects` array on `act`'s result |
| A Profile entering the app | `admit` |
| Stats, catalogue search | `selectStatsOverview` / `queryCatalogue` |
| Wiring a click or a key to a command | A view test, one per behaviour |
| Storage, sound, the wake lock | `platform/`, with the browser API faked at that edge |

`lib/active-*` is inside `act`. A test that imports a helper from those files
to check a rule `act` already exposes is testing the implementation. Drive
`act`, then read the Profile and the effects.

The store's `act` is the place that runs effects. Test that runner when the
question is "did the timer start" or "did a hold finish through `send`".
Don't re-test the prescription there.

## Component tests

Most UI changes need no component test. The rule belongs in `lib/`; the test
belongs beside it. Write a component test only for:

- **The wiring** between what the lifter does and the command or callback
  that fires: which control logs a set, which one discards.
- **Browser-only behaviour** that a function cannot reproduce: focus, a dialog's
  dismiss, a timer ticking on screen.

Act like a lifter. Find elements by role, label, or text. Assert what they
see, or the command that was sent. No snapshots, no class names, no reaching
into hooks for state the screen does not show.

One component test per behaviour, not one per component. If the behaviour can
move into a function, move it and delete the component test.

## Good tests

Integration-style tests that exercise real code through the public function.
They describe what the system does, not _how_.

```javascript
it('freezes a copy of each Routine exercise as the Entry target', () => {
  const S = blankProfile()
  S.routines = [{ id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 8, weight: 50 }] }]
  act(S, { type: 'begin', routineId: 'r1', bw: 80 })
  expect(S.active.entries[0].target).toEqual({ id: '0025', sets: 3, reps: 8, weight: 50 })
  expect(S.active.entries[0].target).not.toBe(S.routines[0].ex[0])
})
```

- The caller cares: editing the Routine later must not rewrite the workout
  already in progress.
- Only `act` and the Profile are used.
- The internals of `createActiveSession` can change and this test stays green.
- One situation, one outcome.

A second one, for an effect. `own` is a Profile whose active Entry target has
`rest: 180`. `tick` logs that set through `act` and returns the `rest:start`
effect:

```javascript
const tick = (S, entry, set) =>
  act(S, { type: 'toggle', entry, set }).effects.find(e => e.type === 'rest:start')

it('rests for the exercise\'s own duration when the set is logged', () => {
  expect(tick(own, 0, 0)).toEqual({ type: 'rest:start', sec: 180 })
})
```

The bug it catches: the logged set rests for the Profile's `restSec` and
ignores the exercise's `rest`.

## Bad tests

```javascript
// BAD: mocks our own module and checks HOW, not WHAT
it('toggle calls playSetComplete', () => {
  const play = vi.spyOn(sound, 'playSetComplete')
  toggleActiveSet(S, 0, 0)
  expect(play).toHaveBeenCalled()
})

// BAD: the function is the spec — the test restates a one-line map
it('effect type rest:start is rest:start', () => {
  expect(effect('rest:start').type).toBe('rest:start')
})
```

Red flags:

- Mocking our own modules, classes, or helpers.
- Testing private methods
- Asserting on call counts or call order inside the boundary.
- Test breaks when refactoring without behavior change
- Test name describes HOW not WHAT
- Verifying by reaching past the interface: reading a private field, or a
  structure no caller sees.
- Testing a trivial function (one-liner, simple mapping, string concatenation) where the test just mirrors the code — these tests add no confidence and break on any refactor
- A view test that mocks `act` and checks the mock was called with a
  hand-built argument, when `act` itself is where the rule lives. Test `act`.
  Leave the view test for the wiring.

## Mocking at a boundary

Fake the thing we do not own:

- `localStorage`, IndexedDB, and the Capacitor filesystem, in `platform/`
  tests.
- `Audio`, `navigator.vibrate`, the wake lock.
- The clock, when the rule depends on "now". Pass `now` in. Don't
  `vi.setSystemTime` inside a pure function that should have taken the time
  as an argument.
- Network, if a test ever has to touch it. The app has no API.

Do not fake `act`, `admit`, progression, or the catalogue to test a caller
that is supposed to use them. A real Profile fixture is shorter than a mock
and fails when the rule changes.

Prefer a small function you can replace at the edge (`playSetComplete(enabled)`)
over a generic browser wrapper with conditional branches in the test setup.

## TDD workflow: vertical slices

Write one test, make it pass, then write the next. Writing every test first
produces tests that verify _imagined_ behavior and are insensitive to real
changes.

```
RED→GREEN: test1→impl1
RED→GREEN: test2→impl2
RED→GREEN: test3→impl3
```

Each test responds to what you learned from the previous cycle. Get to GREEN
before you refactor.

## Teeth

The judgement rules ("name the bug", "one seam") are how a review rejects a
test. One of them can be mechanical.

**Runs:** the seams this doc names are where the existing suite already
asserts. `lib/active-workout.test.js` imports `act` and `sessionView` from
`active-workout.js`, not the files under `lib/active-*`.

**To add:** a test that fails `vi.mock` of a module under `frontend/src/lib/`
or `frontend/src/store/`. Mocking `platform/sound.js`, `localStorage`, and
Capacitor stays legal. Those are the boundary.
