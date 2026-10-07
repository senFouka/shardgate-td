/**
 * The rules of a game, independent of rendering: creeps walking the route,
 * waves and their pacing, bosses, towers and their levels, shots, gold,
 * interest, lives, elements, game over.
 *
 * Pure TypeScript (no Three.js, no DOM) so the unit tests and the autonomous
 * bots can run it directly. Views subscribe to `on(...)` and read the state.
 * Everything runs on game time: the caller advances it with `advance(dt)`.
 *
 * Wave pacing (set by the user): a creep needs about a minute to walk the
 * route; a wave gets at most 80 s; once it is cleared (or its time is up) a
 * 10 s rest counts down to the next wave, which the player can start at any
 * time after the wave has finished spawning.
 *
 * Elements: the player picks one at the start of every 5th wave (none before
 * that: the first waves are Bolt and Mortar only, set by the user). The first
 * pick unlocks at once; each later pick summons that element's boss, and the
 * element unlocks (or levels up) when the boss dies or gets through. Each wave wears an armor element; element towers deal
 * x1.5 to the next element in the cycle and x0.5 to the previous one.
 */
import { BALANCE, MAX_TOWER_LEVEL, creepBounty, creepHp, towerStats, type TowerKind, type TowerStats } from '../data/balance.ts';
import { ELEMENT_ORDER, WAVE_ARMOR, elementMultiplier, type ElementId } from '../data/elements.ts';
import { ELEMENT_BOSS_CREEPS, isFlyingLook, waveLook } from '../data/creeps.ts';
import { MAP, buildGrid, routePolyline } from '../data/map.ts';
import type { DifficultyId } from '../data/difficulty.ts';

export type TowerId = TowerKind;

export function isElement(kind: TowerId): kind is ElementId {
  return (ELEMENT_ORDER as readonly string[]).includes(kind);
}

/** Towers that lob a shell to where the target will be (the rest home in). */
const LOBBED: ReadonlySet<TowerId> = new Set<TowerId>(['mortar', 'tide']);

export interface Creep {
  id: number;
  wave: number;
  boss: boolean;
  hp: number;
  maxHp: number;
  speed: number;
  /** cells walked along the route */
  dist: number;
  /** position in cell coordinates */
  col: number;
  row: number;
  /** radians, 0 = +col */
  heading: number;
  bounty: number;
  leakCost: number;
  /** seconds since the last hit (for a hit flash) */
  hitAge: number;
  alive: boolean;
  /** model/name id (data/creeps.ts) */
  look: string;
  flying: boolean;
  armor: ElementId | null;
  /** set on element bosses: the element they hand over */
  elementBoss: ElementId | null;
  /** status effects: seconds left and strength */
  slowLeft: number;
  slowFactor: number;
  stunLeft: number;
  burnLeft: number;
  burnDps: number;
  burnBy: Tower | null;
  poisonLeft: number;
  poisonStacks: number;
  poisonDps: number;
  /** extra damage taken per poison stack */
  poisonShred: number;
  poisonBy: Tower | null;
}

export interface Tower {
  id: number;
  kind: TowerId;
  col: number;
  row: number;
  level: number;
  /** gold spent on it (build + upgrades + conversion), for refunds */
  spent: number;
  /** waves started when it was built (full refund until another wave starts) */
  builtAtWave: number;
  cooldown: number;
  kills: number;
  damageDealt: number;
  /** construction in progress (the tower does not shoot meanwhile), or null */
  work: TowerWork | null;
}

export interface TowerWork {
  type: 'build' | 'upgrade' | 'convert';
  /** seconds left and in total */
  left: number;
  total: number;
  /** convert: the element tower it becomes */
  to: ElementId | null;
}

export interface Shot {
  id: number;
  tower: Tower;
  /** the tower's stats when it fired */
  stats: TowerStats;
  /** homing shots follow this creep; lobbed shells land where it was going to be */
  target: Creep | null;
  col: number;
  row: number;
  toCol: number;
  toRow: number;
  /** 0..1 progress for lobbed shots */
  t: number;
  flight: number;
  startCol: number;
  startRow: number;
  done: boolean;
  /** lobbed shell (lands on a point) rather than a homing projectile */
  lob: boolean;
  /** Gale: the points the lightning jumped through, tower first */
  chain: Array<{ col: number; row: number }> | null;
}

