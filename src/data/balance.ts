/**
 * Every tuning number for the game. Systems must read from here,
 * never hardcode values. Pure data: the Node tests load it directly.
 *
 * Milestone 1 numbers are a first draft for the fixed spiral route; the
 * autonomous bots tune them (changes go to the user with before/after).
 * Wave pacing (60 s route, 80 s per wave, 10 s rest) and the 1 gold / 3 s
 * trickle were set by the user. 2026-10-07: easier after "very hard"
 * feedback (bots: a sensible player wins, first leak around wave 30; a new
 * player reaches the late waves). Later on 2026-10-07: start gold back to
 * 100 (user), bosses 14x -> 8x HP (they leaked and decided games), regular
 * creeps a bit tougher to compensate.
 */
import type { ElementId } from './elements.ts';
import type { DifficultyId } from './difficulty.ts';

export type BasicTowerId = 'bolt' | 'mortar';
export type TowerKind = BasicTowerId | ElementId;

/** One level of a tower. `cost` is the price to build (level 1) or to upgrade to this level. */
export interface TowerStats {
  cost: number;
  /** damage per hit */
  damage: number;
  /** seconds between shots */
  interval: number;
  /** cells */
  range: number;
  /** cells per second */
  projectileSpeed: number;
  /** splash radius in cells (0 = single target) */
  splash: number;
  /** cannot target or hurt flying creeps (Mortar) */
  groundOnly?: boolean;
  /** Ember: burn damage per second and seconds */
  burnDps?: number;
  burnTime?: number;
  /** Frost: speed multiplier while chilled, and seconds */
  slow?: number;
  slowTime?: number;
  /** Gale: extra jumps, damage kept per jump, jump reach (cells) */
  chain?: number;
  chainFalloff?: number;
  chainRange?: number;
  /** Stone: chance to stun, seconds */
  stunChance?: number;
  stunTime?: number;
  /** Venom: poison per stack per second, max stacks, seconds, armor shred per stack (extra damage taken) */
  poisonDps?: number;
  poisonStacks?: number;
  poisonTime?: number;
  shred?: number;
  /** Tide: pushes creeps back along the route (cells) */
  knockback?: number;
}

