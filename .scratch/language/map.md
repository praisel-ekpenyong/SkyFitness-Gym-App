# Wayfinder map — Language repair

Label: wayfinder:map

## Destination

Every audited conflict between `CONTEXT.md`'s ubiquitous language and the code/UI is adjudicated (five language conflicts + the Sky branding), `CONTEXT.md` is corrected wherever the model itself was wrong, and a rename plan precise enough to hand off exists at `.scratch/language/rename-plan.md`. Execution of the renames is NOT part of this map — with one deliberate exception: the Sky rebrand is executed here (ticket 07), per the owner's scoping call.

## Notes

- Domain: single-context gym tracker; the glossary is `CONTEXT.md` at the repo root. Read it before any session here.
- Skills: every working session calls the Skill tool twice — "grilling" and "domain-modeling".
- Tie-breaker: **case-by-case**. There is NO default that glossary wins or code wins; each conflict is weighed fresh on its merits. Exceptions to whatever a ticket decides are argued, not assumed.
- Sequencing: **sky surgery first**. No ticket here starts until the entire `.scratch/sky/` effort (all eight issues) is resolved, to keep diffs clean. This rule is encoded mechanically as ticket 01, which gates everything else.
- Ownership note: ticket 07 supersedes `.scratch/sky/issues/02-sky-branding.md` and absorbs the branding portion of `.scratch/sky/issues/06-copy-and-license.md`; when 07 resolves, those two sky tickets should be closed with a pointer here.
- Refer to tickets by name, never bare number.
- Evidence base: the audit that founded this map graded the project 7.5/10 for ubiquitous language; the five language tickets carry their file:line evidence inline so no session re-researches from scratch.

## Decisions so far

- **01 Gate: Sky surgery complete** — Resolved. All 8 Sky surgery issues in `.scratch/sky/issues/` verified complete. Gate lifted.
- **02 `cfg` vs `target`** — Resolved. Code wins; `target` is the persisted field, `cfg` is the in-memory parameter. CONTEXT.md updated.
- **03 `row` vs `set` helpers** — Resolved. Code wins; `Set` is the domain concept, `Row` is the UI table presentation. CONTEXT.md updated.
- **04 Rescheduled copy vs day override** — Resolved. Code copy wins; "Rescheduled" is lifter-facing copy for day overrides. CONTEXT.md updated.
- **05 `ok` vs `hit`/`miss`** — Resolved. Code wins; `Hit / Miss` is the domain concept, `.ok` is the boolean property on evaluated sessions. CONTEXT.md updated.
- **06 Import merge vs replace** — Resolved. Glossary amended; defined **Restore** (replaces full database on confirmation) vs **Import** (merges plan files, CSV histories). CONTEXT.md updated.
- **07 Sky rebrand execution** — Resolved. Rebranded user-visible strings, PWA manifest, HTML titles, backup/plan export filenames, package metadata, and about/license footers. Verified against test suite and production build.
- **08 Compile rename plan** — Resolved. All language items adjudicated via CONTEXT.md updates; no invasive code renames needed. Effort complete.

## Not yet specified

- Further glossary/code conflicts surfacing while enumerating signatures and call sites during adjudication — expected, since the audit sampled rather than swept. Each new finding graduates into its own ticket (case-by-case applies to it too) rather than silently folding into an existing one.
- How English-string i18n keys constrain copy changes (the `t('rescheduled')` strings ARE the keys) — cannot be pinned until the sky effort's english-only ticket lands and the locale strategy is final.
- Whether the resolutions demand wholly new CONTEXT.md terms (e.g., a canonical name for the object the code passes as `cfg`, if code wins that ticket) — falls out of the individual decisions.

## Out of scope

- Executing the five language renames — the destination is the hand-off-ready plan; the doing happens in later sessions against that plan.
- Rewriting the upstream-facing README and license copy — owned by the sky effort's copy-and-license ticket, not duplicated here.
- Any behavior change to import merging beyond what its ticket DECIDES — if the decision says "make backup restore a distinct concept," implementing it belongs to the hand-off, not this map.