export type GoldReason = 'kill' | 'interest' | 'income' | 'build' | 'upgrade' | 'sell' | 'early' | 'convert' | 'pick';

export type GameEvent =
  | { type: 'wave-start'; wave: number; boss: boolean }
  | { type: 'spawn'; creep: Creep }
  | { type: 'fire'; shot: Shot }
  | { type: 'hit'; shot: Shot; col: number; row: number }
  | { type: 'death'; creep: Creep; tower: Tower | null }
  | { type: 'leak'; creep: Creep }
  | { type: 'gold'; gold: number; delta: number; reason: GoldReason }
  | { type: 'lives'; lives: number }
  /** a tower was placed: it is under construction until 'built' */
  | { type: 'build'; tower: Tower }
  | { type: 'built'; tower: Tower }
  /** an upgrade or conversion was paid for and started */
  | { type: 'work-start'; tower: Tower }
  /** an upgrade finished: the tower is now at its new level */
  | { type: 'upgrade'; tower: Tower }
  | { type: 'sell'; tower: Tower; refund: number }
  /** a conversion finished: the tower is now an element tower */
  | { type: 'convert'; tower: Tower; from: TowerId }
  /** the element offer changed (null when no pick is waiting) */
  | { type: 'offer'; offer: ElementId[] | null }
  /** an element boss was summoned by a pick */
  | { type: 'summon'; element: ElementId; creep: Creep }
  /** an element was unlocked (level 1) or levelled up */
  | { type: 'element'; element: ElementId; level: number }
  | { type: 'over'; won: boolean; wave: number };

export type Phase = 'ready' | 'playing' | 'won' | 'lost';
export type BuildError = 'not-grass' | 'occupied' | 'gold' | 'over' | 'max' | 'locked' | 'busy';

const STEP = 1 / 60;

export class Game {
  readonly route = routePolyline();
  readonly routeLength: number;
  /** normal creep speed: the whole route in `routeSeconds` */
  readonly creepSpeed: number;
  private readonly segLen: number[] = [];
  private readonly grass: boolean[];

  phase: Phase = 'ready';
  gold: number;
  lives: number;
  time = 0;
  /** waves started so far (the current wave number) */
  wave = 0;
  creeps: Creep[] = [];
  towers: Tower[] = [];
  shots: Shot[] = [];
  /** seconds of rest left before the next wave (0 while a wave runs) */
  countdown = 0;
  /** seconds since the current wave started */
  waveTime = 0;
  /** element levels (0 = not owned) */
  readonly elements: Record<ElementId, number> = { ember: 0, frost: 0, gale: 0, stone: 0, venom: 0, tide: 0 };
  /** the three elements on offer while a pick is waiting, else null */
  offer: ElementId[] | null = null;
  /** creeps of the current wave still to spawn (a boss counts as one, and comes last) */
  private toSpawn = 0;
  private bossPending = false;
  private spawnTimer = 0;
  private interestTimer = 0;
  private passiveTimer = 0;
  private nextId = 1;
  /** picks earned but not made yet */
  private picksOwed = 0;
  private picksMade = 0;
  private rng: number;
  private readonly listeners: Array<(e: GameEvent) => void> = [];

  /** this game's difficulty numbers (locked for the game) */
  private readonly diff: (typeof BALANCE.difficulty)[DifficultyId];

  readonly difficulty: DifficultyId;

  constructor(seed = (Math.random() * 2 ** 32) >>> 0, difficulty: DifficultyId = 'medium') {
    this.difficulty = difficulty;
    this.rng = seed >>> 0 || 1;
    this.diff = BALANCE.difficulty[difficulty];
    this.gold = this.diff.startGold;
    this.lives = this.diff.lives;
    let len = 0;
    for (let i = 1; i < this.route.length; i++) {
      const d = Math.hypot(this.route[i].col - this.route[i - 1].col, this.route[i].row - this.route[i - 1].row);
      this.segLen.push(d);
      len += d;
    }
    this.routeLength = len;
    this.creepSpeed = len / BALANCE.waves.routeSeconds;
    this.grass = buildGrid().map((k) => k === 'grass');
  }

