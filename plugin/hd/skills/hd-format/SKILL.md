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

- `id` — **required when the doc has media** (images, etc.); optional otherwise. 22-character base62 identifier. The editor auto-generates one on first open if absent, but if you are authoring a doc *with* images you must assign it yourself before placing the images — see [Media](#media). Stable across renames/moves. Never change an existing id; clearing the value (leaving the key) forces the editor to regenerate.
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
- `img`: `src`, `alt`, `width`, `height`, `loading` — size images with CSS in `style` (`width`/`max-width`/`max-height`), see [Media](#media)
- `td`, `th`: `colspan`, `rowspan`, `scope`, `headers`
- `ol`: `start`, `type`, `reversed`
- `details`: `open`
- `col`, `colgroup`: `span`
- `code`, `pre`: `class` for syntax-language hints (e.g., `language-typescript`)

## Excluded attributes
- Event handlers: `onclick`, `onload`, and any `on*` attribute
- Form-control attributes
- Interactivity attributes: `contenteditable`, `draggable`, `hidden`

## Media

Images, image sizing/constraints, and figures have their own detailed rules. **Load [reference/media.md](reference/media.md) whenever the doc you are authoring or editing contains images or figures.** The essentials:

- **Images live in a sidecar folder keyed by the doc `id`**, not next to the file. `<img src="hero.png">` resolves to `<workspace>/.hd/<id>/hero.png`. The `src` **must be a bare filename** — no subfolders or relative paths. A doc with media **must** have an `id` in frontmatter, and you must create `.hd/<id>/` before placing files. Inline `<svg>` is exempt (it lives in the body, not a file).
- **Size images with CSS in the `style` attribute** — `width`, `max-width`, `max-height` — not the HTML `width`/`height` attributes (only CSS expresses *max* constraints). `max-height` is the key control for tall mobile screenshots. Don't set explicit `height`; let it follow from width.
- **Set a meaningful `alt`** on every content image (`alt=""` only if decorative). **Align** images with `display:block` + auto `margin` and figures with `text-align` on the `<figure>`.
- **Use `<figure>` + `<figcaption>`** for captioned images and screenshot grids: exactly one `<img>` plus an optional caption.

reference/media.md covers all of the above in full, plus **id generation** (use `node plugin/hd/scripts/new-id.mjs` — never hand-author an id), the legacy asset layout, and the device-screenshot-report pattern.

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
