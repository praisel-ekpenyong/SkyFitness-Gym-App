# 03 — PWA, build, and Git integration

**Type:** task
**Status:** open
**Blocked by:** 02

## Question

How should `.gitignore`, `vite.config.js`, and package scripts (`npm run build`, `npm run dev`) be configured so that `frontend/public/media/` is excluded from git commits, properly bundled into production `dist/` builds when present, and safely handled without breaking PWA precaching asset size limits?
