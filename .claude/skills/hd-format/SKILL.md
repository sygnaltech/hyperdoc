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

All optional. Common fields:

- `title`
- `format` — e.g., `hd-doc v1`
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

## Authoring guidance

- When writing a `.hd` file, use only the elements and attributes listed above.
- Frontmatter is bare YAML — never wrap it in `<!-- ... -->`.
- Prefer semantic block elements (`section`, `article`, `figure`) over generic `div` where it fits.
- Tables are a primary motivator for the format — use them freely, including `colspan`/`rowspan` and multi-paragraph cell content.
