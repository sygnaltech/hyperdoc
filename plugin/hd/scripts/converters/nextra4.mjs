import { writeFile, mkdir, readdir, stat, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, extname, basename, dirname, relative } from 'node:path'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

export const type = 'nextra4'

function makeTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    fence: '```',
    hr: '---',
    bulletListMarker: '-',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined'
  })
  td.use(gfm)
  td.addRule('fencedCodeBlockWithLang', {
    filter(node) {
      return (
        node.nodeName === 'PRE' &&
        node.firstChild &&
        node.firstChild.nodeName === 'CODE'
      )
    },
    replacement(_content, node) {
      const code = node.firstChild
      const cls = (code.getAttribute('class') || '').match(/language-(\S+)/)
      const lang = cls ? cls[1] : ''
      const text = code.textContent.replace(/\n+$/, '')
      return '\n\n```' + lang + '\n' + text + '\n```\n\n'
    }
  })
  return td
}

const td = makeTurndown()

function yamlValue(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') {
    if (v === '' || /[:#'"\\\n]|^\s|\s$|^[-?]|^[0-9]/.test(v)) {
      return JSON.stringify(v)
    }
    return v
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return '[' + v.map(yamlValue).join(', ') + ']'
  return JSON.stringify(v)
}

function rewriteBody(body, { assetMap, warnings, sourceFile, docAssets = [], slug }) {
  let html = body

  html = html.replace(
    /href="([^"#]+)\.hd(#[^"]*)?"/g,
    (m, path, hash) => {
      if (/^https?:/i.test(path)) return m
      if (path.startsWith('../') || path.startsWith('..\\')) {
        warnings.push(`${sourceFile}: external .hd reference (outside source dir): ${m}`)
        return m
      }
      const cleaned = path.replace(/^\.\//, '')
      return `href="/${cleaned}${hash || ''}"`
    }
  )

  if (docAssets.length > 0 && slug) {
    const assetSet = new Set(docAssets)
    html = html.replace(/<img\s[^>]*>/gi, (tag) => {
      const m = tag.match(/\bsrc="([^"]+)"/)
      if (!m) return tag
      const src = m[1]
      if (/^https?:|^data:|^\//.test(src)) return tag
      if (src.includes('/') || src.includes('\\')) return tag
      if (!assetSet.has(src)) {
        warnings.push(`${sourceFile}: image src "${src}" not found in HD asset folder`)
        return tag
      }
      return tag.replace(m[0], `src="/assets/${slug}/${src}"`)
    })
  }

  for (const map of assetMap) {
    const fromPrefix = map.from.replace(/\\/g, '/').replace(/\/+$/, '')
    const toRoot = '/' + map.to
      .replace(/\\/g, '/')
      .replace(/^public\/?/, '')
      .replace(/\/+$/, '')
    const escaped = fromPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(src|href)="(\\.\\/)?${escaped}\\/`, 'g')
    html = html.replace(re, `$1="${toRoot}/`)
  }

  const externalRefs = html.match(/href="\.\.\/[^"]+"/g)
  if (externalRefs) {
    for (const ref of externalRefs) {
      if (/\.hd(#[^"]*)?"$/.test(ref)) continue
      warnings.push(`${sourceFile}: external repo link not rewritten: ${ref}`)
    }
  }

  return html
}

const VOID_ELEMENTS_RE = /<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b([^>]*)>/gi
const INLINE_STYLE_RE = /\s+style="[^"]*"/gi
const HTML_TAG_RE = /<([a-z][a-z0-9]*)(\s[^>]*?)?(\/?)>/gi

const JSX_ATTR_MAP = [
  [/\bcolspan=/gi, 'colSpan='],
  [/\browspan=/gi, 'rowSpan='],
  [/\btabindex=/gi, 'tabIndex='],
  [/\bmaxlength=/gi, 'maxLength='],
  [/\bminlength=/gi, 'minLength='],
  [/\breadonly=/gi, 'readOnly='],
  [/\bfor=/gi, 'htmlFor='],
  [/\bclass=/gi, 'className='],
  [/\bcellspacing=/gi, 'cellSpacing='],
  [/\bcellpadding=/gi, 'cellPadding=']
]

function normalizeJsxAttrs(html) {
  return html.replace(HTML_TAG_RE, (match, tag, attrs, slash) => {
    if (!attrs) return match
    let out = attrs
    for (const [re, replacement] of JSX_ATTR_MAP) {
      out = out.replace(re, replacement)
    }
    return `<${tag}${out}${slash}>`
  })
}

function mdxSafeRawHtml(html) {
  let out = html.replace(INLINE_STYLE_RE, '')
  out = out.replace(VOID_ELEMENTS_RE, (match, tag, attrs) => {
    if (attrs.trimEnd().endsWith('/')) return match
    return `<${tag}${attrs.trimEnd()} />`
  })
  out = normalizeJsxAttrs(out)
  return out
}

function buildMdx(frontmatter, mdxBody) {
  let out = ''
  if (Object.keys(frontmatter).length > 0) {
    out += '---\n'
    for (const [k, v] of Object.entries(frontmatter)) {
      out += `${k}: ${yamlValue(v)}\n`
    }
    out += '---\n\n'
  }
  out += mdxSafeRawHtml(mdxBody.trim()) + '\n'
  return out
}

function findWorkspace(startDir) {
  let dir = startDir
  while (true) {
    if (existsSync(join(dir, '.hd'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export async function convert({ sources, sourceDir, destination, log }) {
  const warnings = []
  const targetRoot = resolve(sourceDir, destination.path)
  const contentDir = join(targetRoot, destination.contentDir || 'src/content')
  const publicDir = join(targetRoot, destination.publicDir || 'public')

  log(`target root : ${targetRoot}`)
  log(`content dir : ${contentDir}`)
  log('')

  if (!existsSync(targetRoot)) {
    throw new Error(`target path does not exist: ${targetRoot}`)
  }
  if (!existsSync(contentDir)) {
    throw new Error(`content dir does not exist: ${contentDir}`)
  }

  const assetMap = Array.isArray(destination.assetMap) ? destination.assetMap : []
  const workspace = findWorkspace(sourceDir)

  const writtenSlugs = new Set()
  let converted = 0
  let docAssetsCopied = 0

  for (const src of sources) {
    let docAssets = []
    if (workspace && src.id) {
      const docDirRel = relative(workspace, dirname(src.sourcePath)).replace(/\\/g, '/')
      const assetFolder = join(workspace, '.hd', docDirRel, src.id)
      if (existsSync(assetFolder)) {
        const files = await readdir(assetFolder)
        const publicAssetDir = join(publicDir, 'assets', src.slug)
        await mkdir(publicAssetDir, { recursive: true })
        for (const f of files) {
          const fromPath = join(assetFolder, f)
          const s = await stat(fromPath)
          if (s.isFile()) {
            await copyFile(fromPath, join(publicAssetDir, f))
            docAssets.push(f)
            docAssetsCopied++
          }
        }
      }
    } else if (!src.id && /\bsrc="[^"\/]+"/.test(src.body) && /<img\b/i.test(src.body)) {
      warnings.push(`${src.file}: has <img> with bare filename but no "id" in frontmatter — cannot resolve asset folder`)
    }

    const html = rewriteBody(src.body, {
      assetMap,
      warnings,
      sourceFile: src.file,
      docAssets,
      slug: src.slug
    })
    const mdxBody = td.turndown(html)
    const mdx = buildMdx(src.frontmatter, mdxBody)
    const outPath = join(contentDir, src.slug + '.mdx')
    await writeFile(outPath, mdx, 'utf8')
    writtenSlugs.add(src.slug)
    converted++
    const noteAssets = docAssets.length > 0 ? `  [+${docAssets.length} asset(s)]` : ''
    log(`converted  ${src.file}  →  ${src.slug}.mdx${noteAssets}`)
  }

  let assetsCopied = 0
  for (const map of assetMap) {
    const from = resolve(sourceDir, map.from)
    const to = resolve(targetRoot, map.to)
    if (!existsSync(from)) {
      warnings.push(`asset source missing: ${from}`)
      continue
    }
    await mkdir(to, { recursive: true })
    const files = await readdir(from)
    for (const f of files) {
      const fromPath = join(from, f)
      const toPath = join(to, f)
      const s = await stat(fromPath)
      if (s.isFile()) {
        await copyFile(fromPath, toPath)
        assetsCopied++
      }
    }
    log(`copied     ${map.from}  →  ${map.to}  (${files.length} item(s))`)
  }

  if (destination.meta && typeof destination.meta === 'object') {
    const metaPath = join(contentDir, '_meta.js')
    const metaContent = `export default ${JSON.stringify(destination.meta, null, 2)}\n`
    await writeFile(metaPath, metaContent, 'utf8')
    log('wrote      _meta.js')
  }

  const existingMdx = (await readdir(contentDir))
    .filter(f => extname(f) === '.mdx')
    .map(f => basename(f, '.mdx'))
  for (const o of existingMdx) {
    if (!writtenSlugs.has(o)) {
      warnings.push(`orphan in target (no HD source): ${o}.mdx`)
    }
  }

  return {
    converted,
    assetsCopied: assetsCopied + docAssetsCopied,
    warnings,
    nextStep: `cd "${targetRoot}" && npm run build`
  }
}
