import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const SRC_DIRS = 'lib|platform|views|sheets|components|store|styles'
const PREFIXES = new RegExp(`^(frontend|src|docs|scripts|\\.claude|${SRC_DIRS})/`)
const IN_SRC = new RegExp(`^(${SRC_DIRS})/`)

export function proseLines(text) {
  let fence = null
  const out = []
  text.split('\n').forEach((line, i) => {
    const m = line.match(/^\s*(`{3,}|~{3,})/)
    if (m) {
      if (!fence) fence = m[1][0]
      else if (m[1][0] === fence) fence = null
      return
    }
    if (!fence) out.push([i + 1, line])
  })
  return out
}

export function extractRefs(line) {
  const refs = []
  for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
    const t = m[1].split('#')[0]
    if (t && !/^[a-z][a-z0-9+.-]*:/i.test(t) && !t.startsWith('/')) refs.push({ kind: 'link', target: decodeURI(t) })
  }
  for (const m of line.matchAll(/`([^`\s]+)`/g)) {
    const t = m[1].replace(/[.,:;]+$/, '').split('#')[0].replace(/:\d+(-\d+)?$/, '')
    if (PREFIXES.test(t) && !/[*<>{}$]/.test(t)) refs.push({ kind: 'path', target: t })
  }
  return refs
}

function candidates(ref, fileDir, root) {
  if (ref.kind === 'link') return [resolve(fileDir, ref.target)]
  const t = ref.target
  if (IN_SRC.test(t)) return [resolve(root, 'frontend/src', t)]
  if (t.startsWith('src/')) return [resolve(root, 'frontend', t)]
  return [resolve(root, t), resolve(root, 'frontend', t)]
}

export function findBrokenRefs(files, root, allow = []) {
  const broken = []
  for (const file of files) {
    const rel = file.slice(root.length + 1)
    for (const [n, line] of proseLines(readFileSync(file, 'utf8'))) {
      for (const ref of extractRefs(line)) {
        if (allow.includes(ref.target)) continue
        if (!candidates(ref, dirname(file), root).some(existsSync)) broken.push(`${rel}:${n}: ${ref.target}`)
      }
    }
  }
  return broken
}
