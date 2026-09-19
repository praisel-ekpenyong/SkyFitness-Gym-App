#!/usr/bin/env node
// Cross-platform exercise media fetch script for Sky (openGym).
// Downloads and extracts 1,324 exercise thumbnails (JPG) and animations (GIF)
// from github.com/hasaneyldrm/exercises-dataset into frontend/public/media/.
//
// Usage:
//   npm run media:fetch
//   node scripts/fetch-media.mjs [path-or-url-or-archive]
//
// Source: hasaneyldrm/exercises-dataset
// Metadata and instruction text: MIT.
// Images and animations: © Gym visual — https://gymvisual.com/
// Used under dataset terms; openGym does not redistribute or relicense them. See NOTICE.md.

import { createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_ARCHIVE_URL =
  'https://github.com/hasaneyldrm/exercises-dataset/archive/7455efae41b330c265e7cd4b78dfa848e7ce5ebd.tar.gz'

export const NOTICE_BANNER = `↓ Downloading exercise media (~140 MB) from github.com/hasaneyldrm/exercises-dataset
  Metadata and instruction text: MIT.
  Images and animations: © Gym visual — https://gymvisual.com/
  Used under that dataset's terms, not openGym's AGPL; openGym does not redistribute them.
  Terms: https://gymvisual.com/content/3-terms-and-conditions-of-use
  Reusing this media yourself, commercially or not, needs your own licence from Gym visual.
  Details in NOTICE.md.`

// Tar Header Offsets & Lengths (POSIX ustar)
const TAR_BLOCK_SIZE = 512
const TAR_NAME_OFFSET = 0
const TAR_NAME_LEN = 100
const TAR_SIZE_OFFSET = 124
const TAR_SIZE_LEN = 12
const TAR_TYPE_OFFSET = 156
const TAR_PREFIX_OFFSET = 345
const TAR_PREFIX_LEN = 155

/**
 * Parses a 512-byte POSIX tar / ustar header block.
 * Returns null if the block is all zeros (EOF indicator) or shorter than 512 bytes.
 */
export function parseTarHeader(block) {
  if (!block || block.length < TAR_BLOCK_SIZE) return null
  let isZero = true
  for (let i = 0; i < TAR_BLOCK_SIZE; i++) {
    if (block[i] !== 0) {
      isZero = false
      break
    }
  }
  if (isZero) return null

  const readString = (start, length) => {
    const slice = block.subarray(start, start + length)
    const nullIdx = slice.indexOf(0)
    const end = nullIdx === -1 ? length : nullIdx
    return slice.subarray(0, end).toString('utf8')
  }

  const name = readString(TAR_NAME_OFFSET, TAR_NAME_LEN)
  const sizeStr = readString(TAR_SIZE_OFFSET, TAR_SIZE_LEN).trim()
  const size = parseInt(sizeStr, 8) || 0
  const typeflag = String.fromCharCode(block[TAR_TYPE_OFFSET] || 48)
  const prefix = readString(TAR_PREFIX_OFFSET, TAR_PREFIX_LEN)
  const fullName = prefix ? `${prefix}/${name}` : name

  return { name, prefix, fullName, size, typeflag }
}

/**
 * Extracts media files (images/*.jpg and videos/*.gif) from an uncompressed tar stream.
 */
export async function extractMediaFromTarStream(readableStream, options = {}) {
  const {
    targetDir = getDefaultMediaDir(),
    onProgress = null,
    dryRun = false,
  } = options

  const imagesDir = join(targetDir, 'images')
  const videosDir = join(targetDir, 'videos')

  if (!dryRun) {
    mkdirSync(imagesDir, { recursive: true })
    mkdirSync(videosDir, { recursive: true })
  }

  let imagesCount = 0
  let videosCount = 0
  let totalBytes = 0

  let buffer = Buffer.alloc(0)

  return new Promise((resolvePromise, rejectPromise) => {
    let streamEnded = false
    let pendingEntry = null

    const processBuffer = () => {
      while (true) {
        if (!pendingEntry) {
          if (buffer.length < TAR_BLOCK_SIZE) {
            break
          }
          const header = parseTarHeader(buffer.subarray(0, TAR_BLOCK_SIZE))
          if (!header) {
            // Null block (EOF block or padding)
            buffer = buffer.subarray(TAR_BLOCK_SIZE)
            continue
          }
          pendingEntry = header
        }

        const { fullName, size, typeflag } = pendingEntry
        const paddedSize = Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE

        if (buffer.length < TAR_BLOCK_SIZE + paddedSize) {
          // Wait for full file payload
          break
        }

        const entryPayload = buffer.subarray(TAR_BLOCK_SIZE, TAR_BLOCK_SIZE + size)
        buffer = buffer.subarray(TAR_BLOCK_SIZE + paddedSize)
        pendingEntry = null

        // Only extract regular files
        if (typeflag === '0' || typeflag === '\0' || typeflag === '') {
          const imgMatch = fullName.match(/(?:^|\/)images\/([^/]+\.jpg)$/i)
          const vidMatch = fullName.match(/(?:^|\/)videos\/([^/]+\.gif)$/i)

          if (imgMatch || vidMatch) {
            const type = imgMatch ? 'image' : 'video'
            const fileName = (imgMatch || vidMatch)[1]
            const destDir = type === 'image' ? imagesDir : videosDir

            if (!dryRun) {
              writeFileSync(join(destDir, fileName), entryPayload)
            }

            if (type === 'image') imagesCount++
            else videosCount++
            totalBytes += size

            if (typeof onProgress === 'function') {
              onProgress({ type, fileName, imagesCount, videosCount, totalBytes })
            }
          }
        }
      }

      if (streamEnded) {
        if (pendingEntry || (buffer.length > 0 && !buffer.every(b => b === 0))) {
          rejectPromise(new Error('Truncated tar archive: stream ended unexpectedly before entry completed.'))
          return
        }
        resolvePromise({ imagesCount, videosCount, totalBytes, targetDir })
      }
    }

    readableStream.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk])
      processBuffer()
    })

    readableStream.on('end', () => {
      streamEnded = true
      processBuffer()
    })

    readableStream.on('error', err => {
      rejectPromise(err)
    })
  })
}

