/**
 * Shared sizing/alignment helpers for the image and figure nodes.
 *
 * Alignment is modelled as a clean `align` node attribute (`left`/`center`/
 * `right`), but is *rendered* as portable inline CSS so published output aligns
 * without any interpreting stylesheet, and *derived back* from that CSS on parse
 * so hand-authored markup round-trips and shows up correctly in the editor's
 * alignment control. There is intentionally no separate marker attribute.
 *
 * The alignment-owned CSS properties (`display`, `margin-left`, `margin-right`,
 * `text-align`) are stripped out of the freeform `style` attribute so the two
 * representations never fight over the same declaration.
 */

export type Align = 'left' | 'center' | 'right';

export function parseAlign(value: unknown): Align | null {
  return value === 'left' || value === 'center' || value === 'right' ? value : null;
}

const MARGINS: Record<Align, { left: string; right: string }> = {
  left: { left: '0', right: 'auto' },
  center: { left: 'auto', right: 'auto' },
  right: { left: 'auto', right: '0' }
};

/** A block image aligns via `display:block` + auto margins. */
export function imageAlignStyle(align: Align): string {
  const m = MARGINS[align];
  return `display: block; margin-left: ${m.left}; margin-right: ${m.right}`;
}

/** A figure aligns via `text-align`, so its image and caption move together. */
export function figureAlignStyle(align: Align): string {
  return `text-align: ${align}`;
}

export function deriveImageAlign(el: HTMLElement): Align | null {
  const ml = el.style.marginLeft;
  const mr = el.style.marginRight;
  const isZero = (v: string) => v === '0' || v === '0px';
  if (ml === 'auto' && mr === 'auto') return 'center';
  if (ml === 'auto' && isZero(mr)) return 'right';
  if (isZero(ml) && mr === 'auto') return 'left';
  return null;
}

export function deriveFigureAlign(el: HTMLElement): Align | null {
  return parseAlign(el.style.textAlign);
}

const ALIGN_PROPS = new Set(['display', 'margin-left', 'margin-right', 'text-align']);

/** Remove alignment-owned declarations from a freeform style string. */
export function stripAlignProps(style: string | null): string | null {
  if (!style) return null;
  const kept = style
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((decl) => {
      const i = decl.indexOf(':');
      const prop = (i === -1 ? decl : decl.slice(0, i)).trim().toLowerCase();
      return !ALIGN_PROPS.has(prop);
    });
  return kept.length ? kept.join('; ') : null;
}

/** Join style fragments, dropping empties and stray trailing semicolons. */
export function joinStyle(...parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ? p.trim().replace(/;\s*$/, '') : ''))
    .filter(Boolean)
    .join('; ');
}
