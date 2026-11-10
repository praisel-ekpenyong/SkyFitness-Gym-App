// Serves frontend/dist with the CSP the deploy sends (frontend/public/_headers). Run `npm run build` first.
// Stop it by port, never `pkill -f`: fuser -k <port>/tcp  (or kill the PID it prints).
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { FRONTEND, config, parseArgs } from './lib.mjs'
const { flags } = parseArgs()
const { port } = config(flags)
const root = join(FRONTEND, flags.dir || 'dist')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' }
// Read from public/_headers (the /* block), never copied, so the review server cannot drift from the deploy.
const headers = readFileSync(join(FRONTEND, 'public', '_headers'), 'utf8')
const CSP = headers.match(/^\s+Content-Security-Policy:\s*(.+)$/m)?.[1].trim()
if (!CSP) throw new Error('No Content-Security-Policy found in public/_headers')
createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(req.url.split('?')[0])); if (p === '/') p = '/index.html'
  if (p.includes('..')) { res.writeHead(400); return res.end() }
  try { const b = await readFile(join(root, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'content-security-policy': CSP }); res.end(b) }
  catch { res.writeHead(404); res.end() }
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}/ (pid ${process.pid})`))
