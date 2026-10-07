import { el, uiRoot } from './dom';

let node: HTMLElement | null = null;
let timer = 0;

/** A short message at the bottom of the screen that fades by itself. */
export function toast(message: string, ms = 4000): void {
  if (!node) {
    node = el('div', { class: 'ui-toast hide', role: 'status', 'aria-live': 'polite' });
    uiRoot().append(node);
  }
  node.textContent = message;
  node.classList.remove('hide');
  window.clearTimeout(timer);
  timer = window.setTimeout(() => node?.classList.add('hide'), ms);
}
