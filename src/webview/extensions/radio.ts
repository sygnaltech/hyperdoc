import { Node, mergeAttributes, wrappingInputRule } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { exitControlList } from './control-exit';

// Typing `( ) `, `() `, or `(x) ` at the start of a block creates a radio.
// The rule wraps in the GROUP (not the item), so an adjacent radio group is
// joined automatically — consecutive radios form one mutually-exclusive group,
// while a paragraph (blank line) between them keeps them in separate groups.
const radioInputRegex = /^\s*\(([ xX]?)\)\s$/;

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
  },

  addInputRules() {
    // Wrapping in the group type means ProseMirror joins a new radio to an
    // immediately-preceding radio group (there is no node between them).
    return [wrappingInputRule({ find: radioInputRegex, type: this.type })];
  }
});

export const RadioItem = Node.create({
  name: 'radioItem',
  // A radio label is a single line — one paragraph, no nested blocks — so Enter
  // can't create a multi-line item.
  content: 'paragraph',
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

  // Enter exits the group instead of splitting the item or adding a new radio.
  addKeyboardShortcuts() {
    return {
      Enter: () => exitControlList(this.editor)
    };
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
        toggleRadio(editor, getPos);
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
 * clear it too (deselect-to-none). The current checked state is read fresh from
 * the document (not from a captured node, which goes stale after the first
 * toggle). Applied as one transaction so the group updates atomically.
 */
function toggleRadio(editor: Editor, getPos: (() => number | undefined) | undefined): void {
  const pos = typeof getPos === 'function' ? getPos() : undefined;
  if (pos == null) return;

  const { state } = editor;
  const item = state.doc.nodeAt(pos);
  if (!item || item.type.name !== 'radioItem') return;
  const willCheck = item.attrs.checked !== true;

  const $item = state.doc.resolve(pos);
  const group = $item.parent;
  if (group.type.name !== 'radioGroup') return;

  const groupStart = $item.start();
  let tr = state.tr;
  group.forEach((child, offset) => {
    if (child.type.name !== 'radioItem') return;
    const childPos = groupStart + offset;
    const shouldCheck = childPos === pos ? willCheck : false;
    if (child.attrs.checked !== shouldCheck) {
      tr = tr.setNodeMarkup(childPos, undefined, { ...child.attrs, checked: shouldCheck });
    }
  });

  if (tr.docChanged) editor.view.dispatch(tr);
}
