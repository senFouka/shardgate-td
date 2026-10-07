/** Tiny DOM helpers for the HTML UI layer. */

/** The UI root over the canvas (created on first use). */
export function uiRoot(): HTMLElement {
  let root = document.getElementById('ui');
  if (!root) {
    root = document.createElement('div');
    root.id = 'ui';
    document.body.appendChild(root);
  }
  return root;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

/**
 * A row of mutually exclusive buttons. `set` updates the pressed one without
 * firing `onPick`.
 */
export function segmented<T extends string | number | boolean>(
  options: Array<{ value: T; label: string }>,
  onPick: (value: T) => void,
  big = false,
): { node: HTMLElement; set(value: T | null): void } {
  const node = el('div', { class: big ? 'ui-seg big' : 'ui-seg', role: 'group' });
  const buttons = options.map((o) => {
    const b = el('button', { type: 'button', 'aria-pressed': 'false', text: o.label });
    b.addEventListener('click', () => onPick(o.value));
    node.append(b);
    return b;
  });
  return {
    node,
    set(value) {
      options.forEach((o, i) => buttons[i].setAttribute('aria-pressed', String(o.value === value)));
    },
  };
}
