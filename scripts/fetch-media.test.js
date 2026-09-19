import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Readable } from 'node:stream'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseTarHeader,
  extractMediaFromTarStream,
  downloadAndExtractMedia,
} from './fetch-media.mjs'

// Helper to create a minimal 512-byte POSIX ustar header block for testing
function buildTarHeader(name, size, typeflag = '0', prefix = '') {
  const buf = Buffer.alloc(512, 0)
  buf.write(name, 0, 100, 'utf8')
  buf.write('0000644\0', 100, 8, 'utf8') // mode
  buf.write('0001750\0', 108, 8, 'utf8') // uid
  buf.write('0001750\0', 116, 8, 'utf8') // gid
  buf.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'utf8') // size
  buf.write('14000000000\0', 136, 12, 'utf8') // mtime
  buf.write('        ', 148, 8, 'utf8') // checksum placeholder
  buf.write(typeflag, 156, 1, 'utf8')
  buf.write('ustar\0', 257, 6, 'utf8')
  buf.write('00', 263, 2, 'utf8')
  if (prefix) {
    buf.write(prefix, 345, 155, 'utf8')
  }

  // Calculate simple tar checksum
  let sum = 0
  for (let i = 0; i < 512; i++) {
    sum += buf[i]
  }
  buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf8')
  return buf
}

function buildTarArchive(entries) {
  const chunks = []
  for (const { name, content, prefix = '', typeflag = '0' } of entries) {
    const dataBuf = Buffer.isBuffer(content) ? content : Buffer.from(content || '')
    const header = buildTarHeader(name, dataBuf.length, typeflag, prefix)
    chunks.push(header)
    if (dataBuf.length > 0) {
      chunks.push(dataBuf)
      const padding = (512 - (dataBuf.length % 512)) % 512
      if (padding > 0) {
        chunks.push(Buffer.alloc(padding, 0))
      }
    }
  }
  // 2 blocks of 512 zero bytes for EOF
  chunks.push(Buffer.alloc(1024, 0))
  return Buffer.concat(chunks)
}

describe('fetch-media script', () => {
  let testDir

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'fetch-media-test-'))
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('parseTarHeader', () => {
    it('parses valid ustar header with name, size and typeflag', () => {
      const header = buildTarHeader('images/0001.jpg', 1234, '0', 'repo-root')
      const parsed = parseTarHeader(header)
      expect(parsed).not.toBeNull()
      expect(parsed.name).toBe('images/0001.jpg')
      expect(parsed.prefix).toBe('repo-root')
      expect(parsed.fullName).toBe('repo-root/images/0001.jpg')
      expect(parsed.size).toBe(1234)
      expect(parsed.typeflag).toBe('0')
    })

    it('returns null for zeroed EOF blocks', () => {
      const empty = Buffer.alloc(512, 0)
      expect(parseTarHeader(empty)).toBeNull()
    })
  })

  describe('extractMediaFromTarStream', () => {
    it('extracts images and videos into their respective target directories and ignores non-media files', async () => {
      const archive = buildTarArchive([
        { prefix: 'exercises-dataset', name: 'images/0001-test.jpg', content: 'fake-jpg-content' },
        { prefix: 'exercises-dataset', name: 'images/0002-test.jpg', content: 'fake-jpg-content-2' },
        { prefix: 'exercises-dataset', name: 'videos/0001-test.gif', content: 'fake-gif-content' },
        { prefix: 'exercises-dataset', name: 'data/exercises.json', content: '{"some":"json"}' },
        { prefix: 'exercises-dataset', name: 'README.md', content: '# Readme' },
      ])

      const stream = Readable.from([archive])
      const progress = []
      const result = await extractMediaFromTarStream(stream, {
        targetDir: testDir,
        onProgress: p => progress.push(p),
      })

      expect(result.imagesCount).toBe(2)
      expect(result.videosCount).toBe(1)

      const imgPath = join(testDir, 'images', '0001-test.jpg')
      const img2Path = join(testDir, 'images', '0002-test.jpg')
      const gifPath = join(testDir, 'videos', '0001-test.gif')
      const jsonPath = join(testDir, 'data', 'exercises.json')

      expect(existsSync(imgPath)).toBe(true)
      expect(readFileSync(imgPath, 'utf8')).toBe('fake-jpg-content')
      expect(existsSync(img2Path)).toBe(true)
      expect(existsSync(gifPath)).toBe(true)
      expect(readFileSync(gifPath, 'utf8')).toBe('fake-gif-content')
      expect(existsSync(jsonPath)).toBe(false)
    })

    it('supports dryRun without creating files on disk', async () => {
      const archive = buildTarArchive([
        { prefix: 'dataset', name: 'images/sample.jpg', content: 'img-data' },
        { prefix: 'dataset', name: 'videos/sample.gif', content: 'gif-data' },
      ])

      const stream = Readable.from([archive])
      const result = await extractMediaFromTarStream(stream, {
        targetDir: testDir,
        dryRun: true,
      })

      expect(result.imagesCount).toBe(1)
      expect(result.videosCount).toBe(1)
      expect(existsSync(join(testDir, 'images', 'sample.jpg'))).toBe(false)
    })

    it('throws error when stream is truncated mid-file', async () => {
      const header = buildTarHeader('images/0001.jpg', 5000)
      const stream = Readable.from([header, Buffer.alloc(100, 1)])

      await expect(
        extractMediaFromTarStream(stream, { targetDir: testDir })
      ).rejects.toThrow(/Truncated tar archive/i)
    })
  })

  describe('downloadAndExtractMedia', () => {
    it('downloads from mock fetch and extracts into targetDir', async () => {
      const archive = buildTarArchive([
        { prefix: 'dataset', name: 'images/0003-test.jpg', content: 'img-bytes' },
        { prefix: 'dataset', name: 'videos/0003-test.gif', content: 'gif-bytes' },
      ])

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        body: Readable.toWeb(Readable.from([archive])),
      })

      const result = await downloadAndExtractMedia({
        url: 'https://example.com/media.tar',
        isGzip: false,
        targetDir: testDir,
        fetch: mockFetch,
      })

      expect(result.imagesCount).toBe(1)
      expect(result.videosCount).toBe(1)
      expect(existsSync(join(testDir, 'images', '0003-test.jpg'))).toBe(true)
      expect(existsSync(join(testDir, 'videos', '0003-test.gif'))).toBe(true)
    })

    it('throws when fetch fails with non-ok status', async () => {
      const mockFetch = async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      await expect(
        downloadAndExtractMedia({
          url: 'https://example.com/media.tar.gz',
          targetDir: testDir,
          fetch: mockFetch,
        })
      ).rejects.toThrow(/Download failed: HTTP 404/)
    })
  })
})
