import { readFile, readdir } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import matter from 'gray-matter'

// HD-internal plumbing that must never reach the destination's frontmatter.
// `format-version` is the canonical key; `version` is its pre-rename spelling,
// still dropped so an un-migrated source doesn't leak it downstream.
const HD_FRONTMATTER_DROP = new Set(['id', 'version', 'format-version'])

export async function readHdSources(sourceDir) {
  const entries = await readdir(sourceDir)
  const hdFiles = entries.filter(f => extname(f) === '.hd').sort()
  const sources = []
  for (const file of hdFiles) {
    const full = join(sourceDir, file)
    const raw = await readFile(full, 'utf8')
    const parsed = matter(raw)
    const frontmatter = { ...parsed.data }
    for (const k of HD_FRONTMATTER_DROP) delete frontmatter[k]
    for (const [k, v] of Object.entries(frontmatter)) {
      if (v instanceof Date) {
        frontmatter[k] = v.toISOString().split('T')[0]
      }
    }
    sources.push({
      file,
      slug: basename(file, '.hd'),
      sourcePath: full,
      id: parsed.data.id || null,
      frontmatter,
      body: parsed.content.trim()
    })
  }
  return sources
}
