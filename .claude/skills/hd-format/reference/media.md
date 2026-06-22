# HD Media — images, sizing, and figures

Detailed rules for `<img>`, image sizing/constraints, and `<figure>`/`<figcaption>` in `.hd` documents. Load this file whenever a doc you are authoring or editing contains images or figures. The parent [SKILL.md](../SKILL.md) has the one-paragraph summary; this file is the authority.

## 1. Asset folders and the document `id`

**Images are not stored next to the `.hd` file and are not referenced with relative paths.** They live in a sidecar folder keyed by the document's `id`, at the workspace root:

```
<workspace>/
├── docs/
│   └── architecture.hd        ← id: 7gXk2L9pM4nQ8vR1cT3bDe
└── .hd/
    └── 7gXk2L9pM4nQ8vR1cT3bDe/
        ├── hero.png
        └── diagram.svg
```

The id is the entire lookup key — no document-path mirroring. Rules:

1. **`<img src=>` must be a bare filename.** `<img src="hero.png">` resolves to `<workspace>/.hd/<id>/hero.png`. **Never** use subfolders, dot-paths, or workspace-relative paths like `img/hero.png`, `./hero.png`, or `../assets/hero.png` — the editor will not find the file and the published output will be broken.
2. **A doc with media must have its `id` set in frontmatter.** If you are authoring a new doc and also creating its images, generate a 22-char base62 id yourself (don't rely on auto-generation — you need the value *now* to know where to put the files).
3. **Create `<workspace>/.hd/<id>/` before placing files.** Then write images into it with whatever filenames you reference from the body.
4. **Inline SVG is fine** — `<svg>...</svg>` lives inside the body, not in a file. The asset-folder rule applies only to `<img>` references.

Example workflow when adding a new doc with images:

```
1. Generate a fresh id (see Generating an id below)
2. mkdir <workspace>/.hd/<id>/
3. Put hero.png into <workspace>/.hd/<id>/
4. Write the .hd file with `id: <that-same-id>` in frontmatter
5. Reference the image as <img src="hero.png" alt="...">
```

### Generating an id

An HD id is 22 characters of base62 (alphabet `0-9a-zA-Z`) encoding 128 bits of entropy. **Do not hand-author one.** The editor's algorithm lives in `src/identity/base62.ts`; the same algorithm is exposed as a script and as a portable shell one-liner.

**If the hd plugin is checked out** (most common — the `plugin/hd/` directory exists somewhere reachable):

```bash
node plugin/hd/scripts/new-id.mjs        # one id
node plugin/hd/scripts/new-id.mjs 5      # five ids, one per line
```

**Fallback when the plugin isn't local** (any environment with Node):

```bash
node -e "const c=require('crypto');const A='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';let b=0n;for(const x of c.randomBytes(16))b=(b<<8n)|BigInt(x);let s='';while(b>0n){s=A[Number(b%62n)]+s;b=b/62n;}while(s.length<22)s=A[0]+s;console.log(s)"
```

Either approach prints an id like `7gXk2L9pM4nQ8vR1cT3bDe`. Drop it directly into `id:` in the frontmatter.

What you must *never* do:

- Use a UUID (`550e8400-e29b-…`) — wrong format, wrong length, contains hyphens not in the alphabet.
- Use a nanoid with a non-base62 alphabet.
- Hand-type something like `my-doc-id-2026` — the editor validates against `^[0-9a-zA-Z]{22}$` and will treat anything else as missing and regenerate it on open, orphaning any asset folder you created.

### Legacy mirrored layout (read-only fallback)

An earlier version of HD nested asset folders under the document's path, producing `.hd/docs/architecture/<id>/...`. The editor still resolves images from that location as a fallback if the flat path doesn't exist, but new content should always be placed at `.hd/<id>/`. Workspaces still on the legacy layout can be migrated with `node plugin/hd/scripts/migrate-assets-flat.mjs <workspace>` (dry-run by default; pass `--apply` to perform moves) or via the `HD: Migrate Workspace Assets to Flat Layout` command in VS Code.

## 2. Sizing and constraining images

**Express image size as inline CSS in the `style` attribute, not the HTML `width`/`height` attributes.** Only CSS can express *maximum* constraints, and the `style` attribute is what the editor models and round-trips reliably.

Three properties are first-class — the editor reads and writes exactly these:

| Property     | Effect                                              | Typical use |
|--------------|-----------------------------------------------------|-------------|
| `width`      | Sets a fixed display width (height follows, ratio kept) | Pin a logo/diagram to an exact size |
| `max-width`  | Caps width; image shrinks on narrow viewports        | Stop a large screenshot dominating the column |
| `max-height` | Caps height; **the key control for tall images**     | Keep portrait mobile screenshots readable |

Values are CSS lengths or percentages: `480px`, `60%`, `24em`. (The in-editor configurator also accepts a bare number and treats it as pixels.)

```html
<!-- A diagram pinned to 480px wide -->
<img src="architecture.png" alt="System architecture" style="width: 480px">

<!-- A wide screenshot that never overflows but won't upscale past 720px -->
<img src="dashboard.png" alt="Analytics dashboard" style="max-width: 720px">

<!-- A tall mobile screenshot capped to 600px tall -->
<img src="mobile-nav.png" alt="Mobile navigation, expanded" style="max-height: 600px">
```

Notes and guardrails:

- **Don't set an explicit `height`.** Leave height to flow from width (the editor applies `height: auto`), so aspect ratio is preserved. Use `max-height` to constrain tall images instead.
- **`max-width: 100%` is already the default** for every image (base stylesheet), so images never overflow their column. You only need `max-width` to impose a *tighter* cap than the column.
- You may combine properties, e.g. `style="max-width: 100%; max-height: 600px"`.
- Other inline CSS (e.g. `border`, `border-radius`) is preserved on round-trip, but only `width`/`max-width`/`max-height` have dedicated editor controls.

### Alignment

Alignment is expressed as inline CSS, but with a different mechanism for images versus figures (the editor owns the `display`, `margin-left`, `margin-right`, and `text-align` declarations for this purpose — don't also set them by hand as sizing).

- **A bare image** aligns via `display: block` plus auto margins:

  ```html
  <img src="logo.png" alt="Acme logo" style="display: block; margin-left: auto; margin-right: auto">   <!-- center -->
  <img src="logo.png" alt="Acme logo" style="display: block; margin-left: auto; margin-right: 0">      <!-- right -->
  ```

  Left = `margin-left: 0; margin-right: auto`. With no alignment set, an image sits inline at the start of its line (the document default).

- **A figure** aligns via `text-align` on the `<figure>` itself, so the image and its caption move together:

  ```html
  <figure style="text-align: right">
    <img src="diagram.png" alt="Data flow" style="max-width: 400px">
    <figcaption>Right-aligned figure.</figcaption>
  </figure>
  ```

  Figures default to centered. Combine freely with sizing — sizing goes on the `<img>`, alignment on the `<figure>`.

### Alt text

Set a meaningful `alt` on every content image — it is the accessible description and the fallback when the image can't load. For a figure, `alt` lives on the inner `<img>`; it serves a different purpose from `<figcaption>` (the visible label), so don't just duplicate one into the other. Use `alt=""` (empty) only for purely decorative images.

### Pattern: a responsiveness / device-screenshot report

Reports full of portrait mobile screenshots are the motivating case. Without a constraint, each phone screenshot renders at full height and dwarfs the surrounding prose. Cap every screenshot's height so the report stays scannable:

```html
<figure style="max-height: 640px">
  <img src="iphone-15-home.png" alt="Home screen on iPhone 15" style="max-height: 640px">
  <figcaption>iPhone 15 — home, 393×852</figcaption>
</figure>
```

Apply the same `max-height` to each device shot for a consistent rhythm. `max-height` on the image is what does the work; see figures below for the caption.

## 3. Figures and captions

Use a `<figure>` when an image needs a **caption** or when you want to treat image + caption as a single titled unit (galleries, device-screenshot grids, labelled diagrams). Structure:

```html
<figure>
  <img src="flow.png" alt="Checkout flow" style="max-width: 640px">
  <figcaption>Figure 1. The three-step checkout flow.</figcaption>
</figure>
```

Rules:

- A figure contains **exactly one `<img>`** followed by an optional `<figcaption>`. The editor models this shape directly: the image is sized via the same `style` properties as a bare image, and the caption is editable inline.
- Put sizing `style` on the **`<img>`** (the editor renders the image from the figure's stored attributes). A `style` on the `<figure>` itself is allowed but the image's own `style` is what the configurator edits.
- Keep captions short and descriptive. `alt` (for accessibility) and `figcaption` (visible label) serve different purposes — set both; don't duplicate one into the other verbatim unless that genuinely reads well.
- Figures are kept as **raw HTML** when a doc is exported to Markdown — they survive verbatim rather than being downgraded.

## 4. Configuring media in the editor (for humans)

When editing a `.hd` file in the HD VS Code editor:

- **Right-click an image or figure → "Image settings…" / "Figure settings…"** opens a small popover with Alt text, Width / Max width / Max height, and Alignment (None/Left/Center/Right). Changes apply live; **Clear** resets every field.
- **Right-click an image → "Add caption (wrap in figure)"** converts a bare image into a figure with an empty, editable caption. The reverse is **"Remove caption (unwrap figure)"** on a figure.

This right-click → configurator popover is the general HD pattern for specialized per-element settings; expect it to grow to other elements over time.
