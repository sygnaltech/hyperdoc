# Source recipe: GitBook → HD

How to convert a GitBook space (Markdown + `.gitbook/` scaffolding) into HD. Read this alongside the engine in `../SKILL.md` and the output rules in the `hd-format` skill. This file covers only **how GitBook represents things**; the engine covers ids, asset relocation, verification, and nav.

> [!IMPORTANT]
> The target is **Markdown-primary HD (v2)**. GitBook source is already Markdown, so most of it **stays Markdown unchanged** — the job is cleaning GitBook-specific noise and converting its `{% … %}` constructs, not re-encoding prose as HTML.

## Source layout
- Pages are `.md` files; folder indexes are `README.md` → `README.hd`.
- Nav/TOC is `SUMMARY.md` (nested bullet list of `[label](path.md)`). Rebuild it as `SUMMARY.hd` (nested Markdown list).
- Assets live in a shared `.gitbook/assets/` pool, referenced by relative paths like `../../.gitbook/assets/NAME`. **These must be relocated per-page** — see Assets below.

## Frontmatter
- `title:` — from the first `# H1`, with trailing status emoji/markers (✅ ⏸️ 🟢 🧪 📗 📘 🔵) and `&#x20;` artifacts removed. Quote if it contains a colon.
- `description:` — copy verbatim only if the source frontmatter had one.
- Always add `version: 2` and the generated `id:` (see engine step 3.1).

## Text artifacts (GitBook-specific noise)
- `&#x20;` — a GitBook trailing-space artifact. **Delete it** and collapse the resulting trailing whitespace.
- Unescape backslash-escaped Markdown punctuation that GitBook over-escaped: `R\&D` → `R&D`, `API\_KEY` → `API_KEY`, `\<head>` → `` `<head>` `` (or escape as needed so it renders literally). Since the target is Markdown, keep punctuation as literal text — don't convert to HTML entities.

## Block & inline — keep as Markdown
GitBook's body is GFM; **leave it as Markdown**. Do not convert to HTML.
- `#`..`######`, paragraphs, `---`, `**bold**`, `*italic*`/`_italic_`, `` `code` ``, `~~strike~~`, `-`/`*`/`1.` lists (preserve nesting), and ```` ```lang ```` fenced code all carry over **verbatim**.
- Fenced code keeps its info string (` ```js `). Content inside a fence is literal text — a fence containing `<script>`/`<style>` is fine as-is; it is not a live element.
- Only promote to an HTML island where Markdown can't express the thing (see the constructs and tables below, and hd-format's boundary).

## Links
- `[text](target.md)` → `[text](target.hd)`; `[text](dir/)` → `[text](dir/README.hd)`; keep `#anchors`.
- External `http(s)` links stay plain Markdown `[text](url)` — Markdown carries no `target`/`rel`, so drop any GitBook-added attributes.

## GitBook constructs → HD

| GitBook | HD (v2) |
| --- | --- |
| `{% hint style="info" %}…{% endhint %}` | `> [!NOTE]` alert — convert the inner Markdown with these same rules |
| `{% hint style="success" %}` | `> [!TIP]` |
| `{% hint style="warning" %}` | `> [!WARNING]` |
| `{% hint style="danger" %}` | `> [!CAUTION]` |
| `{% embed url="URL" %}` (and bare embed links) | a labelled Markdown link on its own line — `[URL](URL)` — HD forbids `<iframe>` |
| `<mark style="color:$X;">text</mark>` | `<mark>text</mark>` island (strip the `color:` style); GitBook color is not carried |
| `{% tabs %}/{% tab %}` | flatten each tab to an `## H2`/`### H3` section with the tab title as the heading |
| `{% code … %}` wrapper | drop the wrapper, keep the inner fenced code block |
| `<details>/<summary>` | keep as-is (HD allows the `details`/`summary` island) |

> Callouts are the common case and the easy one to get wrong: use a **GitHub-style alert** (`> [!NOTE]`), never an `<aside class="hint">` island — hd-format renders `aside` unstyled, whereas the alert is the callout primitive it actually styles. Only the five alert types (`NOTE`/`TIP`/`IMPORTANT`/`WARNING`/`CAUTION`) are recognised.

## Tables
GitBook tables are often Markdown tables, but cells may contain raw HTML (`<ul><li>`, `<p>`, `<br>`, `<mark>`).
- If a table is rectangular, has a header row, single-span cells, and inline-only content → keep it as a **GFM pipe table**.
- If any cell needs `colspan`/`rowspan`, block/multi-paragraph content, or the table is non-rectangular → emit the **whole table as an HTML island** (`<table><thead>…</tbody></table>`), preserving in-cell markup.
- Drop GitBook column-width attributes and fully-empty trailing rows.
- "Card" tables (`data-view="cards"`, hidden cover/content-ref columns) → flatten to a plain table with sensible headers; treat the cover-image column as optional.

## Assets — THE correction

In GitBook a single asset in `.gitbook/assets/` is shared across pages and referenced by a relative path. **Managed HD does not work this way.** For each figure/image a page references:

1. Resolve the source file in `.gitbook/assets/` (e.g. `../../.gitbook/assets/image (37).png`).
2. **Copy it into that page's `.hd/<id>/` folder** under a bare filename (keep or simplify the name; avoid spaces/parens where easy, e.g. `image-37.png`).
3. Rewrite the reference to the **bare filename only**:
   - Plain image → `![ALT](image-37.png)`.
   - Needs a caption → a `<figure>` island: `<figure><img src="image-37.png" alt="ALT"><figcaption>…</figcaption></figure>`.
   - Never emit `../../.gitbook/assets/...`, never point multiple pages at one shared copy.
4. If the same source asset is used by several pages, copy it into **each** page's folder.
5. Only wrap in `<figure>` when there is real caption text; a plain image is just `![alt](name.png)`.
6. `<img class="gitbook-drawing">` (excalidraw SVGs) → drop the non-HD class, relocate the SVG like any other asset, and reference it as an image (wrap in `<figure>` only if captioned).

After all pages convert and assets are confirmed relocated, the old `.gitbook/` folder can be deleted.

## Known GitBook quirks
- Footnotes (`[^1]`) have no HD equivalent — inline the footnote text where it was referenced and drop the definition block.
- GitBook task-list bullets carry over as GFM task lists (`- [ ]` / `- [x]`), which hd-format supports directly — keep them as Markdown.
- Preserve genuine source typos/truncated sentences as authored; do not silently "fix" content.
