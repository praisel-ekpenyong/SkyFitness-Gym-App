# 04 — Durable storage + backup nag

**What to build:** Training data survives aggressive storage cleanup. Every state save writes to both localStorage and IndexedDB; boot loads whichever copy has the newer timestamp, falling back to empty defaults when neither exists. Clearing localStorage alone no longer loses history. Settings gains a gentle reminder that appears when no JSON export has been taken within a recent window, driven off the timestamp of the last successful export. The two decision points — which stored copy wins at boot, and whether the backup reminder is due — are pure functions tested with plain in-memory fakes; the IO shell around them stays thin and untested.

**Blocked by:** 03 — Guest-only static boot.

**Status:** ready-for-agent

- [x] Every save lands in both storages (verifiable via devtools on the built app)
- [x] With localStorage cleared but IndexedDB intact, boot restores full history
- [x] Newest-timestamp-wins decided by a pure function covered by tests using in-memory fakes
- [x] Backup reminder fires only when last export exceeds the threshold, pure function covered likewise
- [x] Reminder disappears after taking a fresh export
- [x] Full Vitest suite green

## Comments

**2026-08-24 — implemented.** Frontend-only; `Status:` left as-is per house convention.

- **New module** (`lib/storage.js`): thin IndexedDB IO shell (`idbLoad`/`idbSave`, db `sky-state`) around two pure decisions — `pickNewest(local, mirror)` (newest `_ts` wins; tie keeps localStorage's copy since it's already running; missing timestamp counts as no copy) and `backupDue(lastExportTs, now)` (due only past a 14-day threshold, exported as `BACKUP_NAG_MS`). Both tested red-first in `lib/storage.test.js` (11 tests) with plain data — no IDB fakes needed.
- **Store** (`store/useStore.js`): every `persist()` now mirrors into IndexedDB on an 800 ms debounce (web twin of the mobile file-mirror debounce), flushed immediately if the tab hides mid-debounce. Web `boot()` races localStorage vs the mirror through `pickNewest`; no winner means empty defaults stand; first boot with existing history seeds the mirror so pre-feature data is protected too.
- **Backup nag**: `S.lastExport` (in `DEF`) stamped by Settings' export action only after success (share-sheet path stamps inside the try). A "Time for a backup?" row appears under *Your data* only when there's history worth saving and the stamp has gone stale; tapping it exports and the row clears itself.
- **Review fixes applied**: storage key defined once (`LOCAL_KEY` exported from lib/storage.js); unstamped-mirror corner of `pickNewest` hardened; nag constant pinned by test; `lastExport` documented in `DEF`. Two-axis code review found no hard standard breaches and no blocking spec gaps; remaining notes (debounce window means a hard process kill can leave IDB one save behind; web download can't detect failure so the stamp is really "last attempted export") accepted as browser-inherent.
- **Verification**: full Vitest suite 322/322 across 21 files (311 pre-existing untouched); `npm run build` succeeds.
