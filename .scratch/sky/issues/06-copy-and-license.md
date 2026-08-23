# 06 — Copy rewrite + license notice

**What to build:** Everything the user can read tells the truth about Sky. The About screen describes Sky as a personal fork of openGym and includes the AGPL license attribution. Mentions of self-hosting, GitLab project links, Discord, Buy Me A Coffee, demo notices and upstream feature text that no longer applies (login, sync, admin) are rewritten or removed. No functional changes.

**Blocked by:** 03 — Guest-only static boot (the old copy describes features this fork removes).

**Status:** ready-for-agent

- [ ] About screen accurately describes Sky and its origin as an openGym fork
- [ ] AGPL license notice present and readable in About
- [ ] No user-visible references to login, accounts, server sync, admin dashboard or demo mode remain
- [ ] Upstream promo links (GitLab, Discord, coffee fund) removed or replaced with Sky-appropriate text
- [ ] Grep for upstream branding finds no stale user-facing strings outside license/attribution context
