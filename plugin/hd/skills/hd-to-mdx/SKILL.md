---
name: hd-to-mdx
description: Conversion rules for the `nextra4` destination type used by the `/hd:sync` slash command. Load when authoring .hd files in a repo that has hd-sync.json with a nextra4 destination, when reviewing sync output, when the converter emits warnings that need human judgment, or when adding a new destination type to the plugin.
---

# HD → external platform sync

The `/hd:sync` slash command publishes `.hd` source files to one or more
external documentation platforms. This skill documents the architecture, the
`hd-sync.json` config shape, what the `nextra4` converter does (and doesn't
do), and how to add new destination types.

## Architecture

```
plugin/hd/
├── commands/sync.md             /hd:sync — interactive entry point
├── scripts/
│   ├── convert.mjs              orchestrator: parses CLI, dispatches
│   ├── lib/
│   │   ├── discover.mjs         find + load + validate hd-sync.json
│   │   └── source.mjs           read .hd files, frontmatter, body
│   └── converters/
│       └── nextra4.mjs          Nextra 4 MDX converter (only one for now)
```

The slash command's contract:

1. Run `node convert.mjs --list` to discover every `hd-sync.json` under CWD.
2. If multiple configs or destinations, ask the user to pick.
3. Run `node convert.mjs --config <path> --dest "<name>"`.

The orchestrator looks up `destination.type` in a converter registry and
dispatches. Each converter is a self-contained module exporting `convert()`.

## `hd-sync.json` schema

Lives in the directory of `.hd` files being synced. One file = one source
directory.

```json
{
  "destinations": [
    {
      "name": "nextra 4",
      "type": "nextra4",
      "description": "Public docs site.",
      "path": "../../../Docs/hd-docs",
      "contentDir": "src/content",
      "publicDir": "public",
      "assetMap": [
        { "from": "images", "to": "public/images" }
      ],
      "meta": {
        "index": { "title": "Overview", "theme": { "breadcrumb": false } },
        "page-slug": "Display Title"
      }
    }
  ]
}
```

Common fields (every destination):

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | Unique label within this config. Shown in the picker. |
| `type` | yes | Converter key. Currently: `nextra4`. |
| `path` | yes | Path to target project root. Resolved relative to the config file. |
| `description` | no | One-line description shown in the picker. |
| `routePrefix` | no | String prepended to internal link URLs and asset folder paths. Required when multiple HD projects publish into the same target repo. Leading/trailing slashes are stripped. |
| `deleteOrphans` | no | `true` \| `false` \| `"warn"` (default `"warn"`). When `true`, deletes stale `.mdx` from `contentDir` and (if `routePrefix` is set) stale asset folders from `publicDir/assets/<routePrefix>/`. |

Type-specific fields are owned by each converter and documented in its
section below.

## `nextra4` converter

**What it does (deterministic):**

1. Read every `.hd` in the config's source dir; parse YAML frontmatter; drop
   HD-only fields (`id`, `version`); keep `title`, `description`, `date`,
   `author`, `tags`.
2. Rewrite the body HTML:
   - `href="foo.hd"` → `href="/foo"` (or `/<routePrefix>/foo` when set).
   - `href="foo.hd#anchor"` → `href="/foo#anchor"` (prefix applied if set).
   - `href="../foo.hd"` and `href="../foo.md"` → left unchanged, flagged as
     external-repo warnings.
   - Per-doc asset references (`<img src="image-1.png">` with a matching
     `.hd/<docDir>/<id>/` folder) → `/assets/<slug>/image-1.png`, or
     `/assets/<routePrefix>/<slug>/image-1.png` when prefix is set.
   - `src="<assetMap.from>/..."` rewritten per `assetMap` to `/`-rooted paths
     under `public/`.
3. Run `turndown` with the `gfm` plugin on the rewritten HTML. Simple tables
   become GFM tables; `<pre><code class="language-X">` becomes a fenced code
   block with the language hint.
4. Write each result to `<target>/<contentDir>/<slug>.mdx`.
5. Copy per-doc assets to `publicDir/assets/[<routePrefix>/]<slug>/`.
6. Copy bulk assets per `assetMap` entries.
7. Write `_meta.js` from the `meta` block.
8. Reconcile orphans according to `deleteOrphans`:
   - `"warn"` (default): list orphan `.mdx` (and orphan asset folders when
     `routePrefix` is set) as warnings.
   - `true`: delete orphan `.mdx` from `contentDir`; if `routePrefix` is set,
     also delete orphan asset folders under `publicDir/assets/<routePrefix>/`.
     Without `routePrefix`, asset cleanup is skipped with a warning because
     `publicDir/assets/` is a shared namespace.
   - `false`: silent.

