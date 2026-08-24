Type: task
Status: open
Blocked by: 02, 03, 04, 05, 06, 07

## Question

Compile `.scratch/language/rename-plan.md` from the five adjudicated decisions (cfg/target, row/set, rescheduled copy, ok/hit, import merge-vs-replace) plus whatever graduated tickets surfaced along the way. For each accepted rename: exact old → new identifiers/strings, every file:line touch point (signatures, call sites, test fixtures, i18n keys), the CONTEXT.md edits that accompany it, and a safe execution order with the verification gate (`npm test` in `frontend/` after each batch). Decisions that resolved as "code wins" contribute CONTEXT.md amendments instead of renames. The plan must be executable by a fresh session with no access to this map's conversations — precise enough that nothing is re-decided. This ticket completes the destination; when it resolves, the map is done.
