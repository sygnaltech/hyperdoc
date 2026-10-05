const COPY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z"/>' +
  '</svg>';

const CHECK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>' +
  '</svg>';

/**
 * One logical line of a code block and the vertical band it actually occupies.
 * `top`/`bottom` are relative to the top of the code box, not the viewport, so a
 * measurement stays valid while the document scrolls.
 */
interface LineBox {
  text: string;
  top: number;
  bottom: number;
}

/**
 * Measures where each logical line of `codeEl` is really drawn.
 *
 * Code blocks wrap (ProseMirror sets `white-space: pre-wrap` on `pre`), so one
 * logical line can occupy several visual rows. Dividing the block's height by
 * the number of logical lines therefore yields a figure that matches nothing on
 * screen, and every line after the first wrapped one is reported in the wrong
 * place. Instead, ask the browser — the thing doing the wrapping — how many rows
 * each line takes, then lay the lines out on the block's uniform row grid.
 */
export function measureLines(codeEl: HTMLElement, codeTop: number): LineBox[] {
  // Walk the text nodes once, recording where each starts in the joined text, so
  // a character offset can be mapped back to a (node, offset) pair. Taking the
  // text from the nodes themselves — rather than from innerText — guarantees the
  // offsets and the content can never disagree.
  const nodes: Text[] = [];
  const starts: number[] = [];
  let joined = '';
  const walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    starts.push(joined.length);
    nodes.push(n as Text);
    joined += (n as Text).data;
  }
  if (!nodes.length) return [];

  const locate = (offset: number): [Text, number] => {
    let lo = 0;
    let hi = nodes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return [nodes[lo], Math.min(offset - starts[lo], nodes[lo].data.length)];
  };

  // Pass 1 — collect the raw text rects for each logical line. A rect is one run
  // of text on one visual row, so a line split across several highlight spans
  // contributes several rects per row; the rows are recovered in pass 2.
  // A block ending in a newline would otherwise yield a phantom trailing line.
  const text = joined.endsWith('\n') ? joined.slice(0, -1) : joined;
  const range = document.createRange();
  const raw: { text: string; rects: { top: number; height: number }[] }[] = [];

  for (let pos = 0; pos <= text.length; ) {
    let end = text.indexOf('\n', pos);
    if (end < 0) end = text.length;

    const [startNode, startOffset] = locate(pos);
    const [endNode, endOffset] = locate(end);
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const rects: { top: number; height: number }[] = [];
    for (const r of Array.from(range.getClientRects())) {
      if (r.height > 0) rects.push({ top: r.top, height: r.height });
    }

    raw.push({ text: text.slice(pos, end).replace(/\r$/, ''), rects });
    pos = end + 1;
  }
  if (!raw.length) return [];

  // The ink height of a row — the rect the browser draws around the glyphs. This
  // is SHORTER than the line box, because it excludes the leading.
  const allHeights = raw.flatMap((r) => r.rects.map((x) => x.height)).sort((a, b) => a - b);
  const inkH = allHeights.length ? allHeights[allHeights.length >> 1] : 0;

  // How many visual rows each line occupies: the number of distinct rect tops,
  // clustered so that a bold or differently-sized span on the same row doesn't
  // read as a row of its own.
  const tol = Math.max(1, inkH * 0.6);
  const rowTops = raw.map((r) => {
    const tops: number[] = [];
    for (const x of r.rects) {
      if (!tops.some((t) => Math.abs(t - x.top) < tol)) tops.push(x.top);
    }
    return tops.sort((a, b) => a - b);
  });
  const rowCounts = rowTops.map((t) => Math.max(1, t.length));

  // Rows are evenly spaced within a code block — one font, one line-height — so
  // derive that spacing from the gaps between consecutive distinct row tops.
  const distinct = Array.from(new Set(rowTops.flat())).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < distinct.length; i++) {
    const g = distinct[i] - distinct[i - 1];
    if (g > tol) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  let pitch = gaps.length ? gaps[gaps.length >> 1] : 0;
  if (!(pitch > 0)) {
    // Single-row block: nothing to derive a pitch from, so ask the style system.
    const cssLh = parseFloat(getComputedStyle(codeEl).lineHeight);
    pitch = Number.isFinite(cssLh) && cssLh > 0 ? cssLh : inkH;
  }
  if (!(pitch > 0)) return [];

  // Anchor the row grid on the first line that actually produced rects. A blank
  // line's own rect cannot be trusted — a collapsed range reports the caret at
  // the end of the preceding row, half a leading too high — but its position is
  // implied by the rows before it, so it never needs to be measured.
  let origin = NaN;
  for (let i = 0, row = 0; i < raw.length; row += rowCounts[i], i++) {
    if (rowTops[i].length) {
      origin = rowTops[i][0] - row * pitch;
      break;
    }
  }
  if (Number.isNaN(origin)) origin = codeTop;

  // Pass 2 — lay the bands out on that grid. Expanding by half the leading makes
  // consecutive bands tile exactly, so the highlight has no seams and a wrapped
  // line's band covers every row it occupies.
  const halfLead = Math.max(0, (pitch - inkH) / 2);
  const boxes: LineBox[] = [];
  for (let i = 0, row = 0; i < raw.length; row += rowCounts[i], i++) {
    const top = origin + row * pitch - halfLead;
    boxes.push({
      text: raw[i].text,
      top: top - codeTop,
      bottom: top + rowCounts[i] * pitch - codeTop,
    });
  }

  return boxes;
}

