const COPY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z"/>' +
  '</svg>';

const CHECK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>' +
  '</svg>';

export function setupCodeCopy(container: HTMLElement): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hd-code-copy';
  button.title = 'Copy code';
  button.setAttribute('aria-label', 'Copy code');
  button.innerHTML = COPY_ICON;
  button.style.display = 'none';
  button.addEventListener('mousedown', (e) => e.preventDefault());
  container.appendChild(button);

  let currentPre: HTMLPreElement | null = null;
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  const hide = () => {
    button.style.display = 'none';
    currentPre = null;
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

  container.addEventListener('mousemove', (e) => {
    const target = e.target as Element | null;
    const pre = target?.closest('pre') as HTMLPreElement | null;
    if (!pre || !container.contains(pre)) {
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
  });

  container.addEventListener('mouseleave', () => {
    if (!button.matches(':hover')) hide();
  });

  button.addEventListener('mouseleave', () => {
    if (!currentPre || !currentPre.matches(':hover')) hide();
  });

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
