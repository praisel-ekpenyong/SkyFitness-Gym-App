# Sky wiki

Long-lived notes kept by the chief-of-staff role: decisions, review outcomes,
subsystem knowledge, and process observations. Sources (tickets, subagent
reports, transcripts) are cited, never copied here.

Rules this folder follows: every claim is dated; claims about code cite the
commit they were true at; superseded claims are marked, not erased.

## Subsystems

- [Software design & architecture](software-design.md) — comprehensive architectural breakdown, module depth, mutation seams, domain invariants, and structural trade-offs.
- [Progression streams and Runs](progression-streams.md) — how `src/lib/progression.js` reads history, and its residual open questions.
- [Exercise catalogue search](catalogue-search.md) — matching algorithms, filter evaluation pipeline, secondary attribution, and consumer integration.
- [Stats, recovery, and post-workout distribution](stats-and-recovery.md) — fatigue decay modeling, retained strength, effective set weighting, post-workout distribution, and selector architecture.

## Decisions

- [Decision log](decisions.md) — dated, one-line-per-decision record with pointers to the full context.

## Process

- [Process notes](process.md) — how work actually flows here (worktrees, tracker, hooks), including observed deviations.

## Operations

- [Deployments and hosting](deployment.md) — Netlify edge policies, release verification gates, and deployment history.

## Reviews

- [Review archive](reviews.md) — when each review ran, against what, and where its findings went.

## Related, outside this folder

- `GLOSSARY.md` — domain vocabulary (single source of truth for terms).
- `CODING_STANDARDS.md` — authoritative coding standards and review rules.
- `docs/adr/` — architecture decisions, one file each.
- `docs/agents/*.md` — conventions for agent work (tracker, triage, domain docs).
- `.scratch/` — the local-only issue tracker (gitignored; not in git history).
