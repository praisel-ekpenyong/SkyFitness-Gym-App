# Effect standards

The detail behind the effect rules in
[`CODING_STANDARDS.md`](../CODING_STANDARDS.md). Sky does not use the Effect
library. An effect here is a plain object `{ type, ... }` that describes work
the UI must do after a command. Building one does nothing until a runner
performs it. The three rules are the same idea: run it, handle failure in the
result, keep it inside the boundary.

The producer is `act` in `frontend/src/lib/active-act.js`. The runner is
`runEffects` in `frontend/src/store/effects.js`, called from the store's
`act` before that function returns. One effect, `open-finish`, is performed
by the view (`frontend/src/views/Workout.jsx`), because the store cannot
import a sheet without a cycle.

## Effects are run, never dropped

An effect that is neither performed nor returned to a caller who performs it
is silently skipped. No error, no log. The set was logged and the rest never
started.

- **`act` returns the full list.** A command that should beep, rest, toast,
  stop a timer, or open the finish sheet pushes that effect before it
  returns. Returning `{ ok: true, effects: [] }` means nothing should happen
  in the UI. That is a real answer (editing the reps, jumping to an Entry),
  not a place to hide a side effect.
- **The store runs the list before returning.** `useStore.act` calls
  `runEffects(res.effects, …)` on the way out. A caller that uses the store
  does not also walk the list to start timers or play sound.
- **The view runs `open-finish` and only that.** `send` in `Workout.jsx`
  opens the finish sheet when the list contains it, including when a hold
  the view itself sent completes the last set. The store's `act` takes that
  `send` for this reason: a hold finishes through it, and a default sender
  would drop `open-finish`.
- **A Manual rest does not go through `act`.** The rest button is a gesture,
  not a logged set. The view calls `startRest` itself. A rest that follows a
  logged set is `rest:start` from `act`. There is no third way to start a
  timer.
- **Tests assert the list at the `act` seam** (`effects.map(e => e.type)`,
  or the one object when the payload matters, such as `sec` on
  `rest:start`). A test that only checks the Profile after a toggle can stay
  green while the rest effect was forgotten.

`runEffects` names every type it owns: `rest:start`, `rest:stop`,
`hold:start`, `hold:stop`, `sound:set`, `sound:finish`, `notice`. A new type
is a branch there, or a branch in the view when it is the same kind of thing
as `open-finish`, plus a test. A type with no branch is dropped. Don't add
one and leave it for "later".

## Failures stay on the result

A command the Active workout refuses — no workout to finish, a hold ref that
no longer matches a row, a begin while sets are already logged — returns
`{ ok: false, effects: [] }`. It does not throw. Callers branch on `ok`.

Throwing is for a broken program, not a refused command:

- An unknown `command.type` throws from `act`. That is a caller bug.
- `hold:start` with no `send` throws from `runEffects`. A hold must be able
  to send `completeHold` when its time is up. Swallowing that throw would
  start a timer that can never log the set.

Don't wrap `act` in `try/catch` to mean "the lifter couldn't do that". The
`ok` flag is that answer, and a `catch` would also hide the unknown-command
throw.

Don't catch inside `lib/` to turn a refusal into an empty success. `applied`
already maps a failed inner call to `refused()`.

## Effects stay inside their boundary

An effect keeps its meaning only while the producer and the runner stay in
their roles.

- **`lib/` returns effects and never performs them.** No `useUI`, no
  `platform/sound.js`, no sheet, from `act` or from anything it calls.
  `purity.test.js` holds this. A function under `lib/active-*` that starts a
  timer "just this once" has left the boundary, and a unit test of `act`
  will not see it.
- **`runEffects` is the only store code that touches `useUI`.** Sound goes
  through `platform/sound.js`. At the start of the run it reads the Profile
  once. `rest:start` without `sec` uses that `restSec`. `sound:set` and
  `sound:finish` use that `sound`. The timer tick is the live read: `soundOn`
  calls `getS().sound` on each tick, so a sound toggle during the rest is heard.
- **A view sends commands and renders `sessionView`.** It does not decide
  which set is next, whether the workout is complete, or how long to rest
  after a log. Those come back as the next Profile and the effect list.
- **Don't swallow a failure or an effect.** `runEffects` does not catch
  errors from the timers. A `notice` whose `notice` field is not `cardio` or
  `timed` is ignored on purpose (`NOTICE` has no other rows); a new notice
  kind is a row there, not a toast fired from the view. `open-finish` is
  absent from the runner on purpose, and the view is the place that handles
  it. Anything else absent from both is a dropped effect.
- **Payloads stay small and plain.** `rest:start` may carry `sec`. Without
  it, the runner uses the Profile's `restSec`. `hold:start` carries `sec`,
  `label`, and `ref`. Don't put a function, a Profile, or a DOM node on an
  effect. The list has to be something a test can deep-equal.

### Adding an effect

1. Push it from the command in `active-act.js` (or from the helper that
   command calls, still returned through `act`).
2. Perform it in `runEffects`, or in the view when the store is not allowed
   to (the `open-finish` case). Say which, in the runner's comment if it is
   not the runner.
3. Cover it from `act`: the type is in the list, and any payload the runner
   needs is on the object.
4. If the runner's behaviour is the question (the hold completes through
   `send`, a missing `sec` uses `restSec`), add that in `useStore.act`'s
   tests, not by mocking `act`.

## Teeth

**Runs:** `purity.test.js` keeps `lib/` from importing `useUI`, `platform/`,
or the DOM. `lib/active-workout.test.js` asserts the effect list from `act`.
`store/useStore.act.test.jsx` asserts the runner: a hold finishes through
`send`, and `open-finish` is still on the list for the view.

**Runs:** the guard test `frontend/src/effect-types.test.js`, in `npm test`.
It collects every `effect('<type>')` call in `lib/active-act.js` (the
producer) and every `e.type === '<type>'` branch in `runEffects` and in
`Workout.jsx`'s `send`. A type in the producer with no branch fails. A branch
the producer never builds fails too. `open-finish` is the one type whose branch
is the view. No allowlist: the set is closed at `rest:start`, `rest:stop`,
`hold:start`, `hold:stop`, `sound:set`, `sound:finish`, `notice` and
`open-finish`. A fixture with a made-up producer type must fail, so the parse
cannot rot into always-green. The same file holds the closed set of command
types: the keys of `COMMANDS` in `active-act.js` against the list in
[ADR 0032](./adr/0032-the-active-workout.md). In JavaScript this pair stands in for
`typescript/switch-exhaustiveness-check`, which needs `tsconfig`.

**To add:** a test that `JSON.parse(JSON.stringify(effects))` deep-equals
`effects` for every command, which pins "payloads stay small and plain". A
reviewer, not a tool, checks the other rules here: that a view does not decide
the next set, that `lib/` does not catch a refusal into an empty success, and
that a Manual rest is the only caller of `startRest` outside the runner
(**judgement call, no tooth**).
