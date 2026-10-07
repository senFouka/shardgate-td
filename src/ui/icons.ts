/** Our own line icons (inline SVG, inherits text colour). */
const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  soundOn: svg('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  soundOff: svg('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  // a gear made of a crystal facet ring, to match the shard theme
  settings: svg('<path d="M12 3l2 2.6 3.2-.6.6 3.2L20.4 10 19 12l1.4 2-2.6 1.8-.6 3.2-3.2-.6L12 21l-2-2.6-3.2.6-.6-3.2L3.6 14 5 12l-1.4-2 2.6-1.8.6-3.2 3.2.6z"/><circle cx="12" cy="12" r="3"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
};
