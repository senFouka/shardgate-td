/**
 * Flow fields on the build grid.
 *
 * A flow field is a breadth-first search run backwards from a target cell: it
 * stores, for every walkable cell, how many steps it is from the target.
 * A creep anywhere on the map just steps to a neighbour with a smaller
 * number, so one search serves every creep at once. On this map creeps
 * walk in legs (spawn -> pylon 1 -> pylon 2 -> pylon 3 -> exit), so there is
 * one field per leg target.
 *
 * Pure TypeScript (no Three.js) so it runs in the Node tests.
 */
export interface Grid {
  cols: number;
  rows: number;
  /** true where creeps cannot walk */
  blocked: Uint8Array;
}

export interface FlowField {
  /** steps to the target, -1 where unreachable */
  dist: Int32Array;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function flowField(grid: Grid, targetCol: number, targetRow: number): FlowField {
  const { cols, rows, blocked } = grid;
  const dist = new Int32Array(cols * rows).fill(-1);
  const queue = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;
  const t = targetRow * cols + targetCol;
  dist[t] = 0;
  queue[tail++] = t;
  while (head < tail) {
    const i = queue[head++];
    const c = i % cols;
    const r = (i / cols) | 0;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const n = nr * cols + nc;
      if (blocked[n] || dist[n] >= 0) continue;
      dist[n] = dist[i] + 1;
      queue[tail++] = n;
    }
  }
  return { dist };
}

/** The cells a creep walks from (col,row) to the field's target, or null if cut off. */
export function walk(grid: Grid, field: FlowField, col: number, row: number): Array<[number, number]> | null {
  const { cols, rows } = grid;
  let i = row * cols + col;
  if (field.dist[i] < 0) return null;
  const out: Array<[number, number]> = [[col, row]];
  while (field.dist[i] > 0) {
    const c = i % cols;
    const r = (i / cols) | 0;
    let next = -1;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const n = nr * cols + nc;
      if (field.dist[n] === field.dist[i] - 1) {
        next = n;
        break;
      }
    }
    i = next;
    out.push([i % cols, (i / cols) | 0]);
  }
  return out;
}

/** The full route through every leg target in order, or null if any leg is cut off. */
export function route(grid: Grid, start: [number, number], targets: Array<[number, number]>): Array<[number, number]> | null {
  const out: Array<[number, number]> = [];
  let [c, r] = start;
  for (const [tc, tr] of targets) {
    const leg = walk(grid, flowField(grid, tc, tr), c, r);
    if (!leg) return null;
    out.push(...(out.length ? leg.slice(1) : leg));
    [c, r] = [tc, tr];
  }
  return out;
}
