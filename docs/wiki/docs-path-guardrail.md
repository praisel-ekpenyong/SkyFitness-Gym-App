# Docs Path Guardrail

Related: [Wiki Index](index.md) · [Local Dates and Timezones](local-dates-and-timezones.md) · [PR and Worktree Discipline](pr-and-worktree-discipline.md) · [CODING_STANDARDS.md](../../CODING_STANDARDS.md)

## Enforcement Mechanism

As of `praisel-ekpenyong/SkyFitness-Gym-App@8de9fcb` (2026-11-24), [docs.test.js](../../frontend/src/docs.test.js) and [docs-paths.js](../../frontend/src/docs-paths.js) guarded markdown documentation across the repository:

1. **Scanned files (`docs.test.js`):** Collected all tracked markdown files via `git ls-files *.md` from the repository root, excluding `.taste-skill/` entries and `CHANGELOG.md`. Untracked files were not scanned until added to the Git index. (`docs.test.js` also checked [docs/adr/](../adr/README.md) filenames for `NNNN-slug.md` formatting and unique four-digit prefixes.)
2. **Fenced code exclusion (`proseLines` in `docs-paths.js`):** Ignored lines inside ```` ``` ```` or `~~~` fenced code blocks so sample commands, diffs, and negative examples were never parsed as live path references. Note that inline backticks on prose lines were still scanned by the link and path regexes at `8de9fcb`.
3. **Link extraction (`extractRefs` in `docs-paths.js`):**
   - **Relative markdown links** matching `/\]\(([^)\s]+)\)/g`: stripped any `#anchor` fragment, skipped URI schemes (`https://`, etc.) and `/`-leading paths, URI-decoded the target, and checked existence relative to the directory of the containing markdown file (`resolve(fileDir, target)`).
   - **Backticked repo paths** matching `` /`([^`\s]+)`/g ``: stripped trailing punctuation (`[.,:;]+`) and `#anchor` fragments, skipped strings containing placeholder/glob characters (`[*<>{}$]`), and required every token matching the repo prefix regex to exist at its mapped root:

```text
Prefix checked                     Candidate roots tested
---------------------------------  -------------------------------------
lib/... or platform/...            frontend/src/<target>
src/...                            frontend/<target>
frontend/..., docs/..., scripts/,  <repo-root>/<target> or
  or .claude/...                     <repo-root>/frontend/<target>
```

4. **Bidirectional allowlists (`docs.test.js`):** As of `praisel-ekpenyong/SkyFitness-Gym-App@8de9fcb`, `docs.test.js` maintained three exception sets: `ALLOW` (gitignored build/media paths), `HISTORICAL` (unchanged paths in older ADRs), and `PLANNED` (checks named in [CODING_STANDARDS.md](../../CODING_STANDARDS.md), [docs/DRAFT_GUARD.md](../DRAFT_GUARD.md), [docs/EFFECT_STANDARDS.md](../EFFECT_STANDARDS.md), [docs/TESTING_STANDARDS.md](../TESTING_STANDARDS.md), [ADR 0034](../adr/0034-oxlint-and-eslint-with-per-tool-ratchets.md), and [ADR 0035](../adr/0035-typescript-starts-as-checkjs-with-an-error-baseline.md) prior to landing). The test failed both on any unexcused missing path and on any stale entry in `HISTORICAL` or `PLANNED` that no longer broke.

## Authoring Rules for `docs/wiki/`

To avoid breaking `docs.test.js` when editing `docs/wiki/` (as verified against `praisel-ekpenyong/SkyFitness-Gym-App@8de9fcb` on 2026-11-24):

- **Only cite paths that exist on the target branch commit:** Outside fenced code blocks, as enforced by `docs-paths.js` at `8de9fcb`, never backtick paths with a checked prefix (`frontend/`, `src/`, `lib/`, `platform/`, `docs/`, `scripts/`, `.claude/`) if the file lives only on another unmerged branch or in a future ticket.
- **Use relative links from `docs/wiki/`:** Because `docs-paths.js` at `8de9fcb` resolved markdown links relative to `fileDir`, link sibling pages directly, ADRs via `../adr/`, and root documents via `../../` rather than repo-root paths:

```markdown
Good (inside docs/wiki/): [Wiki Index](index.md), [ADR 0034](../adr/0034-oxlint-and-eslint-with-per-tool-ratchets.md), [AGENTS.md](../../AGENTS.md)
Bad  (inside docs/wiki/): [Wiki Index](docs/wiki/index.md)
```

- **Keep hypothetical or illustrative path examples and inline link syntax inside fenced code blocks:** `proseLines` at `8de9fcb` ignored fenced blocks (whereas inline code spans on prose lines were still matched by `extractRefs`), so negative examples belong in fenced blocks:

```markdown
Bad link: [y](gone.md)
Bad path: `lib/gone.js`
```

- **Stage new wiki files before running `docs.test.js`:** Because `docs.test.js` at `8de9fcb` discovered files with `git ls-files *.md`, run `git add docs/wiki/` before running `npm test -- src/docs.test.js` in `frontend/` so newly created pages are included in the check.
