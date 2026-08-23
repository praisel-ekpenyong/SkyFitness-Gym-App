# 05 — English only

**What to build:** The app speaks only English. The eleven non-English locale packs are deleted, the translation loader reduces accordingly (no runtime language picker beyond English), and exercise-instruction localization follows suit where it rides on the same machinery. Bundle shrinks; nothing user-visible changes for an English reader.

**Blocked by:** 01 — Git baseline.

**Status:** ready-for-agent

- [ ] Non-English locale files removed from the tree
- [ ] Language selection UI offers English only (or is removed if English becomes the only option)
- [ ] i18n loading path simplified with no dead locale imports
- [ ] All UI strings render correctly in English
- [ ] Full Vitest suite green; production build succeeds
