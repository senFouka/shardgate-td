/** Single source of truth for colour. Art and UI both read from here. */
export const PALETTE = {
  // void around the play area
  voidDeep: '#090a12',
  voidMid: '#12121f',
  fog: '#2a2640',

  // map
  ground: '#1b1a2b',
  groundLine: '#2c2a44',
  rock: '#3b3852',
  rockLight: '#5d5878',

  // shards (the game's signature accent)
  shard: '#f2b94b',
  shardBright: '#ffe3a3',
  shardDeep: '#a8671c',

  // ui
  uiPanel: '#18162a',
  uiPanelEdge: '#4a4470',
  uiText: '#ece8f6',
  uiTextDim: '#9c95bd',
  gold: '#ffd166',
  good: '#6ee0a0',
  bad: '#ff6077',
} as const;

/** '#rrggbb' -> 0xrrggbb, for Phaser APIs that want a number. */
export function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}

/** '#rrggbb' + alpha -> 'rgba(r,g,b,a)' */
export function rgba(color: string, alpha: number): string {
  const n = parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
