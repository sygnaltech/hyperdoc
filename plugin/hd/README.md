# `hd` Claude plugin

Publish `.hd` documentation (body-only HTML + YAML frontmatter) to external
documentation platforms — Nextra 4 today, with hooks for Docusaurus,
GitBook, etc.

## What's here

```
.claude-plugin/plugin.json      manifest
commands/sync.md                /hd:sync slash command (interactive)
skills/hd-to-mdx/SKILL.md       converter rules + author guidance
scripts/
├── convert.mjs                 orchestrator: parses CLI, dispatches
├── lib/
│   ├── discover.mjs            find + load + validate hd-sync.json
│   └── source.mjs              read .hd files, frontmatter, body
├── converters/
│   └── nextra4.mjs             Nextra 4 MDX converter
└── package.json                isolated deps (gray-matter, turndown, gfm)
```

## One-time setup

```
cd plugin/hd/scripts
npm install
```

The plugin's deps live here — never in the host project or in the
documentation target.

## Per-source config

Each directory you want to publish needs an `hd-sync.json` file inside it
(next to the `.hd` files). The config holds an array of destinations; one
source dir can publish to many platforms at once.

```json
{
  "destinations": [
    {
      "name": "nextra 4",
      "type": "nextra4",
      "description": "Public docs site.",
      "path": "../../Docs/hd-docs",
      "contentDir": "src/content",
      "publicDir": "public",
      "assetMap": [
        { "from": "images", "to": "public/images" }
      ],
      "meta": {
        "index": { "title": "Overview", "theme": { "breadcrumb": false } },
        "getting-started": "Getting Started"
      }
    }
  ]
}
```

Paths in `path` and `assetMap.from` resolve relative to the directory of the
`hd-sync.json` file. `name` must be unique within a config. `type` selects
the converter — currently only `nextra4` is implemented.

See [skills/hd-to-mdx/SKILL.md](skills/hd-to-mdx/SKILL.md) for the full
schema, per-type fields, and instructions for adding a new converter.

## Usage

### Interactive (recommended)

```
/hd:sync
```

The slash command:

1. Searches CWD downward (depth 4) for `hd-sync.json` files.
2. If there's more than one config, asks which one.
3. If the chosen config has more than one destination, asks which one.
4. Runs the converter for that destination's `type` and reports counts +
   warnings.

### Direct CLI

```
node plugin/hd/scripts/convert.mjs                            # list discovered configs
node plugin/hd/scripts/convert.mjs --list                     # same, JSON output
node plugin/hd/scripts/convert.mjs --config <path> --dest "<name>"
```

## What the sync does and doesn't do

- **Does:** convert `.hd` files in the source dir to the destination format,
  copy assets, generate the platform's sidebar/manifest, report warnings.
- **Doesn't:** delete files in the target. Orphan files (in the target with
  no HD source) are flagged but left alone. You decide what to remove.
- **Doesn't:** sync in reverse. HD is source of truth; the target's
  generated files will be overwritten on the next run. Hand-edits in the
  target won't survive.

## After a sync

Run the target platform's build (e.g. `npm run build` in a Nextra project).
Prerender is the only catch-all for MDX/JSX errors that the converter can't
predict.
