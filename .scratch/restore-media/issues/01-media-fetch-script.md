# 01 — Cross-platform media download script

**Type:** task
**Status:** resolved

## Question

How should the cross-platform Node download script (`scripts/fetch-media.mjs`, callable via `npm run media:fetch`) download, extract, and place the 1,324 JPG thumbnails and animated GIFs from `hasaneyldrm/exercises-dataset` into `frontend/public/media/` without external OS-specific dependencies (working on Windows, macOS, and Linux out-of-the-box)?

## Answer

Implemented `scripts/fetch-media.mjs` and registered `"media:fetch": "node ../scripts/fetch-media.mjs"` in `frontend/package.json`.

Key aspects:
1. **Pure Node.js standard libraries**: Uses native `fetch`, `node:zlib` (`createGunzip`), `node:stream` (`Readable`), `node:fs` (`createReadStream`, `writeFileSync`, `mkdirSync`), and `node:path`. No external OS tools (`curl`, `tar`, `git`, `bash`) required, working cross-platform on Windows, macOS, and Linux.
2. **Stream extraction**: Streams the pinned upstream tarball (`https://github.com/hasaneyldrm/exercises-dataset/archive/7455efae41b330c265e7cd4b78dfa848e7ce5ebd.tar.gz`) directly through gunzip into a lightweight POSIX tar block parser.
3. **Target layout**:
   - `images/*.jpg` entries extract to `frontend/public/media/images/<filename>.jpg` (1,324 images).
   - `videos/*.gif` entries extract to `frontend/public/media/videos/<filename>.gif` (1,324 GIFs).
   - Other entries (`data/`, `README.md`, `NOTICE.md`) are ignored during extraction.
4. **CLI & Module support**:
   - Accepts positional archive/URL arguments, `--dry-run`, and `--dest <dir>` flags.
   - Exports `parseTarHeader`, `extractMediaFromTarStream`, and `downloadAndExtractMedia` for programmatic use and unit testing.
   - Covered by 6 unit tests in `frontend/src/lib/fetch-media.test.js`.

