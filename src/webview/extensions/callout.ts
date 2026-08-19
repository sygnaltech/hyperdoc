import { InputRule, type NodeViewRenderer } from '@tiptap/core';
import { Blockquote } from '@tiptap/extension-blockquote';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import {
  CALLOUT_TYPES,
  calloutMarker,
  calloutTitleHtml,
  normalizeCalloutType,
  type CalloutType
} from '../../format/callouts';

/**
 * Callouts in the WYSIWYG editor — GitHub-style alerts (`> [!NOTE]`) shown as
 * the coloured, titled box they mean, without permanently hiding the markup
 * that produces it.
 *
 * A callout is not a node of its own: it is a **blockquote carrying a type**,
 * exactly as it is on disk. That keeps the whole feature reversible — clear the
 * type and what is left is the ordinary blockquote the Markdown always was.
 *
 * The editing model has two states, and the caret is the switch between them:
 *
 *  - **Reading** — the header shows the type's Octicon and its name as a small
 *    tag. The marker is not part of the text, so it can't be half-deleted into
 *    `[!NOT`.
 *  - **Editing** (caret anywhere inside the callout) — the name expands to the
 *    literal `[!NOTE]` marker in an editable field, so the type is changed by
 *    editing the markup itself, the way it is written on disk. The icon stays
 *    put and the box keeps its colour: only the word is swapped, so expanding
 *    the marker changes what you can edit, never what the block looks like.
 *
 * The field is a real `<input>`, which lives only in the live editor DOM (like
 * the task-list checkbox) and is never part of the serialized document — the HD
 * ban on form controls is about what gets stored, and nothing here is.
 */

const calloutStateKey = new PluginKey('hdCalloutActive');

/** Applied to the callout holding the caret; CSS swaps title → marker on it. */
const EDITING_CLASS = 'hd-callout-editing';

export const HdBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      callout: {
        default: null,
        // Only the five known types survive a parse: an unrecognized
        // `data-callout` leaves an ordinary blockquote rather than a callout
        // styled from an invented vocabulary.
        parseHTML: (element) => normalizeCalloutType(element.getAttribute('data-callout')),
        renderHTML: (attributes) => {
          const type = normalizeCalloutType(attributes.callout as string | null);
          return type ? { 'data-callout': type } : {};
        }
      }
    };
  },

  // Typing the marker is how a callout is made, mirroring the source syntax:
  // `[!note] ` at the top of a blockquote types it, and in a plain paragraph
  // wraps that paragraph in a callout (so typing `> ` first is optional).
  addInputRules() {
    return [...(this.parent?.() ?? []), calloutInputRule(this.name)];
  },

  addNodeView() {
    return calloutNodeView;
  },

  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), activeCalloutPlugin()];
  }
});

// ---------------------------------------------------------------------------
// Creating a callout by typing its marker
// ---------------------------------------------------------------------------

const INPUT_RULE_RE = new RegExp('^\\[!(' + CALLOUT_TYPES.join('|') + ')\\]\\s$', 'i');

function calloutInputRule(nodeName: string): InputRule {
  return new InputRule({
    find: INPUT_RULE_RE,
    handler: ({ state, range, match, chain }) => {
      const type = normalizeCalloutType(match[1]);
      if (!type) return;

      const $from = state.doc.resolve(range.from);
      const depth = blockquoteDepth($from);

      if (depth !== null) {
        // Inside a blockquote the marker only counts on the FIRST block — the
        // only place Markdown would read it as an alert. Anywhere else it stays
        // literal text, exactly as the source would leave it.
        if ($from.index(depth) !== 0) return;
        chain().deleteRange(range).updateAttributes(nodeName, { callout: type }).run();
        return;
      }

      chain()
        .deleteRange(range)
        .wrapIn(nodeName)
        .updateAttributes(nodeName, { callout: type })
        .run();
    }
  });
}

/** Depth of the nearest enclosing blockquote, or null when there is none. */
function blockquoteDepth($pos: ResolvedPos): number | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === 'blockquote') return d;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reading vs editing: the caret decides which state the callout under it is in
// ---------------------------------------------------------------------------

