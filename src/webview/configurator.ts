/**
 * Reusable element-configurator popover.
 *
 * A lightweight, anchored popover that renders a set of labelled fields (text or
 * select) and applies changes *live* (on every change) via an `onChange`
 * callback. This is the shared pattern for specialized element configuration —
 * image/figure settings today, and other elements later. Keep it
 * element-agnostic: callers supply field definitions and a callback; the popover
 * knows nothing about ProseMirror or what the values mean.
 */

export interface ConfigSelectOption {
  label: string;
  value: string;
}

export interface ConfigField {
  key: string;
  label: string;
  type?: 'text' | 'select';
  placeholder?: string;
  hint?: string;
  options?: ConfigSelectOption[];
}

export interface ConfiguratorOptions {
  title: string;
  fields: ConfigField[];
  values: Record<string, string>;
  anchor: { x: number; y: number };
  /** Called with all current field values whenever any field changes. */
  onChange: (values: Record<string, string>) => void;
  onClose?: () => void;
}

type Control = HTMLInputElement | HTMLSelectElement;

export function showConfigurator(opts: ConfiguratorOptions): void {
  document.querySelectorAll('.hd-config-popover').forEach((p) => p.remove());

  const pop = document.createElement('div');
  pop.className = 'hd-config-popover';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', opts.title);

  const header = document.createElement('div');
  header.className = 'hd-config-header';
  header.textContent = opts.title;
  pop.appendChild(header);

  const controls: Record<string, Control> = {};
  for (const field of opts.fields) {
    const row = document.createElement('label');
    row.className = 'hd-config-row';

    const label = document.createElement('span');
    label.className = 'hd-config-label';
    label.textContent = field.label;
    row.appendChild(label);

    let control: Control;
    if (field.type === 'select') {
      const select = document.createElement('select');
      select.className = 'hd-config-input';
      for (const opt of field.options ?? []) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        select.appendChild(o);
      }
      select.value = opts.values[field.key] ?? '';
      control = select;
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'hd-config-input';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.placeholder = field.placeholder ?? '';
      input.value = opts.values[field.key] ?? '';
      control = input;
    }

    controls[field.key] = control;
    row.appendChild(control);
    pop.appendChild(row);

    if (field.hint) {
      const hint = document.createElement('div');
      hint.className = 'hd-config-hint';
      hint.textContent = field.hint;
      pop.appendChild(hint);
    }
  }

  const footer = document.createElement('div');
  footer.className = 'hd-config-footer';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'hd-config-clear';
  clearBtn.textContent = 'Clear';

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'hd-config-done';
  doneBtn.textContent = 'Done';

  footer.appendChild(clearBtn);
  footer.appendChild(doneBtn);
  pop.appendChild(footer);

  document.body.appendChild(pop);

  // Position near the anchor, clamped to the viewport.
  const margin = 8;
  const rect = pop.getBoundingClientRect();
  let left = opts.anchor.x;
  let top = opts.anchor.y;
  if (left + rect.width + margin > window.innerWidth) left = window.innerWidth - rect.width - margin;
  if (top + rect.height + margin > window.innerHeight) top = window.innerHeight - rect.height - margin;
  pop.style.left = `${Math.max(margin, left)}px`;
  pop.style.top = `${Math.max(margin, top)}px`;

  const collect = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const key of Object.keys(controls)) out[key] = controls[key].value.trim();
    return out;
  };
  const fire = () => opts.onChange(collect());

  for (const key of Object.keys(controls)) {
    controls[key].addEventListener('input', fire);
    controls[key].addEventListener('change', fire);
  }

  const firstControl = Object.values(controls)[0];

  clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
  clearBtn.addEventListener('click', () => {
    for (const key of Object.keys(controls)) controls[key].value = '';
    fire();
    firstControl?.focus();
  });

  const close = () => {
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    pop.remove();
    opts.onClose?.();
  };

  doneBtn.addEventListener('mousedown', (e) => e.preventDefault());
  doneBtn.addEventListener('click', close);

  const onOutside = (e: MouseEvent) => {
    if (!pop.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  setTimeout(() => {
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    firstControl?.focus();
  }, 0);
}
