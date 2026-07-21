# Hyperdoc (HD) Editor

A WYSIWYG editor for **Hyperdoc (`.hd`)** and **Markdown (`.md`)** files, delivered as a VS Code extension. Edit rich text visually — headings, tables, lists, links, images, code blocks — while your document stays a clean, diff-friendly text file on disk.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-007ACC.svg?logo=visualstudiocode)](https://code.visualstudio.com/)

---

## Why Hyperdoc?

Markdown is great until you need a table cell with two paragraphs, a `colspan`, an inline style, or a bit of raw SVG. Full HTML solves that but drags in `<head>`, scripts, and stylesheets you don't want in a document.

**Hyperdoc (`.hd`) sits in between.** It's a Markdown-primary document format with optional YAML frontmatter that can drop down to a curated subset of HTML for exactly the cases Markdown can't express — and nothing more. You author it in a real WYSIWYG editor, but it stays plain text in Git.

- **Markdown-primary.** The body is stored as Markdown; richer HTML is used only where it's actually needed.
- **Optional YAML frontmatter.** A bare `---` fence at the top, just like Markdown tooling expects.
- **Stable per-document identity.** Each file gets a 22-character base62 `id` on first open. Asset folders are keyed by that id, so renames and moves never break image references.
- **Clean clipboard interop.** Paste from Markdown, HTML, Notion, or Linear; copy back out as Markdown.

> Legacy body-only HTML `.hd` (format v1) and the deprecated `.hd2` extension are still read and automatically migrated on first edit.

---

## Features

### WYSIWYG editing
- Fixed toolbar: headings, **bold** / *italic* / underline / highlight, inline code, code blocks, links, bullet & numbered lists, blockquotes, horizontal rules, and table insertion.
- Full keyboard shortcut set (see below).
- A read-only **Document info** panel (`ⓘ`) reporting the file's format version, `id`, frontmatter, and asset folder contents.

### Tables that Markdown can't do
- `colspan`, `rowspan`, multi-paragraph cells, inline styles, header rows **and** header columns.
- **Hover-insert** columns and rows at any boundary.
- **Right-click** any cell for the full menu — insert/delete column & row, toggle headers, delete table.
- **Drag** a column boundary to resize; widths round-trip with the document.

### Smart paste
The paste handler dispatches on clipboard content:
1. **Image** → saved into the document's asset folder, `<img>` inserted at the cursor.
2. **Inside a code block / blockquote** → always pasted as verbatim plain text.
3. **HTML** (browser, Notion, Linear, …) → sanitized against the HD allow-list.
4. **Markdown text** → detected heuristically and converted.
5. **Plain text** → inserted as-is.

Use **Ctrl+Shift+V** to force plain-text paste anywhere.

### Markdown round-trip
**HD: Copy as Markdown** emits clean Markdown for everything that round-trips losslessly, and raw HTML inline for everything else — so no content is ever lost. Per-element behavior is documented in [`docs/format-spec.hd`](docs/format-spec.hd).

### Asset management
Images live under `.hd/<id>/` next to the document, keyed by the document's stable `id`. Because the folder is keyed by id rather than filename, renaming or moving a document keeps its images attached.

---

## Keyboard shortcuts

`Ctrl` on Windows/Linux, `Cmd` on macOS.

| Shortcut | Action |
| --- | --- |
| **Ctrl+B / I / U** | Bold / Italic / Underline |
| **Ctrl+E** | Inline code |
| **Ctrl+K** | Insert or edit link (with an HD-document picker) |
| **Ctrl+Shift+H** | Highlight (`<mark>`) |
| **Ctrl+Shift+X** | Strikethrough |
| **Ctrl+Alt+1 … 6** | Heading level 1–6 |
| **Ctrl+Alt+0** | Back to paragraph |
| **Ctrl+Shift+8 / 7** | Toggle bullet / numbered list |
| **Ctrl+Shift+B** | Toggle blockquote |
| **Ctrl+Shift+V** | Paste as plain text |
| **Ctrl+;** | Insert today's date (`DD MMM YYYY`) |
| **Ctrl+Z / Ctrl+Shift+Z** | Undo / Redo |
| **Ctrl+Shift+P → "HD: Copy as Markdown"** | Copy body as Markdown |

---

## Installation

Hyperdoc isn't on the VS Code Marketplace — install it from the packaged `.vsix` on the [Releases page](https://github.com/sygnaltech/hyperdoc/releases/latest). It works in VS Code, Cursor, VS Codium, and other VS Code–based editors.

### Install from a release

1. Go to **[Releases](https://github.com/sygnaltech/hyperdoc/releases/latest)** and download the latest `hyperdoc-<version>.vsix`.
2. Install it, either way:

   **From the command line:**
   ```bash
   code --install-extension hyperdoc-0.1.12.vsix
   ```

   **From inside VS Code:** open the **Extensions** view (Ctrl+Shift+X) → click the **⋯** menu at the top → **Install from VSIX…** → pick the downloaded file.
3. **Reload the window:** Ctrl+Shift+P → **"Developer: Reload Window"** (or restart VS Code). A VSIX install does not update windows that are already open.

Once installed it applies to every window and every project — there's no per-project setup. Any `.hd`, `.hd2`, or `.md` file opens in the Hyperdoc editor.

### Updating

Download the newer `.vsix` from Releases and install it the same way (`--install-extension` replaces the old version in place), then reload the window.

### Build from source

To build your own `.vsix` from this repo:

```powershell
# 1. Install dependencies (once)
npm install

# 2. Build + package — writes a fresh hyperdoc-<version>.vsix to the project root
npm run package

# 3. Install into VS Code (let the shell fill in the version)
code --install-extension "hyperdoc-$((Get-Content package.json -Raw | ConvertFrom-Json).version).vsix" --force

# 4. Reload every open VS Code window: Ctrl+Shift+P → "Developer: Reload Window"
```

Steps 2 and 3 can be chained for ongoing iteration:

```powershell
npm run package; code --install-extension "hyperdoc-$((Get-Content package.json -Raw | ConvertFrom-Json).version).vsix" --force
```

> Installing a VSIX does **not** update windows that are already running — reloading is the most common reason a rebuild still shows the old editor.

---

## Getting started

Create any file with a `.hd` extension in a workspace. VS Code opens it in the Hyperdoc WYSIWYG editor by default. On first open, the editor injects an `id` and `version` into the frontmatter automatically — you don't set them by hand.

To seed your own frontmatter, start the file with a bare YAML fence:

```
---
title: My Document
description: A short description.
---

# Hello, HD
```

Markdown (`.md`) files also open in the HD editor by default. To use VS Code's built-in text editor for Markdown instead, turn off `hd.markdown.enabled`.

---

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `hd.markdown.enabled` | `true` | Open `.md` files in the HD Markdown editor. Turn off to use VS Code's built-in text editor. |
| `hd.markdown.assetFolder` | `${name}.assets` | Template for where pasted images are saved, relative to the document. Tokens: `${name}`, `${dir}`, `${workspaceFolder}`. |

## Commands

| Command | Description |
| --- | --- |
| `HD: Copy as Markdown` | Copy the current document's body as Markdown. |
| `HD: Regenerate Document ID` | Assign a fresh `id` (e.g. after duplicating a file). |
| `HD: Migrate Workspace Assets to Flat Layout` | Migrate legacy mirrored asset folders to the flat `.hd/<id>/` layout. |
| `HD: Edit Markdown as Raw Text` | Open the current Markdown file in VS Code's plain text editor. |

---

## The `.hd` format

- **Body stored as Markdown (format v2).** The `version` field in frontmatter — not the file extension — is the source of truth for how the body is stored. New documents are v2; legacy v1 (body-only HTML) documents are migrated to v2 the first time you edit them.
- **Curated HTML subset for the rest.** Underline, highlight, complex tables, definition lists, figures, inline SVG, and other constructs Markdown lacks are stored as a bounded, sanitized set of HTML elements.
- **Frontmatter is optional YAML** behind a bare `---` fence.
- **Every document carries a stable `id`** used to key its asset folder at `.hd/<id>/`.

See the docs for the full specification:

- [`docs/getting-started.hd`](docs/getting-started.hd) — install and create your first document
- [`docs/editor.hd`](docs/editor.hd) — full editor behavior reference
- [`docs/format-spec.hd`](docs/format-spec.hd) — allowed elements & Markdown round-trip matrix
- [`docs/assets.hd`](docs/assets.hd) — how images and binaries are stored
- [`docs/format-compare.hd`](docs/format-compare.hd) — HD vs. Markdown, HTML, and Nextra
- [`docs/sync.hd`](docs/sync.hd) — publishing `.hd` source to external doc platforms

---

## Development

```bash
npm install       # install dependencies
npm run build     # bundle the extension with esbuild
npm run watch     # rebuild on change
npm run typecheck # tsc --noEmit
npm run package   # produce a versioned .vsix
```

Then press **F5** in VS Code to launch an Extension Development Host with the extension loaded.

### Architecture

The extension runs a [TipTap](https://tiptap.dev/)/ProseMirror editor inside a VS Code webview, with the document model synced back to the text file.

| Area | Path |
| --- | --- |
| Extension entry & editor providers | [`src/extension.ts`](src/extension.ts), [`src/editor/`](src/editor/) |
| Format parsing, frontmatter, allow-list | [`src/format/`](src/format/) |
| HD ⇄ Markdown conversion | [`src/conversion/`](src/conversion/) |
| WYSIWYG webview (`.hd`) | [`src/webview/`](src/webview/) |
| WYSIWYG webview (`.md`) | [`src/webview-md/`](src/webview-md/) |
| Document identity (base62 ids) | [`src/identity/`](src/identity/) |
| Asset storage & migration | [`src/assets/`](src/assets/) |

Built on [TipTap](https://tiptap.dev/), [turndown](https://github.com/mixmark-io/turndown) (HTML → Markdown), [marked](https://marked.js.org/) (Markdown → HTML), and [js-yaml](https://github.com/nodeca/js-yaml).

---

## License

[MIT](LICENSE) © Michael Wells
