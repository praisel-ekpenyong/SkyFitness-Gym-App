import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PORT_BASE = 5200
export const PORT_SPAN = 700

export function defaultPort(frontendDir) {
  const n = createHash('sha1').update(frontendDir).digest().readUInt32BE(0)
  return PORT_BASE + (n % PORT_SPAN)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  console.log(process.env.SKY_REVIEW_PORT || defaultPort(frontend))
}
