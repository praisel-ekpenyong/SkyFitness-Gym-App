// Writes the demo profile to a JSON file: node seed.mjs [--today=YYYY-MM-DD] [--theme=dark|light] [--out=file.json]
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { buildSeed, config, parseArgs } from './lib.mjs'
const { flags, rest } = parseArgs()
const cfg = config(flags)
const file = flags.file || rest[0] || join(cfg.out, 'seed.json')
const s = buildSeed({ today: cfg.today, theme: flags.theme || 'dark' })
mkdirSync(dirname(file), { recursive: true })
writeFileSync(file, JSON.stringify(s))
console.log(`${file}: ${s.workouts.length} workouts, ${s.bodyweight.length} weigh-ins, today ${cfg.today}`)
