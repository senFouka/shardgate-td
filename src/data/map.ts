/**
 * The first map: "Shardgate Spiral". Pure data (no Three.js) so tests can load it.
 *
 * Layout requested by the user (modelled on the route of Element TD 2's
 * classic map, our own art): two portals side by side at the top. Creeps
 * come out of the blue portal, go left and down, turn into an inner spiral,
 * wind toward the centre, come back out just below where they went in, then
 * run the outer lane along the bottom and up the right side into the red
 * portal. Lanes run side by side with a strip of grass between them, so a
 * tower there hits creeps on two passes; the grass in the middle reaches
 * almost the whole route.
 *
 * The route is laid out on a coarse grid of "nodes"; each node is a 4x4
 * block of cells: a 2-cell lane plus a 2-cell strip of grass.
 * Units are grid cells; col grows to the right, row grows toward the camera.
 */
export interface Cell {
  col: number;
  row: number;
}

/** Coarse nodes the lane passes through, in walking order (node col, node row). */
export const ROUTE_NODES: ReadonlyArray<readonly [number, number]> = [
  // out of the blue portal, left along the top, down the left side
  [3, 0], [2, 0], [1, 0], [0, 0], [0, 1], [0, 2],
  // into the inner spiral
  [1, 2], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1],
  [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 5], [4, 5], [3, 5], [2, 5], [1, 5],
  [1, 4], [2, 4], [3, 4], [4, 4], [5, 4],
  [5, 3], [5, 2], [4, 2], [3, 2], [2, 2],
  [2, 3], [1, 3],
  // back out, down the left side, along the bottom, up the right side
  [0, 3], [0, 4], [0, 5], [0, 6],
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6],
  [7, 5], [7, 4], [7, 3], [7, 2], [7, 1], [7, 0],
  // left along the top into the red portal
  [6, 0], [5, 0], [4, 0],
];

export const NODE = 4;
export const LANE = 2;
/** grass border around the node grid */
export const BORDER = 2;
export const NODE_COLS = 8;
export const NODE_ROWS = 7;

export const MAP = {
  cols: NODE_COLS * NODE + BORDER, // 34: the last node's grass strip is the right border
  rows: NODE_ROWS * NODE + BORDER, // 30
} as const;

/** Top-left cell of a node's lane block. */
export function nodeCell(nc: number, nr: number): Cell {
  return { col: nc * NODE + BORDER, row: nr * NODE + BORDER };
}

/** Centre of a node's lane in cell coordinates (between its two lane cells). */
export function nodeCenter(nc: number, nr: number): { col: number; row: number } {
  const c = nodeCell(nc, nr);
  return { col: c.col + (LANE - 1) / 2, row: c.row + (LANE - 1) / 2 };
}

/** Portals stand just outside the top edge, above the first and last nodes. */
export const SPAWN_NODE = ROUTE_NODES[0];
export const EXIT_NODE = ROUTE_NODES[ROUTE_NODES.length - 1];

export type CellKind = 'grass' | 'lane';

/** Grid of cell kinds, row-major (index = row * cols + col). Lanes connect consecutive nodes only. */
export function buildGrid(): CellKind[] {
  const g: CellKind[] = new Array(MAP.cols * MAP.rows).fill('grass');
  const paint = (c0: number, r0: number, c1: number, r1: number) => {
    for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) {
      for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) g[r * MAP.cols + c] = 'lane';
    }
  };
  ROUTE_NODES.forEach(([nc, nr], i) => {
    const a = nodeCell(nc, nr);
    paint(a.col, a.row, a.col + LANE - 1, a.row + LANE - 1);
    const next = ROUTE_NODES[i + 1];
    if (next) {
      const b = nodeCell(next[0], next[1]);
      paint(a.col, a.row, b.col + LANE - 1, b.row + LANE - 1);
    }
  });
  // the portal stubs reach the top edge
  for (const [nc, nr] of [SPAWN_NODE, EXIT_NODE]) {
    const a = nodeCell(nc, nr);
    paint(a.col, 0, a.col + LANE - 1, a.row);
  }
  return g;
}

/**
 * The walking route as a polyline of lane centres (cell coordinates),
 * starting at the blue portal and ending at the red one.
 */
export function routePolyline(): Array<{ col: number; row: number }> {
  const pts = ROUTE_NODES.map(([nc, nr]) => nodeCenter(nc, nr));
  const first = pts[0];
  const last = pts[pts.length - 1];
  return [{ col: first.col, row: -1.2 }, ...pts, { col: last.col, row: -1.2 }];
}

/** Total route length in cells. */
export function routeLength(): number {
  const p = routePolyline();
  let len = 0;
  for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].col - p[i - 1].col, p[i].row - p[i - 1].row);
  return len;
}