function activeCalloutPlugin(): Plugin {
  return new Plugin({
    key: calloutStateKey,
    props: {
      decorations(state) {
        const { $from } = state.selection;
        for (let d = $from.depth; d > 0; d--) {
          const node: PMNode = $from.node(d);
          if (node.type.name !== 'blockquote') continue;
          if (!normalizeCalloutType(node.attrs.callout as string | null)) return null;
          return DecorationSet.create(state.doc, [
            Decoration.node($from.before(d), $from.after(d), { class: EDITING_CLASS })
          ]);
        }
        return null;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Node view
// ---------------------------------------------------------------------------

const calloutNodeView: NodeViewRenderer = ({ node, editor, getPos }) => {
  let current = node;
  let type = normalizeCalloutType(current.attrs.callout as string | null);

  const dom = document.createElement('blockquote');

  // A plain blockquote gets no chrome — and no node-view behaviour to go wrong.
  if (!type) {
    return {
      dom,
      contentDOM: dom,
      update: (updated) =>
        updated.type === current.type &&
        normalizeCalloutType(updated.attrs.callout as string | null) === null
    };
  }

  // The type lives in an attribute, not a class: ProseMirror owns `class` on a
  // node view's outer element (that is how the editing decoration is applied),
  // so styling keys off `[data-callout]` rather than a class we would fight over.
  dom.className = 'hd-callout';
  dom.setAttribute('data-callout', type);

  const head = document.createElement('div');
  head.className = 'hd-callout-head';
  head.contentEditable = 'false';

  const title = document.createElement('span');
  title.className = 'hd-callout-title';
  title.title = 'Click to edit the callout type';

  const marker = document.createElement('input');
  marker.className = 'hd-callout-marker';
  marker.spellcheck = false;
  marker.setAttribute('aria-label', 'Callout type marker');

  head.append(title, marker);

  const contentDOM = document.createElement('div');
  contentDOM.className = 'hd-callout-body';

  dom.append(head, contentDOM);
  syncHead();

  function syncHead(): void {
    if (!type) return;
    title.innerHTML = calloutTitleHtml(type);
    marker.value = calloutMarker(type);
    marker.size = Math.max(marker.value.length, 4);
  }

  function setType(next: CalloutType | null): void {
    if (next === type) return;
    const pos = getPos();
    if (typeof pos !== 'number') return;
    editor.view.dispatch(editor.view.state.tr.setNodeAttribute(pos, 'callout', next));
  }

  /**
   * Put the caret back in the prose. `near` resolves to the closest real text
   * position inside the callout, so this holds however the body starts — a
   * paragraph, a list, a code block.
   */
  function focusBody(at?: number): void {
    const pos = at ?? getPos();
    if (typeof pos !== 'number') return;
    const { state } = editor.view;
    const inside = Math.min(pos + 1, state.doc.content.size);
    editor.view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(inside), 1)));
    editor.view.focus();
  }

  // Live while it stays a valid marker, so the box recolours as the type is
  // retyped — seeing what the markup does is the point of expanding it.
  marker.addEventListener('input', () => {
    const next = normalizeCalloutType(marker.value);
    if (next) setType(next);
  });

  // On the way out, resolve whatever is left: a valid marker applies, an empty
  // field means the markup was deleted (leaving the plain blockquote that was
  // always underneath), and anything unrecognized snaps back rather than
  // silently becoming some other type.
  marker.addEventListener('blur', () => {
    const raw = marker.value.trim();
    const next = normalizeCalloutType(raw);
    if (next) setType(next);
    else if (raw === '') setType(null);
    else syncHead();
  });

  // What the type was when editing started, so Escape can put it back — the
  // live preview above has usually already applied something else by then.
  let typeOnFocus: CalloutType | null = null;
  marker.addEventListener('focus', () => {
    typeOnFocus = type;
  });

  marker.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    // Read the position before blurring: committing an empty marker drops the
    // type, and this node view goes with it.
    const pos = getPos();
    if (event.key === 'Escape') {
      if (typeOnFocus) setType(typeOnFocus);
      syncHead();
    }
    marker.blur();
    focusBody(typeof pos === 'number' ? pos : undefined);
  });

  // Clicking the header is the direct route to the markup: it drops the caret
  // into the callout (which expands the marker) and hands focus straight over.
  // The whole row is the target, not just the label — while editing, the label
  // is the part that has been replaced by the field.
  head.addEventListener('mousedown', (event) => {
    if (event.target === marker) return;
    event.preventDefault();
    focusBody();
    requestAnimationFrame(() => {
      marker.focus();
      marker.select();
    });
  });

  return {
    dom,
    contentDOM,
    update(updated) {
      if (updated.type !== current.type) return false;
      const next = normalizeCalloutType(updated.attrs.callout as string | null);
      // Losing its type changes the shape of the view — let ProseMirror rebuild
      // it as a plain blockquote rather than reconciling chrome by hand.
      if (next === null) return false;
      current = updated;
      if (next !== type) {
        type = next;
        dom.setAttribute('data-callout', type);
        // Don't overwrite what is being typed; the title still tracks the type.
        if (document.activeElement === marker) title.innerHTML = calloutTitleHtml(type);
        else syncHead();
      }
      return true;
    },
    // The header is chrome, not content: its events belong to it, and its
    // mutations must not be read back into the document.
    stopEvent: (event) => head.contains(event.target as globalThis.Node | null),
    ignoreMutation: (mutation) => !contentDOM.contains(mutation.target as globalThis.Node)
  };
};
