import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';

/**
 * Enforces ONE SELECTION PER RADIO GROUP as the document is edited: a radio
 * group may have at most one checked item (zero is allowed). If an edit — a
 * paste, a split, a merge — leaves two checked, all but the first are cleared.
 *
 * Grouping itself is structural: each `<ul data-type="radiogroup">` is one
 * group. Groups are created and separated by the Markdown segmenter on load and
 * by the input rule / Enter-split while editing; this plugin does NOT merge or
 * split groups, so intentional separators (blank lines) are never collapsed.
 */
export const ControlGrouping = Extension.create({
  name: 'controlGrouping',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('controlGrouping'),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          const tr = newState.tr;
          enforceSingleCheck(tr);
          return tr.steps.length ? tr : null;
        }
      })
    ];
  }
});

function enforceSingleCheck(tr: Transaction): void {
  const clear: number[] = [];
  tr.doc.descendants((node, pos) => {
    if (node.type.name !== 'radioGroup') return undefined;
    let seenChecked = false;
    node.forEach((child, offset) => {
      if (child.type.name === 'radioItem' && child.attrs.checked) {
        if (seenChecked) clear.push(pos + 1 + offset);
        else seenChecked = true;
      }
    });
    return false; // items handled; don't descend further
  });
  for (const pos of clear) {
    const node = tr.doc.nodeAt(pos);
    if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: false });
  }
}