**Type-specific fields:**

| Field | Required | Notes |
| --- | --- | --- |
| `contentDir` | no | Defaults to `src/content`. When sharing a target repo across projects, set this to a per-project sub-folder (e.g. `src/content/projA`). |
| `publicDir` | no | Defaults to `public`. Used to validate asset paths. |
| `assetMap` | no | Array of `{ from, to }`. `from` is relative to the source dir; `to` is relative to the target root. |
| `meta` | no | Written verbatim as `_meta.js` inside `contentDir`. Sidebar order = key order. |

When `contentDir` is a sub-folder of `src/content`, **always set `routePrefix`** to the sub-folder name. Internal `.hd` links rewrite to `/<routePrefix>/<slug>`; without the prefix they would 404 because Nextra routes the page at `/<sub-folder>/<slug>`, not `/<slug>`.

**What it does NOT do:**

- Convert HD tables with multiple paragraphs per cell to `<DataTable>`. They
  pass through as raw HTML in MDX (Nextra accepts that, but the formatting
  isn't as nice). For polished output, hand-edit the MDX after sync — and
  accept that the next sync will overwrite.
- Convert `<blockquote>` to `<Callout>`. No HD construct maps cleanly to
  Callout's variant system. If you specifically want a Callout, hand-edit.
- Delete orphan files in the target unless `deleteOrphans: true` is set.
  Default behavior is warn-only.
- Touch files outside `contentDir` or (when `routePrefix` is set)
  `publicDir/assets/<routePrefix>/`. Orphan cleanup is always scoped to
  these per-project folders — a sync cannot delete another project's files
  even when sharing a target repo.

## Authoring .hd for clean Nextra output

| Goal | Write in HD... | You get in MDX |
| --- | --- | --- |
| Page title | `<h1>Title</h1>` at top of body | `# Title` |
| Section heading | `<h2>`/`<h3>`/... | `##`/`###`/... |
| Bullet list | `<ul><li>...</li></ul>` | `- ...` |
| Numbered list | `<ol><li>...</li></ol>` | `1. ...` |
| Inline code | `<code>foo</code>` | `` `foo` `` |
| Code block | `<pre><code class="language-ts">...</code></pre>` | ` ```ts ... ``` ` |
| Link to another page | `<a href="getting-started.hd">...</a>` | `[...](/getting-started)` |
| Image | `<img src="images/foo.png" alt="...">` with `assetMap` configured | `![...](/images/foo.png)` |
| Simple table | Standard `<table>` with `<thead>`/`<tbody>` | GFM `\|`-table |

## After a sync — what to check

1. **Warnings.** Triage by category:
   - *external .hd reference (outside source dir)*: a `../FOO.hd` link. The
     target is not in the export scope. Decide: move it in, drop the link,
     or rewrite to a GitHub URL.
   - *external repo link not rewritten*: a `../FOO.md` link. Same call.
   - *asset source missing*: an `assetMap` entry pointed at a missing dir.
   - *orphan in target*: leftover `.mdx` from before. Delete manually, or
     flip `deleteOrphans: true` once you've confirmed the warning list is
     correct.
   - *orphan asset folder*: leftover per-doc asset directory. Same call.
   - *asset orphan cleanup skipped: no routePrefix set*: you asked for
     `deleteOrphans: true` but didn't set `routePrefix`. Either add a
     prefix or accept that assets need manual cleanup.
2. **`npm run build`** in the target. Prerender is the only catch-all for
   MDX/JSX compilation errors.
3. **Browse one page.** Confirm layout. If a page needs `<Callout>` or
   `<DataTable>`, edit the MDX directly and remember it'll be overwritten on
   the next sync.

## Adding a new destination type

To add, e.g., `docusaurus`:

1. Create `scripts/converters/docusaurus.mjs` exporting `type = 'docusaurus'`
   and `async function convert({ sources, sourceDir, destination, log })`
   returning `{ converted, assetsCopied, warnings, nextStep }`.
2. Register it in `convert.mjs`'s `CONVERTERS` map:
   ```js
   const CONVERTERS = {
     nextra4: () => import('./converters/nextra4.mjs'),
     docusaurus: () => import('./converters/docusaurus.mjs')
   }
   ```
3. Document its type-specific fields in this skill.
4. No other changes needed — discovery, validation, dispatch, and the slash
   command flow are all generic.

The `sources` argument is an array of `{ file, slug, sourcePath,
frontmatter, body }` already parsed by `lib/source.mjs`. The converter
decides what to do with each — file extension, output layout, sidebar
generation, asset handling — all platform-specific.