export const BALANCE = {
  save: {
    /** RunSave autosave interval, real time (also saved at each wave start and on tab hide) */
    autosaveMs: 10_000,
  },

  economy: {
    /** every this many seconds of game time, banked gold earns interest */
    interestPeriod: 15,
    /** fraction of banked gold paid as interest */
    interestRate: 0.02,
    /** a trickle of gold while waves run (set by the user: 1 gold every 3 s) */
    passiveGold: 1,
    passivePeriod: 3,
    /** selling refunds this share of what the tower cost */
    sellRefund: 0.75,
    /** full refund when sold before another wave has started since it was built */
    sellRefundSameWave: 1,
  },

  /**
   * Seconds of game time a tower spends under construction (set by the user):
   * building, each upgrade (to level 2, to level 3; a 4th entry is ready for a
   * future level 4) and converting into an element tower. A tower does not
   * shoot while it works.
   */
  construction: { build: 5, upgrade: [5, 10, 15], convert: 5 },

  /** levels 1..3 of each tower */
  towers: {
    bolt: [
      { cost: 15, damage: 12, interval: 0.75, range: 3.5, projectileSpeed: 16, splash: 0 },
      { cost: 25, damage: 24, interval: 0.65, range: 3.8, projectileSpeed: 18, splash: 0 },
      { cost: 45, damage: 45, interval: 0.55, range: 4.1, projectileSpeed: 20, splash: 0 },
    ],
    mortar: [
      { cost: 30, damage: 22, interval: 2.1, range: 4.5, projectileSpeed: 7, splash: 1.3, groundOnly: true },
      { cost: 45, damage: 42, interval: 1.9, range: 4.8, projectileSpeed: 7.5, splash: 1.5, groundOnly: true },
      { cost: 80, damage: 75, interval: 1.7, range: 5.1, projectileSpeed: 8, splash: 1.7, groundOnly: true },
    ],
    // element towers (unlocked by element picks); level 1 cost = build or convert price
    ember: [
      { cost: 40, damage: 30, interval: 0.95, range: 3.8, projectileSpeed: 10, splash: 0, burnDps: 12, burnTime: 3 },
      { cost: 70, damage: 85, interval: 0.9, range: 4.1, projectileSpeed: 11, splash: 0, burnDps: 30, burnTime: 3 },
      { cost: 130, damage: 190, interval: 0.85, range: 4.4, projectileSpeed: 12, splash: 0, burnDps: 65, burnTime: 3.5 },
    ],
    frost: [
      { cost: 40, damage: 22, interval: 0.8, range: 3.7, projectileSpeed: 12, splash: 0.6, slow: 0.6, slowTime: 1.6 },
      { cost: 70, damage: 62, interval: 0.75, range: 4.0, projectileSpeed: 13, splash: 0.8, slow: 0.5, slowTime: 1.8 },
      { cost: 130, damage: 140, interval: 0.7, range: 4.3, projectileSpeed: 14, splash: 1.0, slow: 0.4, slowTime: 2.0 },
    ],
    gale: [
      { cost: 40, damage: 12, interval: 0.45, range: 3.8, projectileSpeed: 40, splash: 0, chain: 2, chainFalloff: 0.75, chainRange: 2.4 },
      { cost: 70, damage: 30, interval: 0.42, range: 4.1, projectileSpeed: 40, splash: 0, chain: 3, chainFalloff: 0.75, chainRange: 2.6 },
      { cost: 130, damage: 68, interval: 0.38, range: 4.4, projectileSpeed: 40, splash: 0, chain: 4, chainFalloff: 0.8, chainRange: 2.8 },
    ],
    stone: [
      { cost: 40, damage: 70, interval: 1.6, range: 3.4, projectileSpeed: 9, splash: 0, stunChance: 0.2, stunTime: 0.7 },
      { cost: 70, damage: 190, interval: 1.5, range: 3.6, projectileSpeed: 10, splash: 0, stunChance: 0.25, stunTime: 0.8 },
      { cost: 130, damage: 420, interval: 1.4, range: 3.8, projectileSpeed: 11, splash: 0, stunChance: 0.3, stunTime: 0.9 },
    ],
    venom: [
      { cost: 40, damage: 10, interval: 0.7, range: 3.8, projectileSpeed: 11, splash: 0, poisonDps: 6, poisonStacks: 5, poisonTime: 4, shred: 0.04 },
      { cost: 70, damage: 25, interval: 0.65, range: 4.1, projectileSpeed: 12, splash: 0, poisonDps: 14, poisonStacks: 6, poisonTime: 4, shred: 0.05 },
      { cost: 130, damage: 55, interval: 0.6, range: 4.4, projectileSpeed: 13, splash: 0, poisonDps: 30, poisonStacks: 7, poisonTime: 4.5, shred: 0.06 },
    ],
    tide: [
      { cost: 40, damage: 32, interval: 1.5, range: 4.0, projectileSpeed: 9, splash: 1.4, knockback: 0.5 },
      { cost: 70, damage: 85, interval: 1.4, range: 4.3, projectileSpeed: 10, splash: 1.6, knockback: 0.6 },
      { cost: 130, damage: 190, interval: 1.3, range: 4.6, projectileSpeed: 11, splash: 1.8, knockback: 0.7 },
    ],
  } satisfies Record<TowerKind, TowerStats[]>,

  /**
   * Per difficulty: start gold and lives, and multipliers on creep hit points
   * (normal creeps, wave bosses, element guardians) and on kill gold.
   * Medium is the game as it was tuned before difficulties existed.
   */
  difficulty: {
    easy: { startGold: 150, lives: 30, hp: 0.85, bossHp: 0.85, bounty: 1.15 },
    medium: { startGold: 100, lives: 20, hp: 1.3, bossHp: 1.3, bounty: 1 },
    hard: { startGold: 100, lives: 15, hp: 2, bossHp: 1.52, bounty: 0.95 },
    extreme: { startGold: 100, lives: 12, hp: 2.9, bossHp: 2.08, bounty: 0.85 },
  } satisfies Record<DifficultyId, { startGold: number; lives: number; hp: number; bossHp: number; bounty: number }>,
  /**
   * Difficulty eases in: on wave 1 only `rampStart` of the hp/bossHp difference
   * from Medium applies, growing to all of it by wave `rampWaves` + 1, so a hard
   * game does not end before the player has built anything.
   */
  difficultyRamp: { rampStart: 0.15, rampWaves: 18 },

  elements: {
    /** element picks happen at the start of every `every`-th wave (the first one unlocks at once) */
    every: 5,
    /** a random pick (instead of choosing) pays this much gold */
    randomGold: 25,
    /** converting a basic tower costs at least this */
    minConvertCost: 10,
    /** each extra level of an owned element adds this to its towers' damage */
    levelBonus: 0.15,
    /** element boss: hit points = this x a normal creep of its wave */
    bossHpFactor: 6,
    bossSpeedFactor: 0.8,
    bossBounty: 20,
    bossLeakCost: 3,
  },

  waves: {
    /** a full game */
    count: 40,
    /** rest before the next wave, once the current wave is cleared (or ran out of time) */
    countdown: 10,
    /** a wave gets at most this long (from its start) before the rest countdown begins anyway */
    maxWaveTime: 80,
    /** calling the next wave early pays this much gold per whole second skipped (capped) */
    earlyGoldPerSecond: 0.5,
    earlyGoldMax: 10,
    /** creeps per wave */
    size: 10,
    /** seconds between two creeps of a wave (close together, so splash hits several) */
    spacing: 0.3,
    /** creep hit points on wave w (1-based): hpBase * hpGrowth^(w-1) + hpLinear * (w-1) */
    hpBase: 28,
    hpGrowth: 1.115,
    hpLinear: 8,
    /** seconds a creep needs to walk the whole route (speed = route length / this) */
    routeSeconds: 60,
    /** gold per kill on wave w: bountyBase + floor((w-1) / bountyStep) */
    bountyBase: 1,
    bountyStep: 4,
    /** lives lost when a creep reaches the exit */
    leakCost: 1,
  },

  /** a boss walks at the end of every `every`-th wave (8 in a 40-wave game) */
  bosses: {
    every: 5,
    /** boss hit points = this x a normal creep of its wave */
    hpFactor: 8,
    /** fraction of normal creep speed */
    speedFactor: 0.75,
    bountyBase: 15,
    leakCost: 5,
  },
} as const;

export function creepHp(wave: number): number {
  const w = BALANCE.waves;
  return Math.round(w.hpBase * Math.pow(w.hpGrowth, wave - 1) + w.hpLinear * (wave - 1));
}

export function creepBounty(wave: number): number {
  const w = BALANCE.waves;
  return w.bountyBase + Math.floor((wave - 1) / w.bountyStep);
}

export function towerStats(kind: TowerKind, level: number): TowerStats {
  const levels = BALANCE.towers[kind];
  return levels[Math.max(0, Math.min(levels.length - 1, level - 1))];
}

export const MAX_TOWER_LEVEL = 3;
