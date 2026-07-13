import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * Highlight mark → semantic `<mark>`.
 *
 * `<mark>` is permitted by the HD allow-list but was not modelled by the editor,
 * so it was dropped on the first edit and could not be created. This adds it to
 * the ProseMirror schema so highlights round-trip and can be toggled from the
 * toolbar or with Ctrl/Cmd+Shift+H. The colour is a plain, semantic yellow
 * applied in CSS — no inline style, so the markup stays clean `<mark>`.
 */
export const Highlight = Mark.create({
  name: 'highlight',

  parseHTML() {
    return [{ tag: 'mark' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes), 0];
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-h': () => this.editor.commands.toggleMark(this.name)
    };
  }
});
