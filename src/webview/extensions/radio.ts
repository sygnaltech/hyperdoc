import { Node, mergeAttributes, wrappingInputRule } from '@tiptap/core';
import type { Editor } from '@tiptap/core';

// Mirrors TipTap's task-item rule (`- [ ]`) for our paren syntax: typing
// `( ) `, `() `, or `(x) ` at the start of a block creates a radio item.
// findWrapping auto-inserts the parent radioGroup, since a radioItem (which has
// no `group`) is not valid on its own.
const radioInputRegex = /^\s*(\(([ xX])?\))\s$/;

/**
 * Radio group support for HD2.
 *
 * There is no Markdown standard for radios, and TipTap ships no radio node, so
 * these are custom. The persisted form is HD-allowed data attributes:
 *
 *   <ul data-type="radiogroup" [data-group="name"]>
 *     <li data-type="radio" data-checked="true|false">…</li>
 *
 * Semantics (per the HD2 design):
 *  - One `<ul>` is one mutually-exclusive group (implicit grouping).
 *  - Selecting an item clears its siblings.
 *  - Clicking the selected item DESELECTS it, so a group can have zero selected.
 *  - An optional `data-group` name is carried through for agents to reference.
 */

export const RadioGroup = Node.create({
  name: 'radioGroup',
  group: 'block list',
  content: 'radioItem+',

  addAttributes() {
    return {
      group: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-group') || null,
        renderHTML: (attrs) => (attrs.group ? { 'data-group': attrs.group } : {})
      }
    };
  },

  parseHTML() {
    return [{ tag: 'ul[data-type="radiogroup"]', priority: 100 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['ul', mergeAttributes(HTMLAttributes, { 'data-type': 'radiogroup' }), 0];
  }
});

export const RadioItem = Node.create({
  name: 'radioItem',
  content: 'paragraph block*',
  defining: true,

  addAttributes() {
    return {
      checked: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-checked') === 'true',
        renderHTML: (attrs) => ({ 'data-checked': attrs.checked ? 'true' : 'false' })
      }
    };
  },

  parseHTML() {
    return [{ tag: 'li[data-type="radio"]', priority: 100 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['li', mergeAttributes(HTMLAttributes, { 'data-type': 'radio' }), 0];
  },

  addInputRules() {
    return [
      wrappingInputRule({
        find: radioInputRegex,
        type: this.type,
        getAttributes: (match) => ({ checked: /x/i.test(match[2] ?? '') })
      })
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('li');
      dom.setAttribute('data-type', 'radio');
      dom.setAttribute('data-checked', node.attrs.checked ? 'true' : 'false');

      const indicator = document.createElement('span');
      indicator.className = 'hd-radio-indicator';
      indicator.setAttribute('contenteditable', 'false');
      indicator.addEventListener('mousedown', (event) => {
        event.preventDefault();
        if (!editor.isEditable) return;
        toggleRadio(editor, getPos, node.attrs.checked === true);
      });

      const content = document.createElement('div');
      content.className = 'hd-radio-content';

      dom.appendChild(indicator);
      dom.appendChild(content);

      return {
        dom,
        contentDOM: content,
        update: (updated) => {
          if (updated.type.name !== 'radioItem') return false;
          dom.setAttribute('data-checked', updated.attrs.checked ? 'true' : 'false');
          return true;
        }
      };
    };
  }
});

/**
 * Select this item and clear its siblings — or, if it was already selected,
 * clear it too (deselect-to-none). Applied as a single transaction so the whole
 * group updates atomically and the document is saved in a consistent state.
 */
function toggleRadio(
  editor: Editor,
  getPos: (() => number | undefined) | undefined,
  currentlyChecked: boolean
): void {
  const pos = typeof getPos === 'function' ? getPos() : undefined;
  if (pos == null) return;

  const { state } = editor;
  const $item = state.doc.resolve(pos);
  const group = $item.parent;
  if (group.type.name !== 'radioGroup') return;

  const groupStart = $item.start();
  let tr = state.tr;
  group.forEach((child, offset) => {
    if (child.type.name !== 'radioItem') return;
    const childPos = groupStart + offset;
    const shouldCheck = childPos === pos ? !currentlyChecked : false;
    if (child.attrs.checked !== shouldCheck) {
      tr = tr.setNodeMarkup(childPos, undefined, { ...child.attrs, checked: shouldCheck });
    }
  });

  if (tr.docChanged) editor.view.dispatch(tr);
}
