import {
  CREEPS,
  METEOR_DAMAGE,
  METEOR_INTERVAL,
  METEOR_RANGE,
  METEOR_RADIUS,
  SPAWN_LOOP,
  TOWERS,
  TOWER_STATS,
  pathLength,
  pointAt,
  type CreepKind,
  type TowerSpot,
} from './layout';

/**
 * Renderer-independent combat for the visual slices, so both directions show
 * the same fight. Fixed time step; renderers read the state and react to the
 * events.
 */
export interface Creep {
  id: number;
  kind: CreepKind;
  hp: number;
  maxHp: number;
  dist: number;
  x: number;
  y: number;
  heading: number;
  /** seconds of slow left (Frost) */
  chill: number;
  /** seconds of burn left (Ember) */
  burn: number;
  /** seconds since the last hit (for a hit flash) */
  hitAge: number;
  alive: boolean;
}

export interface Shot {
  id: number;
  tower: TowerSpot;
  target: Creep;
  x: number;
  y: number;
  /** height above ground, for arcs */
  z: number;
  startX: number;
  startY: number;
  travelled: number;
  total: number;
  done: boolean;
}

export type SimEvent =
  | { type: 'spawn'; creep: Creep }
  | { type: 'fire'; shot: Shot }
  | { type: 'hit'; shot: Shot; x: number; y: number }
  | { type: 'death'; creep: Creep }
  | { type: 'leak'; creep: Creep }
  | { type: 'meteor-warn'; x: number; y: number; delay: number }
  | { type: 'meteor'; x: number; y: number };

export const STEP = 1 / 60;
const METEOR_FALL = 0.9;

export class SliceSim {
  creeps: Creep[] = [];
  shots: Shot[] = [];
  time = 0;
  private nextId = 1;
  private spawnIdx = 0;
  private spawnTimer = 0.5;
  private cooldowns = new Map<TowerSpot, number>();
  private meteorTimer = 2.5;
  private pendingMeteor: { x: number; y: number; t: number } | null = null;
  private readonly length = pathLength();
  private readonly listeners: Array<(e: SimEvent) => void> = [];

  on(fn: (e: SimEvent) => void): void {
    this.listeners.push(fn);
  }

  private emit(e: SimEvent): void {
    for (const l of this.listeners) l(e);
  }

  /** Advance by `dt` seconds in fixed steps. */
  advance(dt: number): void {
    let left = Math.min(dt, 0.25);
    while (left > 1e-9) {
      const h = Math.min(STEP, left);
      this.step(h);
      left -= h;
    }
  }

