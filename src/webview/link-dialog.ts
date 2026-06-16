import type { Bridge, LinkOption } from './bridge';

export interface LinkDialogResult {
  href: string;
}

interface ShowOptions {
  initialHref?: string;
}

export async function showLinkDialog(
  bridge: Bridge,
  opts: ShowOptions = {}
): Promise<LinkDialogResult | null> {
  const optionsPromise = bridge.requestLinkOptions().catch(() => ({
    options: [] as LinkOption[],
    publishRoot: null as string | null
  }));

  return new Promise<LinkDialogResult | null>((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'hd-link-backdrop';

    const card = document.createElement('div');
    card.className = 'hd-link-dialog';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Insert or edit link');

    card.innerHTML = `
      <div class="hd-link-header">Link</div>
      <label class="hd-link-label" for="hd-link-url">URL</label>
      <input id="hd-link-url" class="hd-link-input"
             type="text" autocomplete="off" spellcheck="false"
             placeholder="https://example.com or ./other-doc.hd" />
      <div class="hd-link-hint">Paste a full URL, type a relative path, or pick a document below.</div>
      <div class="hd-link-picker">
        <input class="hd-link-filter" type="text" placeholder="Filter documents…" />
        <div class="hd-link-list" role="listbox" aria-label="HD documents in publish group"></div>
        <div class="hd-link-root"></div>
      </div>
      <div class="hd-link-actions">
        <button type="button" class="hd-link-cancel">Cancel</button>
        <button type="button" class="hd-link-ok">OK</button>
      </div>
    `;

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    const urlInput = card.querySelector('.hd-link-input') as HTMLInputElement;
    const filterInput = card.querySelector('.hd-link-filter') as HTMLInputElement;
    const listEl = card.querySelector('.hd-link-list') as HTMLDivElement;
    const rootEl = card.querySelector('.hd-link-root') as HTMLDivElement;
    const okBtn = card.querySelector('.hd-link-ok') as HTMLButtonElement;
    const cancelBtn = card.querySelector('.hd-link-cancel') as HTMLButtonElement;

    urlInput.value = opts.initialHref ?? '';

    let activeIndex = -1;

    const close = (result: LinkDialogResult | null) => {
      document.removeEventListener('keydown', onKeyDown, true);
      backdrop.remove();
      resolve(result);
    };

    const submit = () => {
      const href = urlInput.value.trim();
      if (!href) {
        close(null);
        return;
      }
      close({ href });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(null);
      } else if (e.key === 'Enter' && document.activeElement !== filterInput) {
        e.preventDefault();
        e.stopPropagation();
        submit();
      } else if (e.key === 'Enter' && document.activeElement === filterInput) {
        e.preventDefault();
        const visible = visibleItems();
        if (visible.length > 0) {
          const pick = activeIndex >= 0 && activeIndex < visible.length ? visible[activeIndex] : visible[0];
          chooseOption(pick.dataset.href as string);
        }
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && document.activeElement === filterInput) {
        e.preventDefault();
        const visible = visibleItems();
        if (visible.length === 0) return;
        if (e.key === 'ArrowDown') activeIndex = (activeIndex + 1) % visible.length;
        else activeIndex = activeIndex <= 0 ? visible.length - 1 : activeIndex - 1;
        applyActive(visible);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) close(null);
    });

    cancelBtn.addEventListener('click', () => close(null));
    okBtn.addEventListener('click', submit);

    const visibleItems = (): HTMLElement[] =>
      Array.from(listEl.querySelectorAll<HTMLElement>('.hd-link-item:not(.hidden)'));

    const applyActive = (items: HTMLElement[]) => {
      items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
      if (activeIndex >= 0 && items[activeIndex]) {
        items[activeIndex].scrollIntoView({ block: 'nearest' });
      }
    };

    const chooseOption = (href: string) => {
      urlInput.value = href;
      submit();
    };

    const renderList = (options: LinkOption[]) => {
      listEl.innerHTML = '';
      if (options.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'hd-link-empty';
        empty.textContent = 'No .hd documents found in the publish group.';
        listEl.appendChild(empty);
        return;
      }
      for (const opt of options) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'hd-link-item';
        item.dataset.href = opt.relativePath;
        item.dataset.search = (
          (opt.title ?? '') + ' ' + opt.fileName + ' ' + opt.relativePath
        ).toLowerCase();
        const title = document.createElement('div');
        title.className = 'hd-link-item-title';
        title.textContent = opt.title || opt.fileName;
        const sub = document.createElement('div');
        sub.className = 'hd-link-item-sub';
        sub.textContent = opt.relativePath;
        item.appendChild(title);
        item.appendChild(sub);
        item.addEventListener('mousedown', (e) => e.preventDefault());
        item.addEventListener('click', () => chooseOption(opt.relativePath));
        listEl.appendChild(item);
      }
    };

    const applyFilter = () => {
      const q = filterInput.value.trim().toLowerCase();
      const items = Array.from(listEl.querySelectorAll<HTMLElement>('.hd-link-item'));
      let anyVisible = false;
      for (const item of items) {
        const hay = item.dataset.search ?? '';
        const match = q === '' || hay.includes(q);
        item.classList.toggle('hidden', !match);
        if (match) anyVisible = true;
      }
      activeIndex = anyVisible ? 0 : -1;
      applyActive(visibleItems());
    };

    filterInput.addEventListener('input', applyFilter);

    listEl.innerHTML = '<div class="hd-link-loading">Loading documents…</div>';

    void optionsPromise.then(({ options, publishRoot }) => {
      renderList(options);
      if (publishRoot) {
        rootEl.textContent = `Publish group: ${publishRoot}`;
      } else {
        rootEl.textContent = 'No hd-sync.json found above this document — only external/manual links available.';
      }
      applyFilter();
    });

    setTimeout(() => urlInput.focus(), 0);
    if (urlInput.value) urlInput.select();
  });
}
