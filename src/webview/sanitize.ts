import { ALLOWED_ELEMENTS, isAttrAllowed } from '../format/allowed';

/**
 * Strip everything outside the HD-allowed element/attribute set.
 * Disallowed elements are unwrapped (children preserved) so we don't lose content.
 */
export function sanitizeHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<div id="hd-sanitize-root">${html}</div>`,
    'text/html'
  );
  const root = doc.getElementById('hd-sanitize-root');
  if (!root) return '';

  // Drop <style>, <script>, and similar entirely (don't unwrap — kill content too).
  root.querySelectorAll('style, script, link, meta, base, head, title').forEach((el) => {
    el.remove();
  });

  for (const child of Array.from(root.children)) {
    cleanNode(child);
  }

  return root.innerHTML;
}

function cleanNode(node: Element): void {
  // Depth-first: clean descendants first.
  for (const child of Array.from(node.children)) {
    cleanNode(child);
  }

  const tag = node.tagName.toLowerCase();
  if (!ALLOWED_ELEMENTS.has(tag)) {
    unwrap(node);
    return;
  }

  // Strip disallowed attributes.
  for (const attr of Array.from(node.attributes)) {
    if (!isAttrAllowed(node.tagName, attr.name)) {
      node.removeAttribute(attr.name);
    }
  }
}

function unwrap(node: Element): void {
  const parent = node.parentNode;
  if (!parent) return;
  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }
  parent.removeChild(node);
}
