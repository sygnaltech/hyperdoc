---
name: hd-format
description: Read, write, and edit .hd documentation files — body-only HTML with optional YAML frontmatter. Use when handling files with the .hd extension, discussing the HD format, or producing content meant to be saved as .hd.
---

# .hd Format

The `.hd` format is body-only HTML used for documentation. Use this skill whenever you're reading, writing, or editing files with the `.hd` extension, or producing content that will be saved as `.hd`.

## File structure

1. **Optional YAML frontmatter** at the top of the file, fenced with `---` on its own line. **No HTML comment wrapper.**
2. **One blank line** after the frontmatter is a convention for readability, not a requirement.
3. **Body-only HTML content** follows. The file must not contain `<html>`, `<head>`, or `<body>` tags.

Example:

```
---
title: Getting Started
format: hd-doc v1
date: 2026-06-12
---

<h1>Getting Started</h1>
<p>Welcome.</p>
```

## Recommended frontmatter fields

- `id` — **required when the doc has media** (images, etc.); optional otherwise. 22-character base62 identifier. The editor auto-generates one on first open if absent, but if you are authoring a doc *with* images you must assign it yourself before placing the images — see [Media files](#media-files). Stable across renames/moves. Never change an existing id; clearing the value (leaving the key) forces the editor to regenerate.
- `version` — HD format version number. Current version: **1**. If absent, treat as the latest version.
- `title`
- `date`
- `author`
- `description`
- `tags`
- `purpose`

## Supported elements

### Block
- `h1` through `h6`
- `p`
- `blockquote`
- `pre`
- `hr`
- `div`

### Lists
- `ul`, `ol`, `li`
- `dl`, `dt`, `dd`

### Tables
- `table`, `caption`
- `thead`, `tbody`, `tfoot`
- `tr`, `th`, `td`
- `colgroup`, `col`

### Inline text
- `a`
- `strong`, `em`, `b`, `i`, `u`, `s`
- `code`, `kbd`, `samp`, `var`
- `mark`
- `sub`, `sup`
- `abbr`, `cite`, `q`, `small`
- `span`
- `br`

### Media
- `img`
- `figure`, `figcaption`
- `svg` and its standard children for inline diagrams

### Sectioning
- `section`, `article`, `aside`
- `header`, `footer`, `nav`, `main`

### Disclosure
- `details`, `summary`

## Excluded elements

These must not appear in a `.hd` file:

- `html`, `head`, `body` — body-only rule
- `script`, `style` — no executable code or stylesheets
- `iframe`, `embed`, `object` — no embedded external content
- `form`, `input`, `button`, `textarea`, `select`, `label`, `fieldset` — no interactive controls
- `canvas`, `audio`, `video` — no programmatic graphics or media playback
- `meta`, `link`, `base`, `title` — head-only elements

## Supported attributes

### Universal (allowed on any element)
- `id`, `class`
- `title`
- `lang`, `dir`
- `style` — inline only; the `<style>` tag itself is excluded
- `data-*`

### Element-specific
- `a`: `href`, `target`, `rel`, `download`
- `img`: `src`, `alt`, `width`, `height`, `loading`
- `td`, `th`: `colspan`, `rowspan`, `scope`, `headers`
- `ol`: `start`, `type`, `reversed`
- `details`: `open`
- `col`, `colgroup`: `span`
- `code`, `pre`: `class` for syntax-language hints (e.g., `language-typescript`)

## Excluded attributes
- Event handlers: `onclick`, `onload`, and any `on*` attribute
- Form-control attributes
- Interactivity attributes: `contenteditable`, `draggable`, `hidden`

## Media files

**Images are not stored next to the `.hd` file and are not referenced with relative paths.** They live in a sidecar folder keyed by the document's `id`, at the workspace root:

```
<workspace>/
├── docs/
│   └── architecture.hd        ← id: 7gXk2L9pM4nQ8vR1cT3bDe
└── .hd/
    └── 7gXk2L9pM4nQ8vR1cT3bDe/
        ├── hero.png
        └── diagram.svg
```

The id is the entire lookup key — no document-path mirroring. Rules:

1. **`<img src=>` must be a bare filename.** `<img src="hero.png">` resolves to `<workspace>/.hd/<id>/hero.png`. **Never** use subfolders, dot-paths, or workspace-relative paths like `img/hero.png`, `./hero.png`, or `../assets/hero.png` — the editor will not find the file and the published output will be broken.
2. **A doc with media must have its `id` set in frontmatter.** If you are authoring a new doc and also creating its images, generate a 22-char base62 id yourself (don't rely on auto-generation — you need the value *now* to know where to put the files).
3. **Create `<workspace>/.hd/<id>/` before placing files.** Then write images into it with whatever filenames you reference from the body.
4. **Inline SVG is fine** — `<svg>...</svg>` lives inside the body, not in a file. The asset-folder rule applies only to `<img>` references.

Example workflow when adding a new doc with images:

```
1. Generate a fresh id (see Generating an id below)
2. mkdir <workspace>/.hd/<id>/
3. Put hero.png into <workspace>/.hd/<id>/
4. Write the .hd file with `id: <that-same-id>` in frontmatter
5. Reference the image as <img src="hero.png" alt="...">
```

### Generating an id

An HD id is 22 characters of base62 (alphabet `0-9a-zA-Z`) encoding 128 bits of entropy. **Do not hand-author one.** The editor's algorithm lives in `src/identity/base62.ts`; the same algorithm is exposed as a script and as a portable shell one-liner.

**If the hd plugin is checked out** (most common — the `plugin/hd/` directory exists somewhere reachable):

```bash
node plugin/hd/scripts/new-id.mjs        # one id
node plugin/hd/scripts/new-id.mjs 5      # five ids, one per line
```

**Fallback when the plugin isn't local** (any environment with Node):

```bash
node -e "const c=require('crypto');const A='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';let b=0n;for(const x of c.randomBytes(16))b=(b<<8n)|BigInt(x);let s='';while(b>0n){s=A[Number(b%62n)]+s;b=b/62n;}while(s.length<22)s=A[0]+s;console.log(s)"
```

Either approach prints an id like `7gXk2L9pM4nQ8vR1cT3bDe`. Drop it directly into `id:` in the frontmatter.

What you must *never* do:

- Use a UUID (`550e8400-e29b-…`) — wrong format, wrong length, contains hyphens not in the alphabet.
- Use a nanoid with a non-base62 alphabet.
- Hand-type something like `my-doc-id-2026` — the editor validates against `^[0-9a-zA-Z]{22}$` and will treat anything else as missing and regenerate it on open, orphaning any asset folder you created.

### Legacy mirrored layout (read-only fallback)

An earlier version of HD nested asset folders under the document's path, producing `.hd/docs/architecture/<id>/...`. The editor still resolves images from that location as a fallback if the flat path doesn't exist, but new content should always be placed at `.hd/<id>/`. Workspaces still on the legacy layout can be migrated with `node plugin/hd/scripts/migrate-assets-flat.mjs <workspace>` (dry-run by default; pass `--apply` to perform moves) or via the `HD: Migrate Workspace Assets to Flat Layout` command in VS Code.

## Authoring guidance

- When writing a `.hd` file, use only the elements and attributes listed above.
- Frontmatter is bare YAML — never wrap it in `<!-- ... -->`.
- Prefer semantic block elements (`section`, `article`, `figure`) over generic `div` where it fits.
- Tables are a primary motivator for the format — use them freely, including `colspan`/`rowspan` and multi-paragraph cell content.

## Publishing to an external platform

`.hd` is the source format; readers don't consume it directly. To publish a directory of `.hd` files to a documentation platform (currently Nextra 4 is supported; others extensible), drop a file named **`hd-sync.json`** into the source directory. It declares one or more destinations, each with a converter `type`, a target `path`, and per-converter fields. The `/hd:sync` slash command (provided by the `hd` Claude plugin) discovers these configs and runs the conversion.

The full `hd-sync.json` schema — common fields (`name`, `type`, `path`, `routePrefix`, `deleteOrphans`, etc.) and type-specific fields for each converter — is documented in the **hd-to-mdx skill** at `plugin/hd/skills/hd-to-mdx/SKILL.md`. Load it whenever you are creating an `hd-sync.json`, adding a destination to an existing one, or troubleshooting sync output.

Minimal example for a Nextra 4 destination:

```json
{
  "destinations": [
    {
      "name": "public docs",
      "type": "nextra4",
      "path": "../../nextra-site",
      "contentDir": "src/content",
      "deleteOrphans": "warn"
    }
  ]
}
```
