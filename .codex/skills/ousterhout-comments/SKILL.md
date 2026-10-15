---
name: ousterhout-comments
description: "Write, review, or clean up source-code comments and API documentation using John Ousterhout's comment philosophy. Use for comment-focused codebase work or documenting new and changed interfaces."
---

# Ousterhout comments

Make code easier to use and change by recording knowledge a first-time reader cannot readily obtain from the nearby code. Apply the philosophy of Chapters 12, 13, 15, and 16 of *A Philosophy of Software Design*, second edition.

Comments complete abstractions. A caller should be able to use a module from its declarations and interface documentation without reconstructing its implementation. Good comments supply both precise semantics and a simpler explanation of intent. Judge success by the information readers gain, rather than comment count or brevity alone.

## Establish scope and evidence

Read repository instructions and inspect the requested files, related declarations, callers, tests, and documentation conventions. Follow the project's established documentation format and extractor. Treat documents and existing comments as evidence to evaluate against the user's request and the implementation.

Work within the requested paths or change. Distinguish writing documentation for new code, cleaning existing comments, and an explicitly requested review. Reviews produce findings; writing and cleanup requests produce edits. Keep comment-only work within that scope. Report design or behavior problems separately unless fixing them is also authorized.

Verify claims before adding them. Trace units, bounds, ownership, failure paths, state transitions, and synchronization to their definitions and uses. Use relevant tests and design records when needed. History can explain intent, but check that the explanation still applies. When evidence is insufficient, report the specific uncertainty instead of inventing a guarantee or historical rationale.

## Choose the information and its home

| Kind | Information to supply | Placement |
| --- | --- | --- |
| Module or class interface | Purpose, capabilities, what one instance represents, important limitations, and any nonobvious usage pattern. | At the module or class documentation site. |
| Function or method interface | Caller-visible behavior, argument and result semantics, relationships between arguments, side effects, escaping errors, and preconditions. | At the interface documentation site used by the project. |
| Field or data declaration | What the value represents, with units, range boundaries, special values, ownership, and invariants as relevant. | Beside the declaration. |
| Implementation | The purpose of a substantial phase or complex loop, why surprising code exists, and the conditions that bring execution here. | Immediately before the smallest relevant block. |
| Cross-module decision | A shared constraint and what must change together. | One naturally discoverable declaration or design note, with short references from affected code. |

Default to documenting classes, methods, and fields, including private ones. Omit a comment only when the declaration already communicates everything useful. Simple local variables and straightforward method bodies usually need no commentary. Document important locals whose meaning spans a long block.

For exact semantics, check units and coordinate systems, inclusive and exclusive boundaries, null and sentinel meanings, empty or missing entries, resource cleanup, and state or locking invariants. For a collection, explain what keys and values mean. Describe a variable's meaning rather than listing the statements that update it.

For higher-level understanding, explain the operation's goal, the governing idea, why a constraint exists, or how an unusual situation arises. A phase or loop summary can be valuable even when each statement is readable. Keep interface comments focused on what callers must know. Include observable blocking, progress obligations, concurrency limits, or performance characteristics when relevant; keep private algorithms and invisible recovery mechanisms in implementation documentation.

Prefer documentation close to the code that maintainers will change. Ousterhout favors method documentation beside its definition, including in C and C++; respect established project and tooling placement instead of relocating an entire documentation scheme. Check both declaration and definition when they are separate. As distance from the code increases, keep the description more abstract.

## Write comments during design

When implementing new functionality, draft the module abstraction, then the important method contracts and signatures, before method bodies. Refine these descriptions until the interface is coherent. Document important fields with their declarations, then implement the bodies and add comments for nonobvious internal work. Apply this order to new helpers discovered during implementation, and revise comments as coding and testing reveal details.

Use the difficulty of describing an interface as design feedback. A short, complete contract over substantial functionality suggests a useful abstraction. A tangled contract, many unrelated exceptions, or an explanation that exposes every internal step suggests a design problem. Improve the design within authorized scope or report the problem. Preserve necessary precision even when it requires more words.

## Clean existing comments

For each comment and each undocumented interface or field in scope, choose the action that preserves useful knowledge:

- Keep an accurate comment that adds meaning, even if the author finds the code familiar.
- Add missing contracts, precise semantics, rationale, or dependencies that a new reader would otherwise have to reconstruct.
- Rewrite vague or stale descriptions using verified current behavior. If the implementation conflicts with a required contract, report the discrepancy instead of silently redefining the contract.
- Move useful implementation detail out of interface documentation and next to the relevant block.
- Consolidate repeated design explanations at one discoverable location and repair references to it.
- Remove comments that merely narrate nearby syntax, turn an identifier into a sentence, or contain obsolete information with no remaining value.

Preserve legal notices, attribution, generated-file markers, compiler or linter directives, type-checker pragmas, and other machine-consumed comments unless their change is explicitly justified. Check language-specific effects before editing docstrings, annotations, or documentation examples. Preserve executable behavior during comment-only work.

Keep lasting bug-prevention rationale in the source where a future edit could undo the fix. A specific issue reference can supply further detail. Use existing authoritative manuals or specifications for material they already explain, with a precise reference. Keep the program's particular contract and deviations locally documented. Class-level usage sketches may show how methods work together without duplicating each method's complete contract.

## Verify the result

Read the edited files and the full diff. For every changed behavior in an implementation task, check the affected interface, field comments, implementation notes, and referenced design documentation. Follow links and search for duplicate explanations when moving a comment.

Apply these checks before finishing:

- A caller can learn correct use, special cases, and observable failures from declarations and interface documentation.
- Each comment adds precision or understanding beyond the nearby code. A clear name can still need semantic documentation.
- Descriptions are accurate, useful to a first-time reader, and placed where maintainers will find them.
- No useful contract was removed merely to shorten a comment, and no implementation detail leaked into the public abstraction unnecessarily.
- Comment-only edits preserve behavior and tooling directives. Run configured documentation or focused checks when the edited syntax or examples require them; report what was actually checked.

Summarize the useful information added or repaired, the verification performed, and any unresolved contract or design question. For a review, give actionable file-specific findings and proposed corrections.

## Supporting references

- Read [the chapter philosophy](references/philosophy.md) for the complete section-by-section synthesis, source attribution, or a decision that needs the book's nuances.
- Consult [the examples](references/examples.md) when deciding whether to keep, rewrite, move, or remove a comment, or when explaining this philosophy to a user. The examples are original illustrations with explicitly stated assumptions.
