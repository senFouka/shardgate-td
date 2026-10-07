/**
 * The vertical-slice map section, shared by both directions so they show
 * exactly the same scene. Units are grid cells; x to the right, y down the
 * screen (in 3D, y maps to +z, toward the camera).
 */
export const SECTION = { cols: 16, rows: 9 } as const;

/** Corners of the creep path, in cell coordinates (cell centres). */
export const PATH_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1.5, 2],
  [5, 2],
  [5, 6],
  [10, 6],
  [10, 2],
  [14, 2],
  [14, 7],
  [16.5, 7],
];

export type TowerKind = 'bolt' | 'ember' | 'frost';

export interface TowerSpot {
  kind: TowerKind;
  level: 1 | 2;
  col: number;
  row: number;
}

export const TOWERS: readonly TowerSpot[] = [
  { kind: 'bolt', level: 1, col: 3, row: 3 },
  { kind: 'bolt', level: 2, col: 8, row: 7 },
  { kind: 'ember', level: 1, col: 6, row: 4 },
  { kind: 'ember', level: 2, col: 12, row: 4 },
  { kind: 'frost', level: 1, col: 8, row: 4 },
  { kind: 'frost', level: 2, col: 12, row: 1 },
];

export interface TowerStats {
  range: number;
  /** seconds between shots */
  interval: number;
  damage: number;
  projectileSpeed: number;
}

export const TOWER_STATS: Record<TowerKind, Record<1 | 2, TowerStats>> = {
  bolt: {
    1: { range: 3, interval: 0.55, damage: 6, projectileSpeed: 14 },
    2: { range: 3.3, interval: 0.4, damage: 8, projectileSpeed: 16 },
  },
  ember: {
    1: { range: 3, interval: 1.0, damage: 14, projectileSpeed: 8 },
    2: { range: 3.5, interval: 0.8, damage: 20, projectileSpeed: 9 },
  },
  frost: {
    1: { range: 3, interval: 0.9, damage: 8, projectileSpeed: 11 },
    2: { range: 3.5, interval: 0.7, damage: 11, projectileSpeed: 12 },
  },
};

/** The big effect: the level-2 Ember tower calls down a meteor this often (s). */
export const METEOR_INTERVAL = 6;
export const METEOR_RADIUS = 1.6;
export const METEOR_DAMAGE = 60;
export const METEOR_RANGE = 7;

export type CreepKind = 'grunt' | 'brute';

export const CREEPS: Record<CreepKind, { hp: number; speed: number; scale: number }> = {
  grunt: { hp: 150, speed: 1.6, scale: 1 },
  brute: { hp: 480, speed: 1.0, scale: 1.35 },
};

/** Spawn pattern, repeated forever: [kind, delay before next spawn in s]. */
export const SPAWN_LOOP: ReadonlyArray<readonly [CreepKind, number]> = [
  ['grunt', 0.7],
  ['grunt', 0.7],
  ['grunt', 0.7],
  ['brute', 1.4],
  ['grunt', 0.7],
  ['grunt', 2.2],
];

export interface Decoration {
  kind: 'rock' | 'tree' | 'bush' | 'grass' | 'crystal';
  x: number;
  y: number;
  scale: number;
  rot: number;
}

/** Deterministic scatter so both directions show the same props. */
export function decorations(): Decoration[] {
  let s = 1337;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: Decoration[] = [];
  const blocked = (x: number, y: number) =>
    distToPath(x, y) < 0.9 || TOWERS.some((t) => Math.hypot(t.col - x, t.row - y) < 0.95);
  const tries: Array<[Decoration['kind'], number, number, number]> = [
    // kind, count, min scale, max scale
    ['tree', 16, 0.8, 1.25],
    ['rock', 14, 0.5, 1.1],
    ['bush', 14, 0.6, 1.0],
    ['grass', 60, 0.6, 1.1],
    ['crystal', 5, 0.6, 1.0],
  ];
  for (const [kind, count, lo, hi] of tries) {
    let placed = 0;
    for (let guard = 0; placed < count && guard < count * 40; guard++) {
      // trees prefer the map border, the rest anywhere
      const edge = kind === 'tree' && rnd() < 0.8;
      let x = rnd() * (SECTION.cols + 1) - 1;
      let y = rnd() * (SECTION.rows + 1) - 1;
      if (edge) {
        if (rnd() < 0.5) y = rnd() < 0.5 ? -0.8 + rnd() * 0.6 : SECTION.rows - 0.3 + rnd() * 0.6;
        else x = rnd() < 0.5 ? -0.8 + rnd() * 0.5 : SECTION.cols - 0.3 + rnd() * 0.5;
      }
      if (blocked(x, y)) continue;
      if (kind !== 'grass' && out.some((d) => d.kind !== 'grass' && Math.hypot(d.x - x, d.y - y) < 0.8)) continue;
      out.push({ kind, x, y, scale: lo + rnd() * (hi - lo), rot: rnd() * Math.PI * 2 });
      placed++;
    }
  }
  return out;
}

/** Distance from a point to the creep path polyline, in cells. */
export function distToPath(x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < PATH_CORNERS.length - 1; i++) {
    const [ax, ay] = PATH_CORNERS[i];
    const [bx, by] = PATH_CORNERS[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
}

/** Total path length in cells. */
export function pathLength(): number {
  let len = 0;
  for (let i = 0; i < PATH_CORNERS.length - 1; i++) {
    len += Math.hypot(PATH_CORNERS[i + 1][0] - PATH_CORNERS[i][0], PATH_CORNERS[i + 1][1] - PATH_CORNERS[i][1]);
  }
  return len;
}

/** Point and heading (radians, 0 = +x) at distance `d` along the path. */
export function pointAt(d: number): { x: number; y: number; heading: number } {
  let rest = d;
  for (let i = 0; i < PATH_CORNERS.length - 1; i++) {
    const [ax, ay] = PATH_CORNERS[i];
    const [bx, by] = PATH_CORNERS[i + 1];
    const seg = Math.hypot(bx - ax, by - ay);
    if (rest <= seg || i === PATH_CORNERS.length - 2) {
      const t = Math.min(1, rest / seg);
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, heading: Math.atan2(by - ay, bx - ax) };
    }
    rest -= seg;
  }
  const [x, y] = PATH_CORNERS[PATH_CORNERS.length - 1];
  return { x, y, heading: 0 };
}
