---
name: run-sky
description: Launch and drive Sky (the gym tracker PWA) in a real browser to see a UI change working, take screenshots, and run measured checks. Use when asked to run, screenshot, audit or visually review the app.
---

# Run and review Sky

Tools live in `frontend/scripts/review/`. Run everything from `frontend/`. No network or backend is needed.

## Commands

| Need | Command |
|---|---|
| Build, then serve `dist/` with the deploy CSP | `npm run build && npm run review:serve` (leave running) |
| Demo profile JSON (14 weeks of history) | `npm run review:seed` writes `.tmp/review/seed.json` |
| Screenshots | `npm run review:shots -- --vp=phone --scenes=home,workout` (scenes: home empty rest plan stats library settings sheets variants more workout; vp: phone small tablet desktop) |
| Measured checks (overflow, tap size, contrast, clipping, CSP, offline) | `npm run review:audit`, exits 1 on findings |
| Service worker and offline routes | `npm run review:offline` |
| Visible window on a dev server | `npm run review:open -- --base=http://localhost:5173/` (needs a display) |
| Side-by-side sheet | `python3 scripts/review/sheet.py out.png a.png b.png` (Pillow) |

Output goes to `frontend/.tmp/review/` (gitignored).

## Configuration

Env vars or the same names as `--flags`: `SKY_REVIEW_PORT` (5198), `SKY_REVIEW_BASE`, `SKY_REVIEW_TODAY` (2026-11-09), `SKY_REVIEW_OUT`, `SKY_REVIEW_PROFILE`, `SKY_BROWSER` (else chromium/chrome on PATH). History is seeded relative to the chosen today and the page clock is frozen to it at 10:12 UTC (timezone UTC), so runs are reproducible.

## Gotchas

- Seed before the first load. The app saves an empty profile if it boots with nothing in `localStorage`. The tools use a context init script (`seedStorage` in `lib.mjs`); do the same in anything new, never evaluate after load.
- Playwright needs `viewport: {}` (or `viewport: null` on a persistent context) to use a real window size; otherwise it forces 1280x720.
- Never `pkill -f`: it matches its own command line. Stop servers by port: `fuser -k 5198/tcp`.
- Two dev servers must not share `node_modules/.vite`. Give the second a different cache dir (`--cacheDir`) or serve a build instead.
- Do not touch ports 5173 or 5174 unless they are yours; they are usually someone's live dev servers.
- The service worker only exists in the built app. Dev-server runs use `serviceWorkers: 'block'`; `audit` and `offline` use the real one.
- Offline runs log 503 and ERR_INTERNET_DISCONNECTED for exercise images on the CDN. That is expected.
