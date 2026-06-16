#!/usr/bin/env node
import { resolve, relative } from 'node:path'
import { discoverAll, loadConfig, findDestination, resolveDestPath } from './lib/discover.mjs'
import { readHdSources } from './lib/source.mjs'

const CONVERTERS = {
  nextra4: () => import('./converters/nextra4.mjs')
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--list') args.list = true
    else if (a === '--config') args.config = argv[++i]
    else if (a === '--dest') args.dest = argv[++i]
    else if (a === '--help' || a === '-h') args.help = true
    else args._.push(a)
  }
  return args
}

function fail(msg, code = 1) {
  console.error(`[hd-sync] error: ${msg}`)
  process.exit(code)
}

function printHelp() {
  console.log(`hd-sync — publish .hd documentation to external platforms

Usage (CLI):
  node convert.mjs                      Show discovered configs (friendly).
  node convert.mjs --list               Emit discovery as JSON (for tooling).
  node convert.mjs --config <path> --dest <name>
                                        Run a specific sync.

Typical use: invoke via the /hd:sync slash command, which drives this script
interactively.

Config file (hd-sync.json) lives in the directory of .hd files to publish.
Schema:

  {
    "destinations": [
      {
        "name": "nextra 4",
        "type": "nextra4",
        "path": "<relative or absolute path to target site root>",
        ... type-specific fields ...
      }
    ]
  }
`)
}

async function commandList(cwd) {
  const { configs, errors } = await discoverAll(cwd)
  const out = {
    cwd,
    configs: configs.map(c => ({
      path: c.path,
      sourceDir: c.sourceDir,
      destinations: c.config.destinations.map(d => ({
        name: d.name,
        type: d.type,
        description: d.description || null,
        path: d.path,
        resolvedPath: resolveDestPath(c.sourceDir, d)
      }))
    })),
    errors
  }
  console.log(JSON.stringify(out, null, 2))
}

async function commandDiscoverHuman(cwd) {
  const { configs, errors } = await discoverAll(cwd)
  if (errors.length) {
    console.log('Config errors:')
    for (const e of errors) console.log(`  - ${e.path}: ${e.error}`)
    console.log('')
  }
  if (configs.length === 0) {
    console.log(`No hd-sync.json found at or below ${cwd} (depth 4).`)
    return
  }
  console.log(`Discovered ${configs.length} config file(s):\n`)
  for (const c of configs) {
    console.log(`  ${relative(cwd, c.path) || c.path}`)
    for (const d of c.config.destinations) {
      const desc = d.description ? `  — ${d.description}` : ''
      console.log(`    [${d.type}] ${d.name}${desc}`)
      console.log(`      → ${resolveDestPath(c.sourceDir, d)}`)
    }
    console.log('')
  }
  console.log('To run:  /hd:sync   (interactive)')
  console.log('Or:      node convert.mjs --config <path> --dest "<name>"')
}

async function commandRun({ configPath, destName }) {
  const loaded = await loadConfig(resolve(configPath))
  const destinations = loaded.config.destinations

  let destination
  if (destName) {
    destination = findDestination(loaded, destName)
    if (!destination) {
      const available = destinations.map(d => `"${d.name}"`).join(', ')
      fail(`destination "${destName}" not found in ${loaded.path}. Available: ${available}`)
    }
  } else {
    if (destinations.length > 1) {
      console.error(`[hd-sync] config has ${destinations.length} destinations. Specify --dest:`)
      for (const d of destinations) console.error(`  - "${d.name}" (${d.type})`)
      process.exit(1)
    }
    destination = destinations[0]
  }

  const converterLoader = CONVERTERS[destination.type]
  if (!converterLoader) {
    const supported = Object.keys(CONVERTERS).join(', ')
    fail(`unsupported destination type "${destination.type}". Supported: ${supported}`)
  }

  const converter = await converterLoader()
  const sources = await readHdSources(loaded.sourceDir)

  console.log(`[hd-sync] config      : ${loaded.path}`)
  console.log(`[hd-sync] source      : ${loaded.sourceDir}`)
  console.log(`[hd-sync] destination : ${destination.name} (${destination.type})`)
  console.log('')

  const log = (line) => console.log(`  ${line}`)
  let result
  try {
    result = await converter.convert({
      sources,
      sourceDir: loaded.sourceDir,
      destination,
      log
    })
  } catch (e) {
    fail(e.message || String(e))
  }

  console.log('')
  console.log(`[hd-sync] ${result.converted} file(s) converted, ${result.assetsCopied} asset(s) copied`)
  if (result.warnings.length === 0) {
    console.log('[hd-sync] no warnings')
  } else {
    console.log(`[hd-sync] ${result.warnings.length} warning(s):`)
    for (const w of result.warnings) console.log(`  - ${w}`)
  }
  console.log('')
  if (result.nextStep) {
    console.log(`[hd-sync] next: ${result.nextStep}`)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }
  const cwd = process.cwd()

  if (args.list) {
    await commandList(cwd)
    return
  }

  if (args.config) {
    await commandRun({ configPath: args.config, destName: args.dest })
    return
  }

  await commandDiscoverHuman(cwd)
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err))
  process.exit(1)
})