/** Index of the line whose band contains `yRel` (measured from the code box top). */
export function lineIndexAt(boxes: LineBox[], yRel: number): number {
  for (let i = 0; i < boxes.length; i++) {
    if (yRel < boxes[i].bottom) return i;
  }
  return boxes.length - 1;
}

export function setupCodeCopy(container: HTMLElement): CodeCopyHandlers {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hd-code-copy';
  button.title = 'Copy code';
  button.setAttribute('aria-label', 'Copy code');
  button.innerHTML = COPY_ICON;
  button.style.display = 'none';
  button.addEventListener('mousedown', (e) => e.preventDefault());
  container.appendChild(button);

  // Overlay used to highlight a single line while Ctrl (or Cmd) is held.
  const lineHi = document.createElement('div');
  lineHi.className = 'hd-code-line-highlight';
  lineHi.style.display = 'none';
  container.appendChild(lineHi);

  let currentPre: HTMLPreElement | null = null;
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  let lineResetTimer: ReturnType<typeof setTimeout> | null = null;

  // Line-copy mode state.
  let lineMode = false;
  let lineIndex = -1;
  let lineText = '';
  // Last known pointer position, so we can re-evaluate on key up/down without
  // requiring the mouse to move.
  let lastX = 0;
  let lastY = 0;

  const hide = () => {
    button.style.display = 'none';
    currentPre = null;
  };

  const hideLine = () => {
    lineHi.style.display = 'none';
    lineHi.classList.remove('copied', 'failed');
    lineIndex = -1;
    lineText = '';
    if (currentPre) currentPre.classList.remove('hd-line-picking');
  };

  const position = (pre: HTMLPreElement) => {
    const preRect = pre.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    button.style.display = 'block';

    const cs = getComputedStyle(pre);
    const padTop = parseFloat(cs.paddingTop) || 0;
    const fontSize = parseFloat(cs.fontSize) || 13;
    const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.5;
    const firstLineCenter = padTop + lineHeight / 2;
    const btnH = button.offsetHeight || 28;

    button.style.top = `${preRect.top - containerRect.top + firstLineCenter - btnH / 2}px`;
    button.style.left = `${preRect.right - containerRect.left - button.offsetWidth - 6}px`;
  };

  // Per-line geometry for the block under the pointer. Measuring every line
  // means a Range per line, which is too much to redo on each mousemove, so the
  // result is cached until something that could change wrapping changes.
  let geomCache: { pre: HTMLPreElement; sig: string; boxes: LineBox[] } | null = null;

  const lineGeometry = (pre: HTMLPreElement) => {
    const codeEl = (pre.querySelector('code') as HTMLElement | null) ?? pre;
    const codeRect = codeEl.getBoundingClientRect();
    // Text length and rendered size cover every way the layout can shift: an
    // edit, a resize, a font load. Scroll position is deliberately absent — it
    // moves codeRect.top but not the boxes, which are relative to it.
    const sig = `${codeEl.textContent?.length ?? 0}|${Math.round(codeRect.width)}|${Math.round(codeRect.height)}`;
    if (geomCache && geomCache.pre === pre && geomCache.sig === sig) {
      return { boxes: geomCache.boxes, codeRect };
    }
    const boxes = measureLines(codeEl, codeRect.top);
    geomCache = { pre, sig, boxes };
    return { boxes, codeRect };
  };

  // Highlights the line under clientY within `pre`.
  const positionLine = (pre: HTMLPreElement, clientY: number) => {
    const { boxes, codeRect } = lineGeometry(pre);
    if (!boxes.length) {
      hideLine();
      return;
    }
    const idx = lineIndexAt(boxes, clientY - codeRect.top);
    const box = boxes[idx];

    lineIndex = idx;
    lineText = box.text;

    const preRect = pre.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    lineHi.classList.remove('copied', 'failed');
    lineHi.style.display = 'block';
    lineHi.style.top = `${codeRect.top - containerRect.top + box.top}px`;
    lineHi.style.left = `${preRect.left - containerRect.left}px`;
    lineHi.style.width = `${preRect.width}px`;
    // A wrapped line occupies several rows, so the band is as tall as all of them.
    lineHi.style.height = `${box.bottom - box.top}px`;
  };

  // Central hover evaluation shared by mousemove and Ctrl key up/down.
  const evaluate = (clientX: number, clientY: number, ctrl: boolean) => {
    const target = document.elementFromPoint(clientX, clientY);
    const pre = (target as Element | null)?.closest('pre') as HTMLPreElement | null;
    const overPre = !!pre && container.contains(pre);

    if (ctrl && overPre && pre) {
      // Ctrl held over a code block: enter line-copy mode.
      lineMode = true;
      hide(); // no corner button while picking a line (also clears currentPre)
      currentPre = pre;
      pre.classList.add('hd-line-picking');
      positionLine(pre, clientY);
      return;
    }

    // Not in line mode (Ctrl released or not over a block).
    if (lineMode) {
      lineMode = false;
      hideLine();
    }

    if (!overPre || !pre) {
      if (currentPre && !button.matches(':hover')) hide();
      return;
    }
    if (pre !== currentPre) {
      currentPre = pre;
      button.innerHTML = COPY_ICON;
      button.title = 'Copy code';
      position(pre);
    } else {
      position(pre);
    }
  };

  container.addEventListener('mousemove', (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    evaluate(e.clientX, e.clientY, e.ctrlKey || e.metaKey);
  });

  container.addEventListener('mouseleave', () => {
    if (lineMode) {
      lineMode = false;
      hideLine();
    }
    if (!button.matches(':hover')) hide();
  });

  button.addEventListener('mouseleave', () => {
    if (!currentPre || !currentPre.matches(':hover')) hide();
  });

  // Re-evaluate when Ctrl/Cmd is pressed or released without moving the mouse.
  const onKeyChange = (e: KeyboardEvent) => {
    if (e.key !== 'Control' && e.key !== 'Meta') return;
    evaluate(lastX, lastY, e.ctrlKey || e.metaKey);
  };
  document.addEventListener('keydown', onKeyChange);
  document.addEventListener('keyup', onKeyChange);

  const flashLine = (ok: boolean) => {
    lineHi.classList.toggle('copied', ok);
    lineHi.classList.toggle('failed', !ok);
    if (lineResetTimer) clearTimeout(lineResetTimer);
    lineResetTimer = setTimeout(() => {
      lineHi.classList.remove('copied', 'failed');
    }, 600);
  };

  // Whether we've handled a mousedown and must also swallow its click.
  let swallowClick = false;

  // The <pre> under the pointer when Ctrl/Cmd is held (line-copy is active).
  const linePressTarget = (e: MouseEvent): HTMLPreElement | null => {
    if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return null;
    const pre = (e.target as Element | null)?.closest('pre') as HTMLPreElement | null;
    return pre && container.contains(pre) ? pre : null;
  };

  // Called by ProseMirror's handleDOMEvents.mousedown — the authoritative hook,
  // so returning true fully suppresses the editor's caret/selection handling.
  // We copy the single line under the press and leave no selection behind.
  const handleMouseDown = (e: MouseEvent): boolean => {
    const pre = linePressTarget(e);
    if (!pre) return false;
    currentPre = pre;
    positionLine(pre, e.clientY); // lock highlight + lineText to the pressed line
    if (lineIndex < 0) return false;
    e.preventDefault();
    swallowClick = true;
    void copyToClipboard(lineText).then((ok) => {
      flashLine(ok);
      window.getSelection()?.removeAllRanges();
    });
    return true;
  };

  // Swallow the click that follows a handled mousedown so nothing else reacts.
  const handleClick = (e: MouseEvent): boolean => {
    if (!swallowClick) return false;
    swallowClick = false;
    e.preventDefault();
    return true;
  };

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentPre) return;
    const code = currentPre.innerText.replace(/\r\n/g, '\n').replace(/\n$/, '');
    const ok = await copyToClipboard(code);
    button.innerHTML = ok ? CHECK_ICON : COPY_ICON;
    button.title = ok ? 'Copied' : 'Copy failed';
    button.classList.toggle('copied', ok);
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      button.innerHTML = COPY_ICON;
      button.title = 'Copy code';
      button.classList.remove('copied');
    }, 1500);
  });

  return { handleMouseDown, handleClick };
}

/** Handlers wired into the editor's ProseMirror DOM events. */
export interface CodeCopyHandlers {
  handleMouseDown(e: MouseEvent): boolean;
  handleClick(e: MouseEvent): boolean;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to execCommand
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
