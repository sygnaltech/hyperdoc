#!/usr/bin/env node
/**
 * Migrate an HD workspace's asset folders from the legacy mirrored layout
 *   <workspace>/.hd/<docDirRel>/<id>/
 * to the flat layout
 *   <workspace>/.hd/<id>/
 *
 * Dry-run by default. Pass --apply to perform moves.
 *
 *   node migrate-assets-flat.mjs <workspace>            # dry-run
 *   node migrate-assets-flat.mjs <workspace> --apply    # do it
 */
import { readdir, stat, rename, readFile, rmdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, basename, relative, resolve } from 'node:path'
import matter from 'gray-matter'

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'out', '.hd'])
const ID_RE = /^[0-9a-zA-Z]{22}$/

function parseArgs(argv) {
  const args = { _: [] }
  for (const a of argv) {
    if (a === '--apply') args.apply = true
    else if (a === '--help' || a === '-h') args.help = true
    else args._.push(a)
  }
  return args
}

function printHelp() {
  console.log(`migrate-assets-flat — flatten an HD workspace's .hd/ asset layout

Usage:
  node migrate-assets-flat.mjs <workspace> [--apply]

Without --apply, this is a dry run and reports what would happen.
Discovery rules:
  • workspace = directory containing a top-level .hd/ folder
  • doc       = any .hd file in the workspace (recursive); must have a 22-char base62 id in frontmatter
  • asset id  = any leaf folder under .hd/ whose name matches the id regex

Outcomes per id:
  • already-flat   — folder is already at .hd/<id>/, nothing to do
  • will-move      — folder is at .hd/<docDirRel>/<id>/, will move to .hd/<id>/
  • collision      — flat AND mirrored exist; aborted, manual review required
  • orphan         — id folder present but no doc references it; left alone
  • doc-missing-id — a .hd file has no id; left alone
`)
}

async function walkHdFiles(dir, root, out) {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) }
  catch { return }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.hd') {
      if (SKIP_DIRS.has(e.name)) continue
    }
    if (SKIP_DIRS.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      await walkHdFiles(full, root, out)
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.hd')) {
      out.push(full)
    }
  }
}

async function findAssetFolders(hdRoot) {
  const found = new Map() // id -> array of absolute paths
  async function walk(dir) {
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) }
    catch { return }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const full = join(dir, e.name)
      if (ID_RE.test(e.name)) {
        const arr = found.get(e.name) ?? []
        arr.push(full)
        found.set(e.name, arr)
        continue // do not descend into id-named folders
      }
      await walk(full)
    }
  }
  await walk(hdRoot)
  return found
}

async function readDocId(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = matter(raw)
    const id = parsed.data?.id
    return typeof id === 'string' && ID_RE.test(id) ? id : null
  } catch { return null }
}

