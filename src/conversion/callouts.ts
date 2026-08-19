import type TurndownService from 'turndown';
import { calloutMarker, normalizeCalloutType, type CalloutType } from '../format/callouts';

/**
 * Callout conversion — how `> [!NOTE]` on disk becomes a marked-up blockquote
 * in the editor, and back again.
 *
 *   > [!NOTE]        ──splitCalloutBlockquote──▶  <blockquote data-callout="note">
 *   > Body.                                         <p>Body.</p></blockquote>
 *
 * The marker line itself never reaches the editor as text: it is lifted into
 * the `data-callout` attribute on load, and re-emitted as the first line on
 * save. So the editor models a callout as *what it is* — a blockquote with a
 * type — instead of a blockquote that happens to start with literal `[!NOTE]`.
 */

/**
 * Detect an alert marker at the head of a blockquote's already-rendered inner
 * HTML and split it off from the body.
 *
 * Markdown folds the marker line into the paragraph that follows it, so the
 * marker shows up in one of two shapes, both handled here:
 *
 *   `<p>[!NOTE]\nBody.</p>`      marker line, then body on the next `>` line
 *   `<p>[!NOTE]</p>\n<p>…</p>`   marker line, then a blank `>` line
 *
 * Requiring a newline or the paragraph's end right after `]` is what keeps
 * `> [!NOTE] text` an ordinary blockquote, matching GitHub.
 */
export function splitCalloutBlockquote(
  innerHtml: string
): { type: CalloutType; body: string } | null {
  const m = /^\s*<p>\[!([A-Za-z]+)\][ \t]*(\n|<\/p>\n?)/.exec(innerHtml);
  if (!m) return null;
  const type = normalizeCalloutType(m[1]);
  if (!type) return null;

  const rest = innerHtml.slice(m[0].length);
  // A marker followed by a newline shares its paragraph with the body, so the
  // paragraph has to be re-opened; one closed by `</p>` was the whole paragraph
  // and is dropped outright.
  const body = m[2] === '\n' ? `<p>${rest}` : rest;
  // A callout with no body still needs a block to put the caret in.
  return { type, body: body.trim() ? body : '<p></p>' };
}

/**
 * Serialize a typed blockquote back to its marker line. Registered on every
 * converter that can meet one, so a callout survives a save, a copy-as-Markdown
 * and a round-trip through the source view identically.
 */
export function addCalloutTurndownRule(td: TurndownService): void {
  td.addRule('calloutBlockquote', {
    filter: (node) => calloutTypeOf(node) !== null,
    replacement: (content, node) => calloutMarkdown(calloutTypeOf(node)!, content)
  });
}

/** The marker line plus a `>`-prefixed body — a callout as it is written. */
export function calloutMarkdown(type: CalloutType, body: string): string {
  const trimmed = body.replace(/^\n+|\n+$/g, '');
  const lines = [calloutMarker(type), ...(trimmed ? trimmed.split('\n') : [])];
  // `>` alone on blank lines — a trailing space there is invisible churn that
  // editors and formatters strip back out on the next save.
  return '\n\n' + lines.map((line) => (line.trim() ? `> ${line}` : '>')).join('\n') + '\n\n';
}

/** The callout type a DOM node carries, or null if it isn't a callout. */
export function calloutTypeOf(node: unknown): CalloutType | null {
  const el = node as { nodeName?: string; getAttribute?(name: string): string | null };
  if (el.nodeName !== 'BLOCKQUOTE') return null;
  return normalizeCalloutType(el.getAttribute?.('data-callout') ?? null);
}
