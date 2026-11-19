import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PORT_BASE = 5200
export const PORT_SPAN = 700 // 5200-5899: clear of 5173/5174 (live dev servers) and the old fixed 5198

// Stable per checkout: the same frontend path always gives the same port, and two worktrees almost never share one.
export function defaultPort(frontendDir) {
  const n = createHash('sha1').update(frontendDir).digest().readUInt32BE(0)
  return PORT_BASE + (n % PORT_SPAN)
}

// `node scripts/review/port.mjs` prints this worktree's port, for `fuser -k "$(npm run -s review:port)"/tcp`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  console.log(process.env.SKY_REVIEW_PORT || defaultPort(frontend))
}