export function getDefaultMediaDir() {
  const scriptsDir = dirname(fileURLToPath(import.meta.url))
  const projectRoot = join(scriptsDir, '..')
  return join(projectRoot, 'frontend', 'public', 'media')
}

/**
 * Downloads and extracts the media archive.
 */
export async function downloadAndExtractMedia(options = {}) {
  const {
    url = DEFAULT_ARCHIVE_URL,
    sourceFile = null,
    targetDir = getDefaultMediaDir(),
    isGzip = !url.endsWith('.tar'),
    fetch = globalThis.fetch,
    onProgress = null,
    dryRun = false,
  } = options

  let rawStream

  if (sourceFile && existsSync(sourceFile)) {
    rawStream = createReadStream(sourceFile)
  } else {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Download failed: HTTP ${res.status} ${res.statusText || ''}`.trim())
    }
    rawStream = Readable.fromWeb(res.body)
  }

  let tarStream = rawStream
  if (isGzip) {
    const gunzip = createGunzip()
    rawStream.on('error', err => gunzip.destroy(err))
    tarStream = rawStream.pipe(gunzip)
  }

  return extractMediaFromTarStream(tarStream, {
    targetDir,
    onProgress,
    dryRun,
  })
}

// CLI entrypoint
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  npm run media:fetch
  node scripts/fetch-media.mjs [path-or-url] [--dry-run] [--dest <dir>]

Options:
  --dry-run      Simulate extraction without writing files to disk
  --dest <dir>   Specify target directory (default: frontend/public/media)
  -h, --help     Show this help message
`)
    process.exit(0)
  }

  const dryRun = args.includes('--dry-run')
  const destIdx = args.indexOf('--dest')
  const targetDir =
    destIdx !== -1 && args[destIdx + 1] ? resolve(args[destIdx + 1]) : getDefaultMediaDir()

  const nonFlagArgs = args.filter((a, idx) => !a.startsWith('-') && (destIdx === -1 || idx !== destIdx + 1))
  const arg = nonFlagArgs[0]

  console.log(NOTICE_BANNER)
  console.log(`Target directory: ${targetDir}${dryRun ? ' (DRY RUN)' : ''}`)
  console.log('Connecting to upstream dataset archive…')

  const startTime = Date.now()
  let lastReport = Date.now()

  try {
    let options = { targetDir, dryRun }
    if (arg && existsSync(arg)) {
      console.log(`Using local file: ${arg}`)
      const isGzip = arg.endsWith('.gz') || arg.endsWith('.tgz')
      options = { ...options, sourceFile: arg, isGzip }
    } else if (arg && (arg.startsWith('http://') || arg.startsWith('https://'))) {
      console.log(`Using custom URL: ${arg}`)
      const isGzip = !arg.endsWith('.tar')
      options = { ...options, url: arg, isGzip }
    }

    const result = await downloadAndExtractMedia({
      ...options,
      onProgress: ({ imagesCount, videosCount }) => {
        const now = Date.now()
        if (now - lastReport > 500) {
          process.stdout.write(`\rExtracting: ${imagesCount} images, ${videosCount} GIFs…`)
          lastReport = now
        }
      },
    })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    process.stdout.write('\r')
    console.log(
      `✓ ${result.imagesCount} images, ${result.videosCount} GIFs ${dryRun ? 'scanned (dry run)' : 'extracted'} to ${result.targetDir} (${(result.totalBytes / (1024 * 1024)).toFixed(1)} MB, ${elapsed}s)`
    )
  } catch (err) {
    console.error(`\n✗ Error fetching media: ${err.message}`)
    process.exit(1)
  }
}