  private step(h: number): void {
    this.time += h;
    this.spawnTimer -= h;
    if (this.spawnTimer <= 0) {
      const [kind, delay] = SPAWN_LOOP[this.spawnIdx % SPAWN_LOOP.length];
      this.spawnIdx++;
      this.spawnTimer += delay;
      const def = CREEPS[kind];
      const p = pointAt(0);
      const creep: Creep = {
        id: this.nextId++, kind, hp: def.hp, maxHp: def.hp, dist: 0, x: p.x, y: p.y, heading: p.heading,
        chill: 0, burn: 0, hitAge: 9, alive: true,
      };
      this.creeps.push(creep);
      this.emit({ type: 'spawn', creep });
    }

    for (const c of this.creeps) {
      if (!c.alive) continue;
      const speed = CREEPS[c.kind].speed * (c.chill > 0 ? 0.55 : 1);
      c.dist += speed * h;
      c.chill = Math.max(0, c.chill - h);
      c.hitAge += h;
      if (c.burn > 0) {
        c.burn = Math.max(0, c.burn - h);
        this.damage(c, 6 * h);
      }
      const p = pointAt(c.dist);
      c.x = p.x;
      c.y = p.y;
      c.heading = p.heading;
      if (c.dist >= this.length && c.alive) {
        c.alive = false;
        this.emit({ type: 'leak', creep: c });
      }
    }

    for (const t of TOWERS) {
      const cd = (this.cooldowns.get(t) ?? TOWERS.indexOf(t) * 0.09) - h;
      if (cd > 0) {
        this.cooldowns.set(t, cd);
        continue;
      }
      const stats = TOWER_STATS[t.kind][t.level];
      const target = this.pickTarget(t.col, t.row, stats.range);
      if (!target) {
        this.cooldowns.set(t, 0);
        continue;
      }
      this.cooldowns.set(t, stats.interval);
      const dist = Math.hypot(target.x - t.col, target.y - t.row);
      const shot: Shot = {
        id: this.nextId++, tower: t, target, x: t.col, y: t.row, z: 1, startX: t.col, startY: t.row,
        travelled: 0, total: dist, done: false,
      };
      this.shots.push(shot);
      this.emit({ type: 'fire', shot });
    }

    for (const s of this.shots) {
      const stats = TOWER_STATS[s.tower.kind][s.tower.level];
      const tx = s.target.x;
      const ty = s.target.y;
      const dx = tx - s.x;
      const dy = ty - s.y;
      const d = Math.hypot(dx, dy);
      const move = stats.projectileSpeed * h;
      s.travelled += move;
      if (d <= move || !s.target.alive) {
        s.x = tx;
        s.y = ty;
        s.done = true;
        if (s.target.alive) this.applyHit(s);
        this.emit({ type: 'hit', shot: s, x: tx, y: ty });
        continue;
      }
      s.x += (dx / d) * move;
      s.y += (dy / d) * move;
      const frac = Math.min(1, s.travelled / Math.max(0.01, s.total));
      // Ember lobs, the others fly flat
      s.z = s.tower.kind === 'ember' ? 1 + Math.sin(frac * Math.PI) * 0.9 - frac * 0.6 : 1 - frac * 0.55;
    }
    this.shots = this.shots.filter((s) => !s.done);

    // the big effect: a meteor from the level-2 Ember tower
    this.meteorTimer -= h;
    if (this.meteorTimer <= 0 && !this.pendingMeteor) {
      const ember = TOWERS.find((t) => t.kind === 'ember' && t.level === 2)!;
      const target = this.pickTarget(ember.col, ember.row, METEOR_RANGE, true);
      if (target) {
        this.pendingMeteor = { x: target.x, y: target.y, t: METEOR_FALL };
        this.emit({ type: 'meteor-warn', x: target.x, y: target.y, delay: METEOR_FALL });
        this.meteorTimer = METEOR_INTERVAL;
      }
    }
    if (this.pendingMeteor) {
      this.pendingMeteor.t -= h;
      if (this.pendingMeteor.t <= 0) {
        const { x, y } = this.pendingMeteor;
        this.pendingMeteor = null;
        this.emit({ type: 'meteor', x, y });
        for (const c of this.creeps) {
          if (c.alive && Math.hypot(c.x - x, c.y - y) <= METEOR_RADIUS) {
            c.burn = 2;
            this.damage(c, METEOR_DAMAGE);
          }
        }
      }
    }

    this.creeps = this.creeps.filter((c) => c.alive);
  }

  private pickTarget(x: number, y: number, range: number, densest = false): Creep | null {
    let best: Creep | null = null;
    let bestScore = -Infinity;
    for (const c of this.creeps) {
      if (!c.alive || Math.hypot(c.x - x, c.y - y) > range) continue;
      const score = densest
        ? this.creeps.filter((o) => o.alive && Math.hypot(o.x - c.x, o.y - c.y) < METEOR_RADIUS).length
        : c.dist;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  private applyHit(s: Shot): void {
    const stats = TOWER_STATS[s.tower.kind][s.tower.level];
    if (s.tower.kind === 'frost') s.target.chill = 1.6;
    if (s.tower.kind === 'ember') s.target.burn = 1.5;
    this.damage(s.target, stats.damage);
  }

  private damage(c: Creep, amount: number): void {
    if (!c.alive) return;
    c.hp -= amount;
    if (amount >= 1) c.hitAge = 0;
    if (c.hp <= 0) {
      c.alive = false;
      this.emit({ type: 'death', creep: c });
    }
  }
}
