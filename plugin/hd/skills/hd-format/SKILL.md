---
name: hd-format
description: Read, write, and edit .hd documentation files — Markdown-primary (GFM) with raw-HTML islands and optional YAML frontmatter. Use when handling files with the .hd extension, discussing the HD format, or producing content meant to be saved as .hd.
---

# .hd Format

The `.hd` format is **Markdown-primary** documentation: the body is GitHub-Flavored Markdown, dropping down to **raw-HTML islands** only for the things Markdown can't express losslessly. Use this skill whenever you're reading, writing, or editing files with the `.hd` extension, or producing content that will be saved as `.hd`.

> **Two on-disk versions exist.** Version **2** (the current default, described here) stores the body as Markdown + HTML islands. Version **1** is the older body-only-HTML format. The `version:` frontmatter field — not the file extension — says which one a file is. A file is treated as legacy v1 **only when it explicitly declares `version: 1`**; anything else (including a file with no `version:` field) opens as v2. See [Reading and migrating version 1](#reading-and-migrating-version-1) before editing an older file. The `.hd2` extension is a deprecated alias for a version-2 `.hd` file; it still opens but should not be used for new content.

> **Creating a new `.hd`? Use the script, never hand-write the frontmatter.** Run `node plugin/hd/scripts/new-doc.mjs <path.hd> [--title "…"] [--id]`. It stamps `version: 2`, the title, and the date for you — and mints an `id` with `--id` when the doc will hold media. This is the one reliable way to guarantee the version field is present; a hand-authored doc that omits it is the usual cause of a "why is this version 1?" surprise.

## File structure

1. **Optional YAML frontmatter** at the top of the file, fenced with `---` on its own line. **No HTML comment wrapper.**
2. **One blank line** after the frontmatter is a convention for readability, not a requirement.
3. **Markdown body** follows (GFM), with raw-HTML islands wherever Markdown can't represent an element (see [Markdown vs HTML islands](#markdown-vs-html-islands)). The file must not contain `<html>`, `<head>`, or `<body>` tags.

Example:

```
---
title: Getting Started
version: 2
date: 2026-06-12
---

# Getting Started

Welcome. This is **Markdown**, with an HTML island only where needed:

<figure>
  <img src="hero.png" alt="The dashboard" style="max-width:640px">
  <figcaption>The dashboard on first run.</figcaption>
</figure>
```

> **Always write `version: 2`** in the frontmatter of a document you author or convert (the `new-doc.mjs` script does this for you). Only an explicit `version: 1` is read as legacy HTML, so a missing field now defaults to v2 — but write `version: 2` anyway, both for clarity and so the doc survives tools that key off the field.

## Recommended frontmatter fields

- `id` — **required when the doc has media** (images, etc.); optional otherwise. 22-character base62 identifier. The editor auto-generates one on first open if absent, but if you are authoring a doc *with* images you must assign it yourself before placing the images — see [Media](#media). Stable across renames/moves. Never change an existing id; clearing the value (leaving the key) forces the editor to regenerate.
- `version` — HD format version. **Current version: `2`** (Markdown-primary). Always set it to `2` on new or converted docs. `1` marks a legacy body-only-HTML file.
- `title`
- `date`
- `author`
- `description`
- `tags`
- `purpose`

## Markdown vs HTML islands

Write everything Markdown can express as Markdown; use a raw-HTML island only for what it can't. This is the same boundary the editor uses when it saves.

### Write as Markdown

| Content | Markdown |
|---|---|
| Headings `h1`–`h6` | `#` … `######` (ATX) |
| Paragraphs | plain text |
| Bold | `**…**` |
| Italic | `*…*` |
| Strikethrough | `~~…~~` (GFM) |
| Inline code | `` `…` `` |
| Links | `[text](href)` — `target`/`rel`/`download` are dropped |
| Blockquotes | `> …` |
| Lists (`ul`/`ol`) | `-` bullets, `1.` numbers; `ol start` preserved |
| Horizontal rule | `---` |
| Fenced code | ` ```lang ` — the language is the info string |
| Hard line break | trailing two spaces / `\` |
| Plain images | `![alt](filename)` — see [Media](#media) |
| Simple tables | GFM pipe tables (see below) |
| Task lists | `- [ ]` / `- [x]` (GFM) |
| Radio groups (unnamed) | `- ( )` / `- (x)` (HD syntax) |

**Simple tables** qualify for GFM only when they are rectangular, have a header row, single-span cells, and inline-only cell content. Column alignment is preserved via the delimiter row (`:---`, `:---:`, `---:`).

### Write as an HTML island

Markdown has no lossless form for these, so write them as raw HTML inside the body:

- **Sectioning wrappers** — `section`, `article`, `aside`, `header`, `footer`, `nav`, `main`. The **entire subtree** of a wrapper is stored as HTML; keep Markdown prose *outside* wrappers.
- **`div`** and **`span`** — generic containers that carry `class`/`style`/`id`/`data-*`.
- **Figures** — `figure`, `figcaption`.
- **Styled/sized images** — an `<img>` with `width`, `height`, `style`, or `class` (plain images use Markdown).
- **Definition lists** — `dl`, `dt`, `dd`.
- **Disclosure** — `details`, `summary`.
- **Inline semantics with no Markdown** — `u`, `mark`, `sub`, `sup`, `kbd`, `samp`, `var`, `abbr`, `cite`, `q`, `small`.
- **Complex tables** — any `colspan`/`rowspan`, block/multi-paragraph cells, non-rectangular shape, or missing header row keeps the **whole table** as an HTML island.
- **Inline `svg`** — passes through verbatim.
- **Named radio groups** — a `data-group` name can't live in the `- ( )` markers, so a named group is an HTML block.

> **Attributes on Markdown-native elements have nowhere to live.** Markdown can't hold `id`/`class`/`style`/`data-*` on a heading, paragraph, or list. When one of those matters, promote the element to an HTML island (e.g. wrap it in a `<div>`/`<span>`, or use a styled `<img>`).

### Allowed HTML (islands) and hard exclusions

Islands may use only the elements above plus the inline/block tags Markdown already covers. The following are **never** allowed, in an island or anywhere:

- `html`, `head`, `body` — body-only rule
- `script`, `style` — no executable code or stylesheets
- `iframe`, `embed`, `object` — no embedded external content
- `form`, `input`, `button`, `textarea`, `select`, `label`, `fieldset` — no interactive controls
- `canvas`, `audio`, `video` — no programmatic graphics or media playback
- `meta`, `link`, `base`, `title` — head-only elements

Excluded attributes anywhere: event handlers (`onclick`, `onload`, any `on*`), form-control attributes, and interactivity attributes (`contenteditable`, `draggable`, `hidden`).

Allowed island attributes: `id`, `class`, `title`, `lang`, `dir`, `style` (inline only), `data-*`; plus element-specific `a`(`href`/`target`/`rel`/`download`), `img`(`src`/`alt`/`width`/`height`/`loading`), `td`/`th`(`colspan`/`rowspan`/`scope`/`headers`), `ol`(`start`/`type`/`reversed`), `details`(`open`), `col`/`colgroup`(`span`), `code`/`pre`(`class` for `language-*`).

## Media

Images, image sizing/constraints, and figures have their own detailed rules. **Load [reference/media.md](reference/media.md) whenever the doc you are authoring or editing contains images or figures.** The essentials:

- **Images live in a sidecar folder keyed by the doc `id`**, not next to the file. Both the Markdown form `![alt](hero.png)` and the HTML form `<img src="hero.png">` resolve to `<workspace>/.hd/<id>/hero.png`. The reference **must be a bare filename** — no subfolders or relative paths. A doc with media **must** have an `id` in frontmatter, and you must create `.hd/<id>/` before placing files. Inline `<svg>` is exempt (it lives in the body, not a file).
- **Plain images use Markdown** — `![alt](file.png)`. **Sized/styled images use an HTML `<img>` island** so the styling survives the round-trip. Size with CSS in the `style` attribute — `width`, `max-width`, `max-height` — not the HTML `width`/`height` attributes (only CSS expresses *max* constraints). `max-height` is the key control for tall mobile screenshots. Don't set explicit `height`; let it follow from width.
- **Set a meaningful `alt`** on every content image (`alt=""` only if decorative). **Align** images with `display:block` + auto `margin` and figures with `text-align` on the `<figure>`.
- **Use `<figure>` + `<figcaption>`** (an HTML island) for captioned images and screenshot grids: exactly one `<img>` plus an optional caption.

reference/media.md covers all of the above in full, plus **id generation** (use `node plugin/hd/scripts/new-id.mjs` — never hand-author an id), the legacy asset layout, and the device-screenshot-report pattern. The asset convention is **identical across versions 1 and 2** — nothing about media folders changed.

## Reading and migrating version 1

A file with an explicit `version: 1` stores the body as **body-only HTML** rather than Markdown. It still opens in the editor unchanged.

- **v1 is opt-in, not the fallback.** The editor treats a file as legacy HTML **only** when it declares `version: 1`. A file with no `version:` field opens as v2/Markdown. So a genuine legacy HTML file that was never stamped must carry `version: 1` to keep rendering as HTML — `node plugin/hd/scripts/stamp-legacy-versions.mjs [dir] --write` finds un-versioned HTML-bodied files and stamps them for you (dry-run without `--write`).
- **The editor migrates on first edit.** Opening a v1 file leaves it byte-for-byte identical; the first save from the editor re-serializes the body to v2 Markdown and stamps `version: 2`. Opening without editing never rewrites it.
- **When hand-editing a v1 file**, either (a) keep the explicit `version: 1` and leave the body as HTML, or (b) convert the whole body to Markdown + islands and set `version: 2`. Do not keep `version: 1` on a body you've rewritten as Markdown — it will still be read as HTML.
- **The `.hd2` extension** is a deprecated alias: a `.hd2` file is just a version-2 `.hd`. It still opens, but author new content as `.hd` with `version: 2`.

## Authoring guidance

- Write the body as GFM Markdown; reach for an HTML island only when the [boundary](#markdown-vs-html-islands) requires it.
- Frontmatter is bare YAML — never wrap it in `<!-- ... -->`. Always include `version: 2`.
- Prefer Markdown constructs over equivalent HTML (`## Heading`, not `<h2>`); prefer semantic wrappers (`section`, `figure`) over generic `div` when an island is unavoidable.
- Tables are a primary motivator for the format — use GFM tables for simple cases, and an HTML-island table when you need `colspan`/`rowspan` or multi-paragraph cells.

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
