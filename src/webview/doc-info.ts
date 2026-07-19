import type { Bridge, DocInfo } from './bridge';

/**
 * The document-info / diagnostics popover. Opened from the right-hand info
 * button in the toolbar. Shows format version, id, frontmatter, and the
 * document's asset folder + contents, with reveal-in-explorer links.
 *
 * It's diagnostics-only: nothing here mutates the document.
 */

let panel: HTMLElement | null = null;
let anchorEl: HTMLElement | null = null;

export function toggleDocInfo(bridge: Bridge, anchor: HTMLElement): void {
  if (panel) {
    close();
    return;
  }
  void open(bridge, anchor);
}

async function open(bridge: Bridge, anchor: HTMLElement): Promise<void> {
  anchorEl = anchor;
  let info: DocInfo | null = null;
  let error: string | null = null;
  try {
    info = await bridge.requestDocInfo();
  } catch (err) {
    error = String(err);
  }
  // A second click while the request was in flight may have closed us.
  if (anchorEl !== anchor) return;
  if (panel) close();

  panel = build(info, error, bridge);
  document.body.appendChild(panel);
  position(panel, anchor);

  // Defer wiring the outside-click listener so the click that opened the panel
  // doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
  });
}

function close(): void {
  if (!panel) return;
  panel.remove();
  panel = null;
  anchorEl = null;
  document.removeEventListener('mousedown', onOutside, true);
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('resize', onReposition);
  window.removeEventListener('scroll', onReposition, true);
}

function onOutside(e: MouseEvent): void {
  const t = e.target as Node | null;
  if (!t) return;
  if (panel?.contains(t)) return;
  if (anchorEl?.contains(t)) return; // the toggle button handles its own click
  close();
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

function onReposition(): void {
  if (panel && anchorEl) position(panel, anchorEl);
}

function position(el: HTMLElement, anchor: HTMLElement): void {
  const r = anchor.getBoundingClientRect();
  el.style.top = `${Math.round(r.bottom + 6)}px`;
  // Right-align the panel to the button's right edge, clamped to the viewport.
  const right = Math.max(8, Math.round(window.innerWidth - r.right));
  el.style.right = `${right}px`;
}

function build(info: DocInfo | null, error: string | null, bridge: Bridge): HTMLElement {
  const el = document.createElement('div');
  el.className = 'hd-info-popover';

  const header = document.createElement('div');
  header.className = 'hd-info-title';
  header.textContent = 'Document info';
  el.appendChild(header);

  if (error || !info) {
    const err = document.createElement('div');
    err.className = 'hd-info-empty';
    err.textContent = error ? `Couldn't load document info: ${error}` : 'No document info available.';
    el.appendChild(err);
    return el;
  }

  // Document
  el.appendChild(
    section('Document', [
      row('File', info.fileName),
      row('Path', info.relPath)
    ])
  );

  // Format
  const versionLabel =
    info.onDisk === 'markdown'
      ? `2 · Markdown-primary`
      : `1 · body-only HTML (legacy)`;
  const extNote = info.ext === 'hd2' ? '.hd2 (deprecated alias)' : '.hd';
  el.appendChild(
    section('Format', [
      row('Version', versionLabel),
      row('Extension', extNote),
      row('Id', info.id ?? '— none —')
    ])
  );

  // Frontmatter (everything except id/version, already shown above)
  const fmKeys = Object.keys(info.meta).filter((k) => k !== 'id' && k !== 'version');
  if (fmKeys.length) {
    el.appendChild(section('Frontmatter', fmKeys.map((k) => row(k, formatMetaValue(info.meta[k])))));
  }

  // Assets
  el.appendChild(buildAssets(info, bridge));

  return el;
}

function buildAssets(info: DocInfo, bridge: Bridge): HTMLElement {
  const sec = document.createElement('div');
  sec.className = 'hd-info-section';

  const title = document.createElement('div');
  title.className = 'hd-info-section-title';
  title.textContent = 'Assets';
  sec.appendChild(title);

  const af = info.assetFolder;
  if (!af) {
    const empty = document.createElement('div');
    empty.className = 'hd-info-empty';
    empty.textContent = info.id
      ? 'No workspace folder — asset location unavailable.'
      : 'No id in frontmatter, so this document has no asset folder.';
    sec.appendChild(empty);
    return sec;
  }

  // Folder path + reveal link
  const folderRow = document.createElement('div');
  folderRow.className = 'hd-info-row';
  const fk = document.createElement('span');
  fk.className = 'hd-info-key';
  fk.textContent = 'Folder';
  const fv = document.createElement('span');
  fv.className = 'hd-info-val';
  const layoutSuffix = af.layout === 'legacy' ? ' (legacy layout)' : af.layout === 'none' ? ' (not created yet)' : '';
  if (af.exists) {
    const link = document.createElement('span');
    link.className = 'hd-info-link';
    link.textContent = af.path;
    link.title = 'Reveal folder in File Explorer';
    link.addEventListener('click', () => bridge.revealAssetFolder());
    fv.appendChild(link);
  } else {
    fv.textContent = af.path + layoutSuffix;
  }
  folderRow.appendChild(fk);
  folderRow.appendChild(fv);
  sec.appendChild(folderRow);

  if (af.layout === 'legacy') {
    const note = document.createElement('div');
    note.className = 'hd-info-note';
    note.textContent = 'Uses the legacy mirrored asset layout. Run “HD: Migrate Workspace Assets to Flat Layout” to update.';
    sec.appendChild(note);
  }

  // Asset list
  if (!af.exists || af.assets.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hd-info-empty';
    empty.textContent = af.exists ? 'Folder is empty.' : 'No asset folder on disk yet.';
    sec.appendChild(empty);
    return sec;
  }

  const count = document.createElement('div');
  count.className = 'hd-info-note';
  count.textContent = `${af.assets.length} file${af.assets.length === 1 ? '' : 's'}`;
  sec.appendChild(count);

  const list = document.createElement('ul');
  list.className = 'hd-info-assets';
  for (const a of af.assets) {
    const li = document.createElement('li');
    li.className = 'hd-info-asset';
    li.title = 'Reveal in File Explorer';
    const name = document.createElement('span');
    name.className = 'hd-info-asset-name';
    name.textContent = a.name;
    const size = document.createElement('span');
    size.className = 'hd-info-asset-size';
    size.textContent = formatBytes(a.size);
    li.appendChild(name);
    li.appendChild(size);
    li.addEventListener('click', () => bridge.revealAsset(a.name));
    list.appendChild(li);
  }
  sec.appendChild(list);

  return sec;
}

function section(titleText: string, rows: HTMLElement[]): HTMLElement {
  const sec = document.createElement('div');
  sec.className = 'hd-info-section';
  const title = document.createElement('div');
  title.className = 'hd-info-section-title';
  title.textContent = titleText;
  sec.appendChild(title);
  for (const r of rows) sec.appendChild(r);
  return sec;
}

function row(key: string, value: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'hd-info-row';
  const k = document.createElement('span');
  k.className = 'hd-info-key';
  k.textContent = key;
  const v = document.createElement('span');
  v.className = 'hd-info-val';
  v.textContent = value;
  el.appendChild(k);
  el.appendChild(v);
  return el;
}

function formatMetaValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ');
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function formatBytes(n: number): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const val = n / Math.pow(1024, i);
  return `${i === 0 ? val : val.toFixed(val < 10 ? 1 : 0)} ${units[i]}`;
}
