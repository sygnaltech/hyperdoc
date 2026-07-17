import { mergeAttributes, wrappingInputRule } from '@tiptap/core';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { exitControlList } from './control-exit';

/**
 * Checkbox (task list) support for HD2.
 *
 * We reuse TipTap's official TaskList/TaskItem — including TaskItem's
 * interactive checkbox node view — but override parse/serialize so that:
 *
 *  - the on-disk / getHTML() markup is the HD-allowed, input-free form
 *    (`<ul data-type="tasklist">` / `<li data-type="task" data-checked>`), and
 *  - the editor recognizes exactly that markup on load.
 *
 * The `<input>` the node view renders lives only in the live editor DOM; it is
 * never part of the serialized document, so the HD form-control ban is honored.
 */

// Typing `[] `, `[ ] `, or `[x] ` at the start of a block creates a checkbox.
// The rule wraps in the LIST (not the item) so an adjacent task list is joined
// automatically — consecutive checkboxes become one list.
const taskInputRegex = /^\s*\[([ xX]?)\]\s$/;

export const HdTaskList = TaskList.extend({
  parseHTML() {
    return [{ tag: 'ul[data-type="tasklist"]', priority: 100 }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['ul', mergeAttributes(HTMLAttributes, { 'data-type': 'tasklist' }), 0];
  },
  addInputRules() {
    return [wrappingInputRule({ find: taskInputRegex, type: this.type })];
  }
});

export const HdTaskItem = TaskItem.extend({
  parseHTML() {
    return [{ tag: 'li[data-type="task"]', priority: 100 }];
  },
  renderHTML({ HTMLAttributes }) {
    // The `checked` attribute contributes `data-checked` via its own renderHTML,
    // so we only add the type marker here.
    return ['li', mergeAttributes(HTMLAttributes, { 'data-type': 'task' }), 0];
  },
  // The list-level rule above handles creation; drop TaskItem's own item-level
  // rule so a marker isn't matched twice.
  addInputRules() {
    return [];
  },
  // Enter exits the list instead of splitting into a new checkbox.
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Enter: () => exitControlList(this.editor)
    };
  }
});
