import { mergeAttributes } from '@tiptap/core';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

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
export const HdTaskList = TaskList.extend({
  parseHTML() {
    return [{ tag: 'ul[data-type="tasklist"]', priority: 100 }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['ul', mergeAttributes(HTMLAttributes, { 'data-type': 'tasklist' }), 0];
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
  }
});
