Type: grilling
Status: open
Blocked by: 01

## Question

The glossary defines **Target** — what was prescribed for an exercise before training — with an explicit avoid-list: "_Avoid_: config, plan (for a single exercise)" (CONTEXT.md, Logging a session). The persisted field honors this: `entry.target` everywhere (`finish-workout.js:9`, `progression.js:103`). But the in-memory parameter name is `cfg` on nearly every function that receives it: `modeOf(cfg)`, `policyFor(cfg, routine, mode)`, `nextPrescription(S, cfg, routine)` (history.js:28, progression.js:70/161), `defaultConfig(id, mode)`, `freestyleConfig(S, cfg)` (history.js:125/224), and every call site in Workout.jsx passes `...(entry.target || {})` into something called `cfg`.

Decide: does `cfg` get renamed to `target` (glossary wins this one), or is `cfg` a legitimate distinct term (e.g., "the config shape of a target" or a routine-entry config that is not yet a prescription) deserving a glossary entry? Weigh: rename blast radius (signatures across lib + views + tests, all pure functions), reader cost of two names for one object, whether `cfg` ever means something Target does not. If code wins, CONTEXT.md gains the term; if glossary wins, enumerate every signature, call site, and test fixture to rename for `.scratch/language/rename-plan.md`.
