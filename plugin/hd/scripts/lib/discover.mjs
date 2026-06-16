import { readFile, readdir } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'

const CONFIG_NAME = 'hd-sync.json'
const DEFAULT_MAX_DEPTH = 4
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', '.next', '.git'])

export async function findConfigFiles(startDir, maxDepth = DEFAULT_MAX_DEPTH) {
  const found = []
  async function walk(dir, depth) {
    if (depth > maxDepth) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue
      if (e.name.startsWith('.') && e.name !== '.') continue
      const full = join(dir, e.name)
      if (e.isFile() && e.name === CONFIG_NAME) {
        found.push(full)
      } else if (e.isDirectory()) {
        await walk(full, depth + 1)
      }
    }
  }
  await walk(startDir, 0)
  return found
}

export async function loadConfig(configPath) {
  const raw = await readFile(configPath, 'utf8')
  let config
  try {
    config = JSON.parse(raw)
  } catch (e) {
    throw new Error(`could not parse ${configPath}: ${e.message}`)
  }
  validateConfig(config, configPath)
  return {
    path: configPath,
    sourceDir: dirname(configPath),
    config
  }
}

function validateConfig(config, configPath) {
  if (!config || typeof config !== 'object') {
    throw new Error(`${configPath}: must be a JSON object`)
  }
  if (!Array.isArray(config.destinations)) {
    throw new Error(`${configPath}: must have a "destinations" array`)
  }
  if (config.destinations.length === 0) {
    throw new Error(`${configPath}: "destinations" array is empty`)
  }
  const seen = new Set()
  for (const [i, d] of config.destinations.entries()) {
    if (!d.name || typeof d.name !== 'string') {
      throw new Error(`${configPath}: destinations[${i}] missing "name"`)
    }
    if (seen.has(d.name)) {
      throw new Error(`${configPath}: duplicate destination name "${d.name}"`)
    }
    seen.add(d.name)
    if (!d.type || typeof d.type !== 'string') {
      throw new Error(`${configPath}: destinations[${i}] (${d.name}) missing "type"`)
    }
    if (!d.path || typeof d.path !== 'string') {
      throw new Error(`${configPath}: destinations[${i}] (${d.name}) missing "path"`)
    }
  }
}

export function resolveDestPath(sourceDir, destination) {
  return resolve(sourceDir, destination.path)
}

export function findDestination(loaded, name) {
  return loaded.config.destinations.find(d => d.name === name) || null
}

export async function discoverAll(startDir, maxDepth = DEFAULT_MAX_DEPTH) {
  const paths = await findConfigFiles(startDir, maxDepth)
  const configs = []
  const errors = []
  for (const p of paths) {
    try {
      configs.push(await loadConfig(p))
    } catch (e) {
      errors.push({ path: p, error: e.message })
    }
  }
  return { configs, errors }
}
