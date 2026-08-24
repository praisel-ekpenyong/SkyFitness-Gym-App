Type: grilling
Status: open
Blocked by: 01

## Question

The glossary defines **Hit / Miss** as how a session is judged against its target (CONTEXT.md, Judging & progression) — the effort's central judgment term. The code spells it `ok`: `readSession()` returns `{ ..., ok }` (progression.js:129), `stallCount` reads `sessions[i].ok` (progression.js:147), the prescription engine branches on it, and only the tests use the real words ("counts a session where every set made its reps as a hit", progression.test.js:28).

Decide: rename the boolean to something hit-shaped (`hit`, or keep boolean-ness with `isHit`) across readSession/stallCount/all consumers (glossary wins), or accept `ok` as an acceptable boolean spelling and note Hit/Miss in CONTEXT.md as the concept whose implementation is `ok`? Weigh: `ok` is one letter from meaningless in a domain where "a session that fell apart" is precisely not OK; but boolean naming conventions (`is*`) may pull toward `isHit`. Also check whether any UI copy shows hit/miss words today and whether that should change. Record the decision, the CONTEXT.md edit if any, and if glossary wins enumerate every consumer of `.ok` for `.scratch/language/rename-plan.md`.
