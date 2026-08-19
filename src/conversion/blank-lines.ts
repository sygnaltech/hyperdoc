/**
 * Deliberate blank lines — keeping the vertical spacing an author wrote.
 *
 * Markdown has no representation for an empty line between blocks: one blank
 * line is a separator, and every further one is discarded by the parser. So
 * `A\n\n\nB` and `A\n\nB` parse to *identical* HTML, and a document that was
 * merely opened and re-saved came back with the author's spacing collapsed.
 *
 * The fix is to give the extra lines somewhere to live. On the way in, each
 * blank line beyond the separator becomes an empty paragraph — a real node the
 * editor can show and the caret can sit in. On the way out, that node is
 * written back as the blank line it came from:
 *
 *   on disk          in the editor            on disk again
 *   A                <p>A</p>                 A
 *   (blank)          <p></p>   ← the extra    (blank)
 *   (blank)          <p>B</p>                 (blank)
 *   B                                         B
 *
 * Round-tripping is exact, so the file keeps plain Markdown blank lines and no
 * marker is ever added to it.
 *
 * Two contexts are left strictly alone, because a blank line there is not
 * spacing but syntax:
 *
 *  - **Fenced code** — blank lines are part of the code.
 *  - **Lists** — a blank line between items is what makes a list *loose*;
 *    splitting one would turn a single list into two.
 *
 * Blank runs at the very start or end of the document are also left alone. The
 * editor never creates spacing there from a parse, and an empty paragraph that
 * lands at an edge keeps the older `<p></p>` island form, which survives the
 * trim that normalizes the document's ends.
 */

/** The HTML island an edge-of-document empty paragraph is still stored as. */
const BLANK_ISLAND = '<p></p>';

/**
 * Flag every line that sits inside a fenced code block. Fences are matched the
 * way CommonMark does: up to three spaces of indent, three or more backticks or
 * tildes, and a closing fence of the same character that is at least as long
 * and carries no info string.
 */
function fenceMask(lines: string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  let fence: { char: string; length: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (fence) {
      // Inside: the fence line itself belongs to the block either way.
      mask[i] = true;
      if (m && m[1][0] === fence.char && m[1].length >= fence.length && m[2].trim() === '') {
        fence = null;
      }
      continue;
    }
    if (m) {
      fence = { char: m[1][0], length: m[1].length };
      mask[i] = true;
    }
  }
  return mask;
}

function isListItem(line: string): boolean {
  return /^([-*+]|\d+[.)])\s/.test(line);
}

/** Indented: a list item's continuation, or an indented code block. */
function isIndented(line: string): boolean {
  return /^\s/.test(line);
}

/**
 * Whether a blank run between these two lines is plain block spacing, and so
 * safe to expand.
 *
 * The one shape that must be left alone is a run *between two items of the same
 * list*: a blank line there is what makes the list loose, and putting a
 * paragraph in the middle would split one list into two. A run on the way into
 * or out of a list is ordinary spacing — the list either hasn't started or has
 * already ended — so those are expanded like any other.
 */
function isSpacing(before: string, after: string): boolean {
  if (isIndented(before) || isIndented(after)) return false;
  return !(isListItem(before) && isListItem(after));
}

/**
 * Load side: turn each blank line beyond the first in a run into an empty
 * paragraph, so the spacing survives parsing.
 */
export function expandBlankRuns(md: string): string {
  const lines = md.split('\n');
  const inFence = fenceMask(lines);
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (inFence[i] || lines[i].trim() !== '') {
      out.push(lines[i]);
      i++;
      continue;
    }

    const start = i;
    while (i < lines.length && !inFence[i] && lines[i].trim() === '') i++;
    const count = i - start;

    // `null` at either end means the run is at a document edge.
    const before = start > 0 ? lines[start - 1] : null;
    const after = i < lines.length ? lines[i] : null;
    const expandable = count > 1 && before !== null && after !== null && isSpacing(before, after);

    if (!expandable) {
      for (let k = 0; k < count; k++) out.push('');
      continue;
    }

    // One blank stays the separator; every extra one becomes a paragraph, each
    // needing its own blank line to be read as a block.
    out.push('');
    for (let k = 1; k < count; k++) {
      out.push(BLANK_ISLAND);
      out.push('');
    }
  }

  return out.join('\n');
}

/**
 * Save side: drop the island line an empty paragraph serialized to, leaving the
 * blank lines that already surround it — which is exactly the run it came from.
 * An island at a document edge is kept, since the trim that normalizes the
 * document's ends would otherwise swallow the blank line it turned into.
 */
export function restoreBlankRuns(md: string): string {
  const lines = md.split('\n');
  const inFence = fenceMask(lines);

  // Anything inside a fence is code, so it always counts as content — otherwise
  // a document whose only other block is fenced would read as all-edge and keep
  // its islands.
  const isIsland = (i: number) => !inFence[i] && lines[i].trim() === BLANK_ISLAND;
  const isContent = (i: number) => lines[i].trim() !== '' && !isIsland(i);

  let firstContent = -1;
  let lastContent = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!isContent(i)) continue;
    if (firstContent === -1) firstContent = i;
    lastContent = i;
  }

  const isBlankish = (i: number) => i >= 0 && i < lines.length && lines[i].trim() === '';

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const atEdge = firstContent === -1 || i < firstContent || i > lastContent;
    if (isIsland(i) && !atEdge) continue;

    if (!inFence[i] && lines[i] !== '' && lines[i].trim() === '') {
      // Turndown pads its list separators with indentation. Standing between
      // two items it IS the separator, so it becomes a plain blank line; next
      // to a real blank line it is only trailing padding on the list, and
      // keeping it would add a line to the run on every single save.
      if (isBlankish(i - 1) || isBlankish(i + 1)) continue;
      out.push('');
      continue;
    }

    out.push(lines[i]);
  }
  return out.join('\n');
}