  on(fn: (e: GameEvent) => void): void {
    this.listeners.push(fn);
  }

  private emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }

  /* --------------------------------------------------------------- waves */

  static isBossWave(wave: number): boolean {
    return wave > 0 && wave % BALANCE.bosses.every === 0;
  }

  /** Armor element of a wave's creeps (null = none). */
  static waveArmor(wave: number): ElementId | null {
    return WAVE_ARMOR[wave - 1] ?? null;
  }

  /** Waves that earn an element pick when they start. */
  static isPickWave(wave: number): boolean {
    return wave > 0 && wave % BALANCE.elements.every === 0 && wave < BALANCE.waves.count;
  }

  /** True when the player may start the next wave now. */
  get canCallWave(): boolean {
    if (this.phase === 'ready') return true;
    return this.phase === 'playing' && this.toSpawn === 0 && this.wave < BALANCE.waves.count;
  }

  /** Seconds until the next wave would start by itself. */
  get secondsToNextWave(): number {
    if (this.countdown > 0) return this.countdown;
    return Math.max(0, BALANCE.waves.maxWaveTime - this.waveTime) + BALANCE.waves.countdown;
  }

  /** Gold the player gets for starting the next wave now. */
  get earlyBonus(): number {
    if (this.phase !== 'playing' || !this.canCallWave) return 0;
    const w = BALANCE.waves;
    return Math.floor(Math.min(w.earlyGoldMax, Math.floor(this.secondsToNextWave) * w.earlyGoldPerSecond));
  }

  /** Starts the first wave, or the next one early ("Start now", with a gold bonus). */
  callWave(): void {
    if (!this.canCallWave) return;
    if (this.phase === 'ready') {
      this.phase = 'playing';
      this.startWave();
      return;
    }
    const bonus = this.earlyBonus;
    if (bonus > 0) this.addGold(bonus, 'early');
    this.startWave();
  }

  private startWave(): void {
    this.wave++;
    this.countdown = 0;
    this.waveTime = 0;
    this.bossPending = Game.isBossWave(this.wave);
    this.toSpawn = BALANCE.waves.size + (this.bossPending ? 1 : 0);
    this.spawnTimer = 0;
    this.emit({ type: 'wave-start', wave: this.wave, boss: this.bossPending });
    if (Game.isPickWave(this.wave)) {
      this.picksOwed++;
      if (!this.offer) {
        this.offer = this.makeOffer();
        this.emit({ type: 'offer', offer: this.offer });
      }
    }
  }

  /* ------------------------------------------------------------ elements */

  private random(): number {
    // mulberry32: small and seeded (the same seed plays the same game)
    let t = (this.rng = (this.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private makeOffer(): ElementId[] {
    const pool = [...ELEMENT_ORDER];
    const out: ElementId[] = [];
    while (out.length < 3) out.push(pool.splice(Math.floor(this.random() * pool.length), 1)[0]);
    return out;
  }

  /** True while a boss of this element is on the route. */
  isSummoned(el: ElementId): boolean {
    return this.creeps.some((c) => c.alive && c.elementBoss === el);
  }

  /** True when the next pick unlocks at once (the first pick of a game). */
  get pickIsFree(): boolean {
    return this.picksMade === 0;
  }

  /**
   * Takes one of the offered elements, or 'random' (any element, plus gold).
   * The first pick unlocks at once; later picks summon the element's boss.
   */
  pick(choice: ElementId | 'random'): ElementId | null {
    if (!this.offer || this.phase === 'won' || this.phase === 'lost') return null;
    if (choice !== 'random' && !this.offer.includes(choice)) return null;
    const el = choice === 'random' ? ELEMENT_ORDER[Math.floor(this.random() * ELEMENT_ORDER.length)] : choice;
    if (choice === 'random') this.addGold(BALANCE.elements.randomGold, 'pick');
    const free = this.pickIsFree;
    this.picksOwed--;
    this.picksMade++;
    this.offer = this.picksOwed > 0 ? this.makeOffer() : null;
    this.emit({ type: 'offer', offer: this.offer });
    if (free) this.grantElement(el);
    else this.spawnElementBoss(el);
    return el;
  }

  private grantElement(el: ElementId): void {
    this.elements[el]++;
    this.emit({ type: 'element', element: el, level: this.elements[el] });
  }

  /** Damage multiplier from the tower's element level (levels 2-3 boost all its towers). */
  levelBonus(kind: TowerId): number {
    if (!isElement(kind)) return 1;
    return 1 + BALANCE.elements.levelBonus * Math.max(0, this.elements[kind] - 1);
  }

  /* -------------------------------------------------------------- towers */

  canBuild(kind: TowerId, col: number, row: number): BuildError | null {
    if (this.phase === 'won' || this.phase === 'lost') return 'over';
    if (col < 0 || row < 0 || col >= MAP.cols || row >= MAP.rows || !this.grass[row * MAP.cols + col]) return 'not-grass';
    if (this.towerAt(col, row)) return 'occupied';
    if (isElement(kind) && this.elements[kind] < 1) return 'locked';
    if (this.gold < towerStats(kind, 1).cost) return 'gold';
    return null;
  }

  build(kind: TowerId, col: number, row: number): Tower | BuildError {
    const err = this.canBuild(kind, col, row);
    if (err) return err;
    const cost = towerStats(kind, 1).cost;
    const time = BALANCE.construction.build;
    const tower: Tower = {
      id: this.nextId++, kind, col, row, level: 1, spent: cost, builtAtWave: this.wave, cooldown: 0, kills: 0, damageDealt: 0,
      work: time > 0 ? { type: 'build', left: time, total: time, to: null } : null,
    };
    this.towers.push(tower);
    this.addGold(-cost, 'build');
    this.emit({ type: 'build', tower });
    return tower;
  }

  /** Price of the next level, or null at max level. */
  upgradeCost(t: Tower): number | null {
    return t.level >= MAX_TOWER_LEVEL ? null : towerStats(t.kind, t.level + 1).cost;
  }

  /** Seconds an upgrade from the tower's current level takes. */
  static upgradeTime(level: number): number {
    const u = BALANCE.construction.upgrade;
    return u[Math.min(u.length - 1, Math.max(0, level - 1))];
  }

  canUpgrade(t: Tower): BuildError | null {
    if (this.phase === 'won' || this.phase === 'lost') return 'over';
    const cost = this.upgradeCost(t);
    if (cost === null) return 'max';
    if (t.work) return 'busy';
    if (this.gold < cost) return 'gold';
    return null;
  }

  upgrade(t: Tower): BuildError | null {
    const err = this.canUpgrade(t);
    if (err) return err;
    const cost = this.upgradeCost(t)!;
    t.spent += cost;
    this.addGold(-cost, 'upgrade');
    const time = Game.upgradeTime(t.level);
    t.work = { type: 'upgrade', left: time, total: time, to: null };
    this.emit({ type: 'work-start', tower: t });
    if (time <= 0) this.finishWork(t);
    return null;
  }

  /**
   * Price to turn a basic tower into an element tower of the same level:
   * what the element tower costs up to that level, minus what the basic one did.
   * Null for towers that cannot convert (element towers, until duals exist).
   */
  convertCost(t: Tower, el: ElementId): number | null {
    if (isElement(t.kind)) return null;
    let diff = 0;
    for (let l = 1; l <= t.level; l++) diff += towerStats(el, l).cost - towerStats(t.kind, l).cost;
    return Math.max(BALANCE.elements.minConvertCost, diff);
  }

  canConvert(t: Tower, el: ElementId): BuildError | null {
    if (this.phase === 'won' || this.phase === 'lost') return 'over';
    const cost = this.convertCost(t, el);
    if (cost === null) return 'max';
    if (t.work) return 'busy';
    if (this.elements[el] < 1) return 'locked';
    if (this.gold < cost) return 'gold';
    return null;
  }

  convert(t: Tower, el: ElementId): BuildError | null {
    const err = this.canConvert(t, el);
    if (err) return err;
    const cost = this.convertCost(t, el)!;
    t.spent += cost;
    this.addGold(-cost, 'convert');
    const time = BALANCE.construction.convert;
    t.work = { type: 'convert', left: time, total: time, to: el };
    this.emit({ type: 'work-start', tower: t });
    if (time <= 0) this.finishWork(t);
    return null;
  }

  /** Ticks every tower's construction. */
  private workStep(h: number): void {
    for (const t of this.towers) {
      if (!t.work) continue;
      t.work.left -= h;
      if (t.work.left <= 0) this.finishWork(t);
    }
  }

  private finishWork(t: Tower): void {
    const w = t.work;
    if (!w) return;
    t.work = null;
    t.cooldown = 0;
    if (w.type === 'build') this.emit({ type: 'built', tower: t });
    else if (w.type === 'upgrade') {
      t.level++;
      this.emit({ type: 'upgrade', tower: t });
    } else if (w.to) {
      const from = t.kind;
      t.kind = w.to;
      this.emit({ type: 'convert', tower: t, from });
    }
  }

  towerAt(col: number, row: number): Tower | null {
    return this.towers.find((t) => t.col === col && t.row === row) ?? null;
  }

  refundFor(tower: Tower): number {
    const e = BALANCE.economy;
    const share = tower.builtAtWave === this.wave ? e.sellRefundSameWave : e.sellRefund;
    return Math.floor(tower.spent * share);
  }

  sell(tower: Tower): number {
    if (!this.towers.includes(tower)) return 0;
    const refund = this.refundFor(tower);
    this.towers = this.towers.filter((t) => t !== tower);
    this.addGold(refund, 'sell');
    this.emit({ type: 'sell', tower, refund });
    return refund;
  }

  /** Damage per second of a tower level against one target (splash, chains and damage over time not counted). */
  static dps(kind: TowerId, level = 1): number {
    const s = towerStats(kind, level);
    return s.damage / s.interval;
  }

  /* ---------------------------------------------------------------- loop */

  advance(dt: number): void {
    // before the first wave only construction moves (towers built early finish on time)
    if (this.phase === 'ready') {
      this.workStep(Math.min(dt, 0.25));
      return;
    }
    if (this.phase !== 'playing') return;
    let left = Math.min(dt, 0.25);
    while (left > 1e-9 && this.phase === 'playing') {
      const h = Math.min(STEP, left);
      this.step(h);
      left -= h;
    }
  }

  private step(h: number): void {
    this.time += h;
    const w = BALANCE.waves;

    // spawning; then, once the wave is cleared or out of time, the rest countdown
    if (this.toSpawn > 0) {
      this.spawnTimer -= h;
      if (this.spawnTimer <= 0) {
        const boss = this.toSpawn === 1 && this.bossPending;
        this.spawn(boss);
        if (boss) this.bossPending = false;
        this.toSpawn--;
        // the boss walks a little behind its pack
        this.spawnTimer += this.toSpawn === 1 && this.bossPending ? w.spacing * 6 : w.spacing;
      }
    }
    this.waveTime += h;
    if (this.toSpawn === 0 && this.wave < w.count) {
      if (this.countdown > 0) {
        this.countdown -= h;
        if (this.countdown <= 0) this.startWave();
      } else {
        // element bosses walk on their own clock: they do not hold the next wave back
        const cleared = !this.creeps.some((c) => c.alive && c.wave === this.wave && !c.elementBoss);
        if (cleared || this.waveTime >= w.maxWaveTime) this.countdown = w.countdown;
      }
    }

    // a trickle of gold
    this.passiveTimer += h;
    if (this.passiveTimer >= BALANCE.economy.passivePeriod) {
      this.passiveTimer -= BALANCE.economy.passivePeriod;
      this.addGold(BALANCE.economy.passiveGold, 'income');
    }

    // interest on banked gold
    this.interestTimer += h;
    if (this.interestTimer >= BALANCE.economy.interestPeriod) {
      this.interestTimer -= BALANCE.economy.interestPeriod;
      const gain = Math.floor(this.gold * BALANCE.economy.interestRate);
      if (gain > 0) this.addGold(gain, 'interest');
    }

    for (const c of this.creeps) {
      if (!c.alive) continue;
      this.statusStep(c, h);
      if (!c.alive) continue;
      const factor = c.stunLeft > 0 ? 0 : c.slowLeft > 0 ? c.slowFactor : 1;
      c.dist += c.speed * factor * h;
      c.hitAge += h;
      if (c.dist >= this.routeLength) {
        c.alive = false;
        this.lives = Math.max(0, this.lives - c.leakCost);
        this.emit({ type: 'leak', creep: c });
        this.emit({ type: 'lives', lives: this.lives });
        // an element boss that gets through still hands over its element
        if (c.elementBoss) this.grantElement(c.elementBoss);
        continue;
      }
      this.place(c);
    }

    this.workStep(h);
    for (const t of this.towers) if (!t.work) this.towerStep(t, h);
    for (const s of this.shots) this.shotStep(s, h);
    this.shots = this.shots.filter((s) => !s.done);
    this.creeps = this.creeps.filter((c) => c.alive);

    if (this.lives <= 0) {
      this.phase = 'lost';
      this.emit({ type: 'over', won: false, wave: this.wave });
    } else if (this.wave >= w.count && this.toSpawn === 0 && this.creeps.length === 0) {
      this.phase = 'won';
      this.emit({ type: 'over', won: true, wave: this.wave });
    }
  }

  private spawn(boss: boolean): void {
    const b = BALANCE.bosses;
    const hp = Math.round(creepHp(this.wave) * (boss ? b.hpFactor * this.hpScale(this.diff.bossHp) : this.hpScale(this.diff.hp)));
    const c = this.newCreep(waveLook(this.wave, boss), hp, this.creepSpeed * (boss ? b.speedFactor : 1), Game.waveArmor(this.wave));
    c.boss = boss;
    c.bounty = Math.max(1, Math.round((boss ? b.bountyBase + this.wave : creepBounty(this.wave)) * this.diff.bounty));
    c.leakCost = boss ? b.leakCost : BALANCE.waves.leakCost;
    this.creeps.push(c);
    this.emit({ type: 'spawn', creep: c });
  }

  private spawnElementBoss(el: ElementId): void {
    const e = BALANCE.elements;
    const hp = Math.round(creepHp(Math.max(1, this.wave)) * e.bossHpFactor * this.hpScale(this.diff.bossHp));
    const c = this.newCreep(ELEMENT_BOSS_CREEPS[el], hp, this.creepSpeed * e.bossSpeedFactor, el);
    c.boss = true;
    c.elementBoss = el;
    c.bounty = Math.max(1, Math.round(e.bossBounty * this.diff.bounty));
    c.leakCost = e.bossLeakCost;
    this.creeps.push(c);
    this.emit({ type: 'spawn', creep: c });
    this.emit({ type: 'summon', element: el, creep: c });
  }

  /** A difficulty hp multiplier on the current wave, eased in over the first waves. */
  private hpScale(mult: number): number {
    const r = BALANCE.difficultyRamp;
    const k = r.rampStart + (1 - r.rampStart) * Math.min(1, (Math.max(1, this.wave) - 1) / r.rampWaves);
    return 1 + (mult - 1) * k;
  }

  private newCreep(look: string, hp: number, speed: number, armor: ElementId | null): Creep {
    const c: Creep = {
      id: this.nextId++, wave: this.wave, boss: false, hp, maxHp: hp, speed, dist: 0, col: 0, row: 0, heading: Math.PI / 2,
      bounty: 0, leakCost: 1, hitAge: 9, alive: true,
      look, flying: isFlyingLook(look), armor, elementBoss: null,
      slowLeft: 0, slowFactor: 1, stunLeft: 0, burnLeft: 0, burnDps: 0, burnBy: null,
      poisonLeft: 0, poisonStacks: 0, poisonDps: 0, poisonShred: 0, poisonBy: null,
    };
    this.place(c);
    return c;
  }

  /** Ticks burn, poison, slow and stun. */
  private statusStep(c: Creep, h: number): void {
    if (c.slowLeft > 0 && (c.slowLeft -= h) <= 0) c.slowFactor = 1;
    if (c.stunLeft > 0) c.stunLeft -= h;
    if (c.burnLeft > 0) {
      const tick = Math.min(h, c.burnLeft);
      c.burnLeft -= h;
      this.damage(c, c.burnDps * tick, c.burnBy, false);
    }
    if (c.poisonLeft > 0 && c.alive) {
      const tick = Math.min(h, c.poisonLeft);
      c.poisonLeft -= h;
      this.damage(c, c.poisonDps * c.poisonStacks * tick, c.poisonBy, false);
      if (c.poisonLeft <= 0) c.poisonStacks = 0;
    }
  }

  /** Puts a creep at its distance along the route. */
  private place(c: Creep): void {
    const p = this.pointAt(c.dist);
    c.col = p.col;
    c.row = p.row;
    c.heading = p.heading;
  }

  pointAt(d: number): { col: number; row: number; heading: number } {
    let rest = Math.max(0, d);
    for (let i = 0; i < this.segLen.length; i++) {
      const a = this.route[i];
      const b = this.route[i + 1];
      if (rest <= this.segLen[i] || i === this.segLen.length - 1) {
        const t = Math.min(1, rest / this.segLen[i]);
        return { col: a.col + (b.col - a.col) * t, row: a.row + (b.row - a.row) * t, heading: Math.atan2(b.row - a.row, b.col - a.col) };
      }
      rest -= this.segLen[i];
    }
    const last = this.route[this.route.length - 1];
    return { col: last.col, row: last.row, heading: 0 };
  }

  /** The creep a tower would shoot now ("first": furthest along the route, in range). */
  targetFor(t: Tower): Creep | null {
    const s = towerStats(t.kind, t.level);
    let target: Creep | null = null;
    for (const c of this.creeps) {
      if (!c.alive || (s.groundOnly && c.flying) || Math.hypot(c.col - t.col, c.row - t.row) > s.range) continue;
      if (!target || c.dist > target.dist) target = c;
    }
    return target;
  }

  private towerStep(t: Tower, h: number): void {
    t.cooldown -= h;
    if (t.cooldown > 0) return;
    const s = towerStats(t.kind, t.level);
    const target = this.targetFor(t);
    if (!target) {
      t.cooldown = 0;
      return;
    }
    t.cooldown = s.interval;
    const shot: Shot = {
      id: this.nextId++, tower: t, stats: s, target: null, col: t.col, row: t.row, toCol: target.col, toRow: target.row,
      t: 0, flight: 0, startCol: t.col, startRow: t.row, done: false, lob: LOBBED.has(t.kind), chain: null,
    };
    if (s.chain !== undefined) {
      this.lightning(shot, target);
      return;
    }
    if (shot.lob) {
      // lob to where the creep will be when the shell lands
      const flight = Math.hypot(target.col - t.col, target.row - t.row) / s.projectileSpeed + 0.25;
      const p = this.pointAt(target.dist + target.speed * flight);
      shot.toCol = p.col;
      shot.toRow = p.row;
      shot.flight = flight;
    } else {
      shot.target = target;
    }
    this.shots.push(shot);
    this.emit({ type: 'fire', shot });
  }

  /** Gale: instant lightning that jumps to the nearest creep not yet struck, weaker each jump. */
  private lightning(shot: Shot, first: Creep): void {
    const s = shot.stats;
    shot.done = true;
    shot.chain = [{ col: shot.tower.col, row: shot.tower.row }];
    const struck = new Set<Creep>();
    let cur: Creep | null = first;
    let dmg = s.damage;
    for (let j = 0; j <= (s.chain ?? 0) && cur; j++) {
      struck.add(cur);
      shot.chain.push({ col: cur.col, row: cur.row });
      this.strike(cur, dmg, shot.tower, s);
      dmg *= s.chainFalloff ?? 1;
      const from: Creep = cur;
      let best = s.chainRange ?? 0;
      cur = null;
      for (const c of this.creeps) {
        if (!c.alive || struck.has(c)) continue;
        const d = Math.hypot(c.col - from.col, c.row - from.row);
        if (d <= best) {
          best = d;
          cur = c;
        }
      }
    }
    this.emit({ type: 'fire', shot });
    this.emit({ type: 'hit', shot, col: first.col, row: first.row });
  }

  private shotStep(s: Shot, h: number): void {
    const stats = s.stats;
    if (s.target) {
      if (!s.target.alive) {
        s.done = true;
        return;
      }
      s.toCol = s.target.col;
      s.toRow = s.target.row;
      const dx = s.toCol - s.col;
      const dy = s.toRow - s.row;
      const d = Math.hypot(dx, dy);
      const move = stats.projectileSpeed * h;
      if (d <= move) {
        s.done = true;
        const main = s.target;
        this.strike(main, stats.damage, s.tower, stats);
        // Frost shards shatter onto the creeps next to the target, at half damage
        if (stats.splash > 0) {
          for (const c of this.creeps) {
            if (c !== main && c.alive && Math.hypot(c.col - s.toCol, c.row - s.toRow) <= stats.splash) this.strike(c, stats.damage * 0.5, s.tower, stats);
          }
        }
        this.emit({ type: 'hit', shot: s, col: s.toCol, row: s.toRow });
        return;
      }
      s.col += (dx / d) * move;
      s.row += (dy / d) * move;
      return;
    }
    s.t += h / s.flight;
    s.col = s.startCol + (s.toCol - s.startCol) * Math.min(1, s.t);
    s.row = s.startRow + (s.toRow - s.startRow) * Math.min(1, s.t);
    if (s.t >= 1) {
      s.done = true;
      for (const c of this.creeps) {
        if (!c.alive || (stats.groundOnly && c.flying)) continue;
        if (Math.hypot(c.col - s.toCol, c.row - s.toRow) <= stats.splash) this.strike(c, stats.damage, s.tower, stats);
      }
      this.emit({ type: 'hit', shot: s, col: s.toCol, row: s.toRow });
    }
  }

  /** A direct hit: damage, then the tower's element effect. Bosses shrug off half of stuns and knockback. */
  private strike(c: Creep, amount: number, tower: Tower, s: TowerStats): void {
    if (!c.alive) return;
    this.damage(c, amount, tower, true);
    if (!c.alive) return;
    const bossScale = c.boss ? 0.5 : 1;
    const bonus = this.levelBonus(tower.kind);
    if (s.burnDps) {
      c.burnDps = Math.max(s.burnDps * bonus, c.burnLeft > 0 ? c.burnDps : 0);
      c.burnLeft = s.burnTime ?? 0;
      c.burnBy = tower;
    }
    if (s.slow !== undefined && s.slowTime) {
      c.slowFactor = c.slowLeft > 0 ? Math.min(c.slowFactor, s.slow) : s.slow;
      c.slowLeft = Math.max(c.slowLeft, s.slowTime);
    }
    if (s.stunChance && this.random() < s.stunChance) c.stunLeft = Math.max(c.stunLeft, (s.stunTime ?? 0) * bossScale);
    if (s.poisonDps) {
      const fresh = c.poisonLeft <= 0;
      c.poisonStacks = Math.min(s.poisonStacks ?? 1, (fresh ? 0 : c.poisonStacks) + 1);
      c.poisonDps = Math.max(s.poisonDps * bonus, fresh ? 0 : c.poisonDps);
      c.poisonShred = Math.max(s.shred ?? 0, fresh ? 0 : c.poisonShred);
      c.poisonLeft = s.poisonTime ?? 0;
      c.poisonBy = tower;
    }
    if (s.knockback) {
      c.dist = Math.max(0, c.dist - s.knockback * bossScale);
      this.place(c);
    }
  }

  /** Extra damage a creep takes from poison shred (0.2 = +20%). */
  static shredOf(c: Creep): number {
    return c.poisonLeft > 0 ? c.poisonStacks * c.poisonShred : 0;
  }

  /**
   * Hurts a creep. Direct hits get the element counter, the element level
   * bonus and the flash; damage over time already carries the level bonus.
   */
  private damage(c: Creep, base: number, tower: Tower | null, direct: boolean): void {
    if (!c.alive) return;
    let amount = base * (1 + Game.shredOf(c));
    if (tower) amount *= elementMultiplier(isElement(tower.kind) ? tower.kind : null, c.armor) * (direct ? this.levelBonus(tower.kind) : 1);
    const dealt = Math.min(c.hp, amount);
    c.hp -= amount;
    if (direct) c.hitAge = 0;
    if (tower) tower.damageDealt += dealt;
    if (c.hp <= 0) {
      c.alive = false;
      if (tower) tower.kills++;
      this.addGold(c.bounty, 'kill');
      this.emit({ type: 'death', creep: c, tower });
      if (c.elementBoss) this.grantElement(c.elementBoss);
    }
  }

  private addGold(delta: number, reason: GoldReason): void {
    this.gold += delta;
    this.emit({ type: 'gold', gold: this.gold, delta, reason });
  }
}
