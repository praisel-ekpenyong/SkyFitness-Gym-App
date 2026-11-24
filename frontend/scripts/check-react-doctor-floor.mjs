// The React Doctor score floor (CODING_STANDARDS.md, "React Doctor: a score floor that only rises").
// Runs react-doctor (or reads --report <json>) and compares summary.score against
// react-doctor-floor.json ({ "score": <n> }). Fails below the floor and passes at or above it.
//
//   node scripts/check-react-doctor-floor.mjs [--root <dir>] [--report <path>] [--write]
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REACT_DOCTOR_PKG = 'react-doctor@0.9.23'
const frontend = resolve(import.meta.dirname, '..')

function option(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

function readFloor(root) {
  const floorFile = join(root, 'react-doctor-floor.json')
  if (!existsSync(floorFile)) throw new Error(`Missing floor file: ${floorFile}`)
  const data = JSON.parse(readFileSync(floorFile, 'utf8'))
  if (typeof data?.score !== 'number' || !Number.isFinite(data.score)) {
    throw new Error(`Invalid floor in ${floorFile}: expected { "score": <number> }`)
  }
  return { floorFile, floor: data.score }
}

function runReactDoctor(root) {
  const dir = mkdtempSync(join(tmpdir(), 'react-doctor-'))
  const outFile = join(dir, 'report.json')
  try {
    const r = spawnSync('npx', ['--yes', REACT_DOCTOR_PKG, '--json', '--json-out', outFile, '--blocking', 'none', '.'], {
      cwd: root,
      encoding: 'utf8',
    })
    if (r.error) throw r.error
    if (r.status !== 0 || !existsSync(outFile)) {
      throw new Error(`react-doctor failed (exit ${r.status}):\n${r.stderr || r.stdout}`)
    }
    return JSON.parse(readFileSync(outFile, 'utf8'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function readReport(root, reportPath) {
  if (reportPath) return JSON.parse(readFileSync(resolve(reportPath), 'utf8'))
  return runReactDoctor(root)
}

function main() {
  const root = resolve(option('--root') ?? frontend)
  const { floorFile, floor } = readFloor(root)
  const report = readReport(root, option('--report'))
  const score = report?.summary?.score

  if (typeof score !== 'number' || !Number.isFinite(score)) {
    console.error('React Doctor did not return a numeric score (summary.score is missing or null).')
    process.exit(1)
  }

  if (score < floor) {
    console.error(`React Doctor score ${score} is below the floor ${floor} in react-doctor-floor.json.`)
    process.exit(1)
  }

  if (score > floor && process.argv.includes('--write')) {
    writeFileSync(floorFile, JSON.stringify({ score }, null, 2) + '\n')
    console.log(`React Doctor score: ${score} (raised floor from ${floor} to ${score}).`)
    return
  }

  if (score > floor) {
    console.log(`React Doctor score: ${score} (floor: ${floor}). Raise react-doctor-floor.json to ${score}.`)
    return
  }

  console.log(`React Doctor score: ${score} (floor: ${floor}).`)
}

try {
  main()
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}
