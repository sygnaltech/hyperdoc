#!/usr/bin/env node
/**
 * Scaffold a new .hd document in the CURRENT (version 2 / Markdown-primary)
 * format. This is the ONLY correct way to create a new .hd file: it guarantees
 * `version: 2` in the frontmatter so the doc can never be misread as legacy v1.
 * Never hand-author the frontmatter — always go through this script.
 *
 *   node new-doc.mjs <path.hd> [--title "Title"] [--id] [--force]
 *
 *   node new-doc.mjs docs/guide.hd
 *   node new-doc.mjs docs/guide.hd --title "Getting Started"
 *   node new-doc.mjs docs/hero.hd --title "Hero" --id   # also mints an id
 *
 * Flags:
 *   --title "…"  Title frontmatter + H1 stub. Defaults to the file's basename.
 *   --id         Generate a 22-char base62 id (required only when the doc will
 *                hold media; omit otherwise). Matches new-id.mjs / the editor.
 *   --force      Overwrite an existing file. Refuses by default.
 *
 * Prints the path it wrote.
 */
import { randomBytes } from 'node:crypto'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, basename, extname, resolve } from 'node:path'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

function generateId() {
  const bytes = randomBytes(16)
  let big = 0n
  for (const b of bytes) big = (big << 8n) | BigInt(b)
  let out = ''
  while (big > 0n) {
    out = ALPHABET[Number(big % 62n)] + out
    big = big / 62n
  }
  while (out.length < 22) out = ALPHABET[0] + out
  return out
}

// --- parse args ---------------------------------------------------------
const argv = process.argv.slice(2)
let target = null
let title = null
let wantId = false
let force = false
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--title') title = argv[++i] ?? null
  else if (a === '--id') wantId = true
  else if (a === '--force') force = true
  else if (!target) target = a
  else {
    console.error(`Unexpected argument: ${a}`)
    process.exit(2)
  }
}

if (!target) {
  console.error('Usage: node new-doc.mjs <path.hd> [--title "…"] [--id] [--force]')
  process.exit(2)
}

const abs = resolve(target)
if (extname(abs).toLowerCase() !== '.hd') {
  // .hd2 is a deprecated alias; steer new content to .hd.
  console.error(`Refusing to create "${basename(abs)}": new documents must use the .hd extension.`)
  process.exit(2)
}
if (existsSync(abs) && !force) {
  console.error(`Refusing to overwrite existing file: ${abs} (pass --force to replace).`)
  process.exit(1)
}

const docTitle = title ?? basename(abs, '.hd')

// ISO date (UTC) without pulling in a formatting lib.
const date = new Date().toISOString().slice(0, 10)

// --- build frontmatter --------------------------------------------------
const fm = ['---']
if (wantId) fm.push(`id: ${generateId()}`)
fm.push(`title: ${JSON.stringify(docTitle)}`)
fm.push('version: 2')
fm.push(`date: ${date}`)
fm.push('---')

const content = `${fm.join('\n')}\n\n# ${docTitle}\n\n`

mkdirSync(dirname(abs), { recursive: true })
writeFileSync(abs, content, 'utf8')
console.log(abs)
