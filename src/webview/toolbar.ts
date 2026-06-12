import type { Editor } from '@tiptap/core';

interface ButtonSpec {
  label: string;
  title: string;
  command: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
}

const BUTTONS: ButtonSpec[] = [
  {
    label: 'H1', title: 'Heading 1',
    command: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    isActive: (e) => e.isActive('heading', { level: 1 })
  },
  {
    label: 'H2', title: 'Heading 2',
    command: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    isActive: (e) => e.isActive('heading', { level: 2 })
  },
  {
    label: 'H3', title: 'Heading 3',
    command: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    isActive: (e) => e.isActive('heading', { level: 3 })
  },
  {
    label: 'B', title: 'Bold',
    command: (e) => e.chain().focus().toggleBold().run(),
    isActive: (e) => e.isActive('bold')
  },
  {
    label: 'I', title: 'Italic',
    command: (e) => e.chain().focus().toggleItalic().run(),
    isActive: (e) => e.isActive('italic')
  },
  {
    label: 'U', title: 'Underline',
    command: (e) => e.chain().focus().toggleUnderline().run(),
    isActive: (e) => e.isActive('underline')
  },
  {
    label: '</>', title: 'Inline code',
    command: (e) => e.chain().focus().toggleCode().run(),
    isActive: (e) => e.isActive('code')
  },
  {
    label: '{ }', title: 'Code block',
    command: (e) => e.chain().focus().toggleCodeBlock().run(),
    isActive: (e) => e.isActive('codeBlock')
  },
  {
    label: 'Link', title: 'Insert/edit link',
    command: (e) => {
      const url = window.prompt('URL', '');
      if (!url) return;
      e.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    },
    isActive: (e) => e.isActive('link')
  },
  {
    label: '•', title: 'Bullet list',
    command: (e) => e.chain().focus().toggleBulletList().run(),
    isActive: (e) => e.isActive('bulletList')
  },
  {
    label: '1.', title: 'Ordered list',
    command: (e) => e.chain().focus().toggleOrderedList().run(),
    isActive: (e) => e.isActive('orderedList')
  },
  {
    label: '"', title: 'Blockquote',
    command: (e) => e.chain().focus().toggleBlockquote().run(),
    isActive: (e) => e.isActive('blockquote')
  },
  {
    label: '—', title: 'Horizontal rule',
    command: (e) => e.chain().focus().setHorizontalRule().run()
  },
  {
    label: 'Table', title: 'Insert table',
    command: (e) => e.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()
  }
];

export function setupToolbar(root: HTMLElement, editor: Editor): void {
  root.innerHTML = '';
  const buttons: HTMLButtonElement[] = [];
  for (const spec of BUTTONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = spec.title;
    btn.textContent = spec.label;
    btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep selection
    btn.addEventListener('click', () => spec.command(editor));
    root.appendChild(btn);
    buttons.push(btn);
  }
  const refresh = () => {
    buttons.forEach((btn, i) => {
      const active = BUTTONS[i].isActive?.(editor) ?? false;
      btn.classList.toggle('active', active);
    });
  };
  editor.on('selectionUpdate', refresh);
  editor.on('update', refresh);
  refresh();
}
