Type: grilling
Status: resolved
Blocked by: 01

## Question

The glossary defines **Set** with "_Avoid_: row" (CONTEXT.md, Logging a session), and **Warm-up set** as the term. Yet the code's canonical helpers are spelled `row`: `isWarmupRow(set)`, `insertWarmupRow(rows, mode, target)`, `removeRowAt(rows, i)` (workout-model.js:21, history.js:352/367), plus `cascadeWeight(rows, ...)` and local `rows` arrays throughout. The persisted data has no row/set distinction — sets are just `entry.sets[]` — so this is purely identifier-level drift.

Decide: rename the `*Row` helpers to `*Set` (glossary wins), or accept `row` as the UI-metaphor word for one line of the set table and legalize it in CONTEXT.md? Consider that "row" arguably names a *presentation* concept (a line on screen) while Set is the domain object — if so, is the distinction real enough to keep both words, and where exactly does each apply (e.g., `isWarmupRow` receives a set object, not a row)? If glossary wins, enumerate helpers + call sites for `.scratch/language/rename-plan.md`; if code wins, write the Row/Set boundary into CONTEXT.md.

## Answer

Resolved. **Code wins**.
- `Set` is the domain entity representing a logged/performed effort.
- `Row` is the UI presentation concept (a table row on screen).
- Helper functions like `isWarmupRow`, `insertWarmupRow`, and `removeRowAt` operate on table rows in the active workout UI and remain unchanged.
- [CONTEXT.md](file:///c:/Users/USER/Desktop/Work/Projects/opengym-main/opengym-main/CONTEXT.md) updated under **Set** to define the Row/Set boundary.
