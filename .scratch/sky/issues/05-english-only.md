# 05 — English only

**What to build:** The app speaks only English. The eleven non-English locale packs are deleted, the translation loader reduces accordingly (no runtime language picker beyond English), and exercise-instruction localization follows suit where it rides on the same machinery. Bundle shrinks; nothing user-visible changes for an English reader.

**Blocked by:** 01 — Git baseline.

**Status:** ready-for-agent

- [x] Non-English locale files removed from the tree
- [x] Language selection UI offers English only (or is removed if English becomes the only option)
- [x] i18n loading path simplified with no dead locale imports
- [x] All UI strings render correctly in English
- [x] Full Vitest suite green; production build succeeds

## Comments

**2026-08-24 — implemented.**

- **Deleted**: `src/locales/` (11 packs, ~440 KB) and `src/instr/` (9 instruction packs, ~7.3 MB), plus their now-meaningless guards `scripts/check-locales.mjs` and `scripts/check-source-strings.mjs`. Both directories are gone from the tree.
- **Loader** (`lib/i18n.js`): `import.meta.glob` pack loading gone; `setLang()` is an async no-op kept for App.jsx's boot call — first call notifies the shell once, later calls early-return. `lib/i18n-core.js`: `LANGS`/`INSTR_LANGS`/`DATE_LOCALES`/`getLang` deleted; `dateLocale()` returns `'en-GB'`; `_setLangState()` takes no args and always lands on English. The `t()` indirection stays per ADR 0003 so a future language remains a one-file change.
- **UI**: Settings language picker removed (`SelectRow` + its import-subtitle copy); General section keeps Weight unit only. Exercise-detail "· instructions in English" badge dropped — instructions always come from the catalogue's English `st` via `instrFor()`, so the qualifier was meaningless. `<html lang>` pinned to `'en'` in App.jsx.
- **Store**: dead `DEF.lang: 'en'` key removed (nothing reads `S.lang` anymore); legacy profiles carrying one keep it harmlessly in storage.
- **CI/docs residue**: `.github/workflows/test.yml` no longer runs the two deleted check scripts; `docs/architecture.md` i18n section rewritten for English-only, `lang` dropped from the settings table, stale 11-pack testing note removed.
- **Test**: `Workout.remove.test.jsx`'s 11-pack coverage test replaced with an equivalent that pins the five remove-flow strings to `Workout.jsx` itself (quote-style agnostic raw-source match).
- **Verification**: Vitest 322/322 across 21 files; `vite build` succeeds with zero locale/instr chunks in `dist/`; grep of `frontend/src` finds no `LANGS`/`INSTR_LANGS`/`getLang`/`locales/`/`instr/` references. Two-axis review (standards/spec) findings all addressed.
