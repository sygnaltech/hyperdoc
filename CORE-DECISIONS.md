# Core Decisions

Six critical design decisions for the `.hd` format and VS Code extension. Each will be discussed individually and a decision recorded under the item.

---

## 1. Body-only HTML is well-trodden ground

Every modern WYSIWYG — TipTap, ProseMirror, Lexical, Slate — operates on document fragments, not full HTML pages. The existing Sygnal MCP already enforces exactly this convention ("inner body content only — no `<html>`/`<head>`/`<body>`/`<style>`/`<script>`"). The format choice is sound and there's a mature library ecosystem to draw from.

**Decision:** Yep this is the point. 

---

## 2. The `.hd` extension carries a real cost

VS Code can be told `.hd` is HTML, but ripgrep, GitHub's file viewer, git diff renderers, and downstream tools (Notion, Linear) won't. Every consumer needs explicit handling. The benefit is unambiguous semantics + no clash with existing `.html` handlers. Worth deciding deliberately whether that's worth more than `.html` + a CustomEditor activation rule.

**Decision:** _TBD_

---

## 3. Markdown round-tripping is the central design tension

Markdown can't express colspan, merged cells, inline styles, multi-paragraph cells, or arbitrary HTML attributes. We have to pick a stance early because it shapes the editor's allowed nodes:

- **(a) `.hd` is authoritative**; markdown is a lossy convenience for paste/copy. More expressive, harder to predict round-trips.
- **(b) Constrain `.hd` to a "markdown-safe subset"** that round-trips losslessly. More predictable for users coming from markdown/Notion, but defeats some of the point.

**Decision:** _TBD_

---

## 4. TipTap is probably the right editor

TypeScript-first, mature table extension (with colspan/merge/resize), strong paste-from-HTML handling, MIT, used by GitLab/Linear. The alternative is raw ProseMirror — more control, much more work. Quill and Lexical are weaker on tables.

**Decision:** _TBD_

---

## 5. Asset convention should land in the spec, not be deferred

Typora uses `<docname>.assets/` siblings, Obsidian uses `_attachments/`. Relative paths keep docs portable. Open questions worth nailing:

- Where does paste-clipboard-image go?
- Does dragging an image copy or reference?
- What happens to assets when a doc is renamed?

**Decision:** _TBD_

---

## 6. Define the "preamble" up front

Markdown has YAML frontmatter as a near-universal convention (title, tags, date). HTML body-only has no native equivalent. Either a leading HTML comment block or a `<header data-frontmatter>…</header>` first child. This affects how external tools — and you — parse `.hd` files.

**Decision:** _TBD_
