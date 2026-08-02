# Source recipe: <SOURCE> → HD

Template for a new source format. Copy this to `sources/<format>.md` and fill in each section with how **this source system** represents documentation. Read alongside `../SKILL.md` (engine) and the `hd-format` skill (output rules). Document only how the *source* works — the engine owns ids, asset relocation, verification, and nav.

> [!NOTE]
> The target is **Markdown-primary HD (v2)**. Prefer keeping source Markdown as Markdown; only map to an HTML island where the hd-format boundary requires it.

## Source layout
- Which files are pages? (extensions, `index`/`README` conventions)
- Where is the **nav/TOC** defined? (e.g. `sidebars.js`, `mkdocs.yml`, `SUMMARY.md`) — and how does it map to `SUMMARY.hd` (a nested Markdown list of links)?
- Where do **assets** live, and how do pages reference them? (This drives the per-page `.hd/<id>/` relocation — the part most likely to be done wrong.)

## Frontmatter
- How does the source carry `title` / `description` / other metadata, and how does it map to HD frontmatter?
- (Engine always adds `version: 2` and a generated `id`.)

## Text artifacts
- Any source-specific escaping or noise to clean up. Keep output as literal Markdown text, not HTML entities.

## Block & inline
- Heading / emphasis / list / code-fence conventions. If the source is already Markdown, most of this **carries over verbatim** — note only the non-standard inline syntax that needs mapping.

## Source constructs → HD
Map each special construct to its HD (v2) equivalent — Markdown where possible, an allowed island otherwise. Common cases:
- Callouts / admonitions (e.g. Docusaurus `:::note … :::`) → a **GitHub-style alert** (`> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]`). Never `<aside class="hint">` — it renders unstyled.
- Embeds / video / iframes / players → a labelled Markdown link (`[Title](url)`) — HD forbids `<iframe>`/`<video>`/`<audio>`.
- Custom components / shortcodes / MDX JSX → the closest semantic Markdown or allowed island, or drop with the content preserved.
- Tabs / accordions → `##`/`###` heading sections, or a `<details>`/`<summary>` island.

| Source construct | HD output |
| --- | --- |
| … | … |

## Tables
- How tables are written; any embedded HTML or width metadata to normalize. Rectangular + inline-only → GFM pipe table; `colspan`/`rowspan` or block cells → whole-table HTML island.

## Assets — the part to get right
Spell out, for this source:
1. How a page reference resolves to a file in the source asset store.
2. That each referenced file is **copied into the page's `.hd/<id>/` folder** under a bare name, and the reference rewritten to that bare filename (`![alt](name.ext)`, or an `<img>` island when sized) — never a path, never a shared folder.
3. That assets shared by multiple pages are duplicated into each consuming page's folder.

## Known quirks
- Source-specific gotchas with no clean HD equivalent (footnotes, etc.) and how to degrade them gracefully. (GFM task lists carry over as `- [ ]`/`- [x]`.)
