import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

const ITEM_TYPES = new Set(['taskItem', 'radioItem']);

/**
 * Enter inside a checkbox/radio item never auto-creates another control. What
 * it does depends on where you are, so you can both finish and break apart a
 * group without a paragraph ever being wedged between two items (the schema
 * forbids that):
 *
 *  - On the LAST item of a group → end the group; cursor drops to a fresh
 *    paragraph after it.
 *  - On an item with siblings AFTER it → SPLIT the group there: the following
 *    items become a new, separate group (a blank line between them on save).
 *  - On an empty item → remove it and leave the group.
 *
 * A new control is only ever created by typing its marker.
 */
export function exitControlList(editor: Editor): boolean {
  const { state } = editor;
  const sel = state.selection;
  if (!(sel instanceof TextSelection) || !sel.empty) return false;
  const { $from } = sel;

  let itemDepth = -1;
  for (let d = $from.depth; d >= 1; d--) {
    if (ITEM_TYPES.has($from.node(d).type.name)) {
      itemDepth = d;
      break;
    }
  }
  if (itemDepth < 1) return false;

  const listDepth = itemDepth - 1;
  const listNode = $from.node(listDepth);
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return false;

  const itemEmpty = $from.node(itemDepth).textContent.length === 0;
  const isLast = $from.index(listDepth) === listNode.childCount - 1;
  const tr = state.tr;

  if (itemEmpty && listNode.childCount <= 1) {
    // Sole empty item: replace the whole list with a paragraph.
    const from = $from.before(listDepth);
    const to = $from.after(listDepth);
    tr.replaceWith(from, to, paragraph.createAndFill()!);
    tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1)));
  } else if (itemEmpty) {
    // Empty item among others: drop it, add a paragraph after the list.
    tr.delete($from.before(itemDepth), $from.after(itemDepth));
    const afterList = tr.mapping.map($from.after(listDepth));
    tr.insert(afterList, paragraph.createAndFill()!);
    tr.setSelection(TextSelection.near(tr.doc.resolve(afterList + 1)));
  } else if (isLast) {
    // Non-empty last item: end the group with a fresh paragraph after it.
    const afterList = $from.after(listDepth);
    tr.insert(afterList, paragraph.createAndFill()!);
    tr.setSelection(TextSelection.near(tr.doc.resolve(afterList + 1)));
  } else {
    // Non-empty, has items after: split the group into two after this item.
    const afterItem = $from.after(itemDepth);
    tr.split(afterItem, 1);
    const landing = tr.mapping.map(afterItem, 1);
    tr.setSelection(TextSelection.near(tr.doc.resolve(landing), 1));
  }

  editor.view.dispatch(tr.scrollIntoView());
  return true;
}
