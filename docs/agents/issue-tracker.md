# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

Paths in this file are relative to the git repository root (`SkyFitness-Iron/` when the workspace root is the parent folder).

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- While an implementation ticket is open, its `Status:` line is a triage role from `triage-labels.md`. A ticket becomes `resolved` only once its merge commit is on `main`: set `Status: resolved` and write a comment naming that merge commit. `resolved` and `wontfix` are final: no further triage or implementation
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## The tracker is its own git repo

`.scratch/` is ignored by the Sky repo and versioned as its own git repo, in the Desktop checkout only (it is not in worktrees; read and edit it there by absolute path). After editing a ticket or spec, commit it there: `git -C <checkout>/.scratch add -A && git -C <checkout>/.scratch commit -m "<what changed>"`. It stays local: no remote, no push.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.
