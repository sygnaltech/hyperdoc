#!/usr/bin/env node
/**
 * Safety net for the "version 2 is the default" flip.
 *
 * The editor now treats a .hd/.hd2 file as legacy v1 ONLY when it explicitly
 * declares `version: 1`. Any file WITHOUT a version field opens as current
 * v2/Markdown. That is correct for new docs, but a genuinely-legacy body-only
 * HTML file that was never stamped would now render through the Markdown path.
 *
 * This script finds un-versioned files whose body looks like body-only HTML and
 * stamps them with an explicit `version: 1` so they keep rendering as legacy
 * HTML. Un-versioned files that look like Markdown are left alone (the new
 * default already makes them v2). Files that already declare any version are
 * skipped untouched.
 *
 *   node stamp-legacy-versions.mjs [dir]           # dry run (default: cwd)
 *   node stamp-legacy-versions.mjs [dir] --write   # apply the changes
 *
 * The insertion is minimal: a single `version: 1` line is added to existing
 * frontmatter (or a frontmatter block is prepended) — the rest of the file is
 * left byte-for-byte unchanged.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import matter from 'gray-matter'

const root = process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) ?? '.'
const write = process.argv.includes('--write')

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.hd'])

/** Recursively collect .hd / .hd2 files. */
function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) collect(full, out)
    } else {
      const ext = extname(name).toLowerCase()
      if (ext === '.hd' || ext === '.hd2') out.push(full)
    }
  }
  return out
}

/** Does a body look like body-only HTML rather than Markdown? */
function looksLikeHtml(body) {
  const trimmed = body.trim()
  if (!trimmed) return false
  // First meaningful line starting with a block/inline HTML tag is the tell.
  const firstLine = trimmed.split(/\r?\n/, 1)[0].trim()
  return /^<[a-zA-Z][\w-]*(\s|>|\/)/.test(firstLine)
}

/** Insert a `version: 1` line minimally, preserving the rest of the file. */
function stampV1(raw) {
  if (/^---\r?\n/.test(raw)) {
    // Existing frontmatter block — inject right after the opening fence.
    return raw.replace(/^---(\r?\n)/, `---$1version: 1$1`)
  }
  // No frontmatter — prepend a minimal block.
  return `---\nversion: 1\n---\n\n${raw}`
}

const files = collect(root)
let stamped = 0
let skippedVersioned = 0
let skippedMarkdown = 0

for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  let parsed
  try {
    parsed = matter(raw)
  } catch {
    console.warn(`! skip (unparseable frontmatter): ${file}`)
    continue
  }
  if (parsed.data && parsed.data.version != null) {
    skippedVersioned++
    continue
  }
  if (!looksLikeHtml(parsed.content)) {
    skippedMarkdown++
    continue
  }
  stamped++
  console.log(`${write ? 'stamp' : 'would stamp'} version: 1  →  ${file}`)
  if (write) writeFileSync(file, stampV1(raw), 'utf8')
}

console.log(
  `\n${write ? 'Stamped' : 'Would stamp'} ${stamped} legacy HTML file(s). ` +
    `Skipped ${skippedVersioned} already-versioned, ${skippedMarkdown} Markdown.` +
    (write ? '' : '\nRe-run with --write to apply.')
)
