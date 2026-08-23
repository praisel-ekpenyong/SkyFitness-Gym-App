# 04 — Durable storage + backup nag

**What to build:** Training data survives aggressive storage cleanup. Every state save writes to both localStorage and IndexedDB; boot loads whichever copy has the newer timestamp, falling back to empty defaults when neither exists. Clearing localStorage alone no longer loses history. Settings gains a gentle reminder that appears when no JSON export has been taken within a recent window, driven off the timestamp of the last successful export. The two decision points — which stored copy wins at boot, and whether the backup reminder is due — are pure functions tested with plain in-memory fakes; the IO shell around them stays thin and untested.

**Blocked by:** 03 — Guest-only static boot.

**Status:** ready-for-agent

- [ ] Every save lands in both storages (verifiable via devtools on the built app)
- [ ] With localStorage cleared but IndexedDB intact, boot restores full history
- [ ] Newest-timestamp-wins decided by a pure function covered by tests using in-memory fakes
- [ ] Backup reminder fires only when last export exceeds the threshold, pure function covered likewise
- [ ] Reminder disappears after taking a fresh export
- [ ] Full Vitest suite green