function fail(msg, code = 1) {
  console.error(`[migrate] error: ${msg}`)
  process.exit(code)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args._.length === 0) { printHelp(); return }

  const workspace = resolve(args._[0])
  if (!existsSync(workspace)) fail(`workspace does not exist: ${workspace}`)
  const hdRoot = join(workspace, '.hd')
  if (!existsSync(hdRoot)) fail(`no .hd/ folder under workspace: ${workspace}`)

  console.log(`[migrate] workspace : ${workspace}`)
  console.log(`[migrate] mode      : ${args.apply ? 'APPLY' : 'dry-run'}`)
  console.log('')

  const hdFiles = []
  await walkHdFiles(workspace, workspace, hdFiles)
  console.log(`[migrate] found ${hdFiles.length} .hd file(s)`)

  // Map id -> doc path. Detect duplicate ids across docs.
  const idToDoc = new Map()
  const docsMissingId = []
  const docIdConflicts = new Map()
  for (const f of hdFiles) {
    const id = await readDocId(f)
    if (!id) { docsMissingId.push(f); continue }
    if (idToDoc.has(id)) {
      const arr = docIdConflicts.get(id) ?? [idToDoc.get(id)]
      arr.push(f)
      docIdConflicts.set(id, arr)
    } else {
      idToDoc.set(id, f)
    }
  }

  const assetFolders = await findAssetFolders(hdRoot)
  console.log(`[migrate] found ${assetFolders.size} asset folder id(s)`)
  console.log('')

  const plan = {
    alreadyFlat: [],
    willMove: [],         // { id, from, to }
    collision: [],        // { id, flat, mirrored }
    orphan: [],           // { id, paths }
    docMissingId: docsMissingId,
    docIdConflict: docIdConflicts
  }

  for (const [id, paths] of assetFolders) {
    const flatPath = join(hdRoot, id)
    const hasFlat = paths.includes(flatPath)
    const mirroredPaths = paths.filter(p => p !== flatPath)
    const docPath = idToDoc.get(id)

    if (!docPath && paths.length > 0) {
      plan.orphan.push({ id, paths })
      continue
    }

    if (hasFlat && mirroredPaths.length === 0) {
      plan.alreadyFlat.push({ id, path: flatPath })
      continue
    }

    if (hasFlat && mirroredPaths.length > 0) {
      plan.collision.push({ id, flat: flatPath, mirrored: mirroredPaths })
      continue
    }

    // exactly one mirrored, no flat → move
    if (mirroredPaths.length === 1) {
      plan.willMove.push({ id, from: mirroredPaths[0], to: flatPath })
    } else {
      plan.collision.push({ id, flat: null, mirrored: mirroredPaths })
    }
  }

  console.log(`Plan:`)
  console.log(`  already-flat   : ${plan.alreadyFlat.length}`)
  console.log(`  will-move      : ${plan.willMove.length}`)
  console.log(`  collision      : ${plan.collision.length}`)
  console.log(`  orphan         : ${plan.orphan.length}`)
  console.log(`  doc-missing-id : ${plan.docMissingId.length}`)
  console.log(`  doc-id-conflict: ${plan.docIdConflict.size}`)
  console.log('')

  if (plan.willMove.length > 0) {
    console.log('Will move:')
    for (const m of plan.willMove) {
      console.log(`  ${relative(workspace, m.from)} → ${relative(workspace, m.to)}`)
    }
    console.log('')
  }

  if (plan.collision.length > 0) {
    console.log('COLLISIONS (manual review needed, will NOT be touched):')
    for (const c of plan.collision) {
      console.log(`  id ${c.id}`)
      if (c.flat) console.log(`    flat     : ${relative(workspace, c.flat)}`)
      for (const m of c.mirrored) console.log(`    mirrored : ${relative(workspace, m)}`)
    }
    console.log('')
  }

  if (plan.orphan.length > 0) {
    console.log('Orphans (id folder exists, no doc references it — left alone):')
    for (const o of plan.orphan) {
      for (const p of o.paths) console.log(`  ${o.id}  ${relative(workspace, p)}`)
    }
    console.log('')
  }

  if (plan.docMissingId.length > 0) {
    console.log('Docs missing id (left alone):')
    for (const f of plan.docMissingId) console.log(`  ${relative(workspace, f)}`)
    console.log('')
  }

  if (plan.docIdConflict.size > 0) {
    console.log('Docs sharing the same id (review — only the first is mapped):')
    for (const [id, docs] of plan.docIdConflict) {
      console.log(`  id ${id}`)
      for (const d of docs) console.log(`    ${relative(workspace, d)}`)
    }
    console.log('')
  }

  if (!args.apply) {
    console.log('[migrate] dry-run complete. Pass --apply to perform moves.')
    return
  }

  let moved = 0
  let failed = 0
  for (const m of plan.willMove) {
    try {
      await rename(m.from, m.to)
      moved++
    } catch (e) {
      console.error(`[migrate] FAILED to move ${m.from} → ${m.to}: ${e.message}`)
      failed++
    }
  }
  console.log(`[migrate] moved ${moved} folder(s)${failed ? `, ${failed} failed` : ''}`)

  // Best-effort cleanup of now-empty mirrored parent directories.
  const parents = new Set(plan.willMove.map(m => dirname(m.from)))
  let cleaned = 0
  for (const p of parents) {
    let cur = p
    while (cur && cur.startsWith(hdRoot) && cur !== hdRoot) {
      try {
        const entries = await readdir(cur)
        if (entries.length > 0) break
        await rmdir(cur)
        cleaned++
        cur = dirname(cur)
      } catch { break }
    }
  }
  if (cleaned > 0) console.log(`[migrate] cleaned up ${cleaned} now-empty mirrored director(ies)`)
}

main().catch(err => {
  console.error(err?.stack || String(err))
  process.exit(1)
})
