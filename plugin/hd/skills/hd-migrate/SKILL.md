---
name: hd-migrate
description: Migrate an existing documentation site or set of Markdown/MDX pages into HD (.hd) format — mirrors the source hierarchy, generates a document id per page, relocates each page's media into its own .hd/<id>/ asset folder, rewrites links, and rebuilds the nav. Use when porting/converting/migrating a docs repo (GitBook, Docusaurus, MkDocs, plain Markdown, etc.) to .hd. Depends on the hd-format skill for all output rules.
---

# HD Migration

Convert an existing documentation source into a tree of `.hd` files. This skill is the **source-agnostic engine**; the per-source syntax rules live in `sources/<format>.md` and are read only for the format you're migrating.

**This skill depends on the `hd-format` skill.** That skill is the single source of truth for the *target*: the Markdown-primary body rules, the Markdown-vs-HTML-island boundary, allowed elements/attributes, frontmatter fields, the `id` generator, and — critically — the asset convention. Do not restate or contradict those rules here; defer to them. **Read `hd-format`'s SKILL.md (and its `reference/media.md`) before starting a migration.**

> [!IMPORTANT]
> HD is **Markdown-primary (format version 2)**. A migrated page is GFM Markdown, dropping to raw-HTML islands only for what Markdown can't express (figures, complex tables, sectioning wrappers, etc.). Do **not** emit body-only HTML — that is the legacy v1 format. Every page gets `version: 2`.

## The two hard rules that make migrations break

Most of a migration is mechanical source-Markdown → HD-Markdown. The two things that go wrong if you treat HD like a normal static site:

1. **Every page needs an `id`, and managed assets are stored per-page.** HD does not have a shared asset folder. Each document owns `.hd/<id>/` (at the project root, keyed by the page's frontmatter `id`), and a **managed** asset is referenced by **bare filename only** (`![alt](photo.png)` or `<img src="photo.png">`), which the editor resolves against that page's folder. A page with no `id` cannot resolve managed assets. So you must generate an `id` for every page up front.

2. **Shared source assets must be duplicated per consuming page.** Source systems (GitBook's `.gitbook/assets/`, Docusaurus's `/static`) keep one asset pool that many pages reference. Managed HD resolution is per-page, so an image used by three pages must be **copied into all three** pages' `.hd/<id>/` folders under its bare name. Do not try to keep a shared folder and point a bare `src` at it — that is the #1 mistake and it does not work in HD.

> [!NOTE]
> HD *does* support referencing a file **in place** by a relative path (`![alt](../assets/x.png)`) without copying it — see hd-format's "Referencing media in place". That is for media already living in the repo, managed outside hd. A migration is the opposite case: you are taking ownership of the source's assets, so **relocate them into `.hd/<id>/` and use bare filenames**. Only reach for in-place references if the source assets are staying put in the same repo by deliberate choice.

## Workflow

### 1. Survey the source
- Identify the doc tree (which files are pages), the **nav/TOC** definition (GitBook `SUMMARY.md`, Docusaurus `sidebars.js`, MkDocs `mkdocs.yml`), and the **asset store**.
- Read the matching `sources/<format>.md` recipe in this skill. If none exists, create one from `sources/_template.md` first.

### 2. Plan the target tree
- Mirror the source hierarchy where it makes sense (same folder layout, `index`/`README` → `README.hd`). Preserving structure keeps internal links simple to rewrite.
- Decide the source-path → `.hd`-path mapping (usually `.md`/`.mdx` → `.hd`, same relative path).

### 3. Convert each page
For every source page:
1. **Generate an id** using hd-format's id generator — see its **"Generating an id"** section (a 22-char base62 id; never hand-author one). One fresh id per page; never reuse.
2. **Frontmatter** → emit `id`, `version: 2`, `title`, and `description` if the source had one. Bare YAML fenced with `---`, never wrapped in an HTML comment. Strip status emoji/artifacts from the title.
3. **Body** → convert source markup to **GFM Markdown**, using a raw-HTML island only where the hd-format boundary requires one. Keep Markdown as Markdown — headings, emphasis, lists, blockquotes, and fenced code all stay in Markdown; do **not** rewrite them into `<h1>`/`<p>`/`<ul>` HTML. Source-specific constructs (admonitions, embeds, shortcodes, tables-with-HTML) are mapped per `sources/<format>.md`.
4. **Assets** → for each image/media the page references:
   - Copy the source file into `<root>/.hd/<id>/` under a bare filename.
   - Rewrite the reference to that bare filename — `![alt](name.ext)` for a plain image, or an `<img src="name.ext">` island when it needs sizing/alignment (per hd-format's media rules). No paths, no prefixes.
   - If two different source files would collide on one name within a single page's folder, rename one and update its reference.
   - HD forbids `<video>`/`<audio>`/`<iframe>`: represent embeds/players as labelled links (see the source recipe).

### 4. Rewrite internal links
- `.md`/`.mdx` → `.hd`; directory links → `…/README.hd`; keep anchors. Use Markdown links `[text](target.hd)`. (Markdown drops `target`/`rel`, so external links are just `[text](url)` — the reader/renderer handles new-tab behavior.)

### 5. Rebuild the nav
- Convert the source TOC into a `SUMMARY.hd` as a **nested Markdown list** of links (`- [Label](path.hd)`), preserving hierarchy and section grouping.

### 6. Verify
- Source page count == target `.hd` count.
- Every page has `version: 2` and an `id` in frontmatter.
- Every **managed** image reference is a bare filename that exists at `.hd/<id>/<name>` for that page's id (in-place relative references, if any were deliberately kept, resolve to a file that exists).
- Body is Markdown-primary — no wholesale `<h1>`/`<p>`/`<ul>` HTML where Markdown would do; islands only where the boundary requires them.
- No forbidden HD elements (`script`/`style`/`iframe`/`video`/`audio`/form controls/`html`/`head`/`body`).
- No leftover source syntax (`{% … %}`, `:::admonition`, MDX components, `&#x20;` artifacts).
- Remove leftover source scaffolding (e.g. the old `.gitbook/` folder) only after assets are confirmed relocated.

## Scaling large migrations

For repos with many pages, fan the per-page conversion out to parallel subagents, batched by section. Give every batch the same instructions: this workflow + the relevant `sources/<format>.md` + hd-format's rules. Ids are independent per page, so each worker generates its own — no cross-batch coordination needed. After the fan-out, run the verification pass (step 6) centrally.

## Adding a new source format

Copy `sources/_template.md` to `sources/<format>.md` and fill in how that system represents headings, callouts, embeds, tables, frontmatter, and — most importantly — **where its assets live and how pages reference them**, so step 3.4 can relocate them into `.hd/<id>/`.
