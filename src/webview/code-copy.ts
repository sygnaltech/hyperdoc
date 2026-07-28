const COPY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z"/>' +
  '</svg>';

const CHECK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>' +
  '</svg>';

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

  // Splits a <pre>'s code into lines and measures the rendered line height.
  const readLines = (pre: HTMLPreElement) => {
    const codeEl = (pre.querySelector('code') as HTMLElement | null) ?? pre;
    const text = codeEl.innerText.replace(/\r\n/g, '\n').replace(/\n$/, '');
    const lines = text.split('\n');
    const codeRect = codeEl.getBoundingClientRect();
    // Measure from the actual rendered code box so it matches whatever line
    // height the theme applies (avoids relying on a possibly-"normal" value).
    const lineHeight = lines.length > 0 ? codeRect.height / lines.length : codeRect.height;
    return { codeEl, lines, lineHeight, codeRect };
  };

  // Highlights the line under (clientX, clientY) within `pre`.
  const positionLine = (pre: HTMLPreElement, clientY: number) => {
    const { lines, lineHeight, codeRect } = readLines(pre);
    if (!lines.length || lineHeight <= 0) {
      hideLine();
      return;
    }
    let idx = Math.floor((clientY - codeRect.top) / lineHeight);
    if (idx < 0) idx = 0;
    if (idx > lines.length - 1) idx = lines.length - 1;

    lineIndex = idx;
    lineText = lines[idx];

    const preRect = pre.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    lineHi.classList.remove('copied', 'failed');
    lineHi.style.display = 'block';
    lineHi.style.top = `${codeRect.top - containerRect.top + idx * lineHeight}px`;
    lineHi.style.left = `${preRect.left - containerRect.left}px`;
    lineHi.style.width = `${preRect.width}px`;
    lineHi.style.height = `${lineHeight}px`;
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
