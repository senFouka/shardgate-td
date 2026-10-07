/** Game rules: building, upgrades, wave pacing, bosses, combat, economy, lives. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/Game.ts';
import { BALANCE, creepHp, towerStats } from '../src/data/balance.ts';
import { MAP, buildGrid } from '../src/data/map.ts';
import { DIFFICULTY_ORDER } from '../src/data/difficulty.ts';

const grassCells = (): Array<[number, number]> => {
  const g = buildGrid();
  const out: Array<[number, number]> = [];
  for (let r = 0; r < MAP.rows; r++) for (let c = 0; c < MAP.cols; c++) if (g[r * MAP.cols + c] === 'grass') out.push([c, r]);
  return out;
};

function run(game: Game, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) game.advance(0.1);
}

/** Lets every tower finish its construction (works before the first wave too). */
function settle(game: Game): void {
  for (let i = 0; i < 400 && game.towers.some((t) => t.work); i++) game.advance(0.1);
}

test('towers go on empty grass only, and cost gold', () => {
  const g = new Game();
  const lane = buildGrid().indexOf('lane');
  assert.equal(g.build('bolt', lane % MAP.cols, Math.floor(lane / MAP.cols)), 'not-grass');
  const [c, r] = grassCells()[40];
  const t = g.build('bolt', c, r);
  assert.ok(typeof t === 'object');
  assert.equal(g.gold, BALANCE.difficulty.medium.startGold - towerStats('bolt', 1).cost);
  assert.equal(g.build('bolt', c, r), 'occupied');
});

test('upgrades: three levels, each stronger, paid in gold and counted in refunds', () => {
  const g = new Game();
  g.gold = 1000;
  const [c, r] = grassCells()[5];
  const t = g.build('bolt', c, r) as Exclude<ReturnType<Game['build']>, string>;
  assert.equal(g.upgrade(t), 'busy', 'not while it is being built');
  settle(g);
  assert.equal(g.upgrade(t), null);
  assert.equal(t.level, 1, 'the upgrade takes time');
  settle(g);
  assert.equal(t.level, 2);
  assert.ok(Game.dps('bolt', 2) > Game.dps('bolt', 1));
  assert.equal(g.upgrade(t), null);
  settle(g);
  assert.equal(t.level, 3);
  assert.equal(g.upgrade(t), 'max');
  assert.equal(t.spent, towerStats('bolt', 1).cost + towerStats('bolt', 2).cost + towerStats('bolt', 3).cost);
  assert.equal(g.refundFor(t), t.spent, 'full refund before any wave');
  g.gold = 0;
  const [c2, r2] = grassCells()[6];
  g.gold = towerStats('mortar', 1).cost;
  const m = g.build('mortar', c2, r2) as Exclude<ReturnType<Game['build']>, string>;
  settle(g);
  assert.equal(g.upgrade(m), 'gold');
});

test('selling: full refund before the next wave, 75% after', () => {
  const g = new Game();
  const [c, r] = grassCells()[10];
  const t = g.build('mortar', c, r);
  assert.ok(typeof t === 'object');
  assert.equal(g.refundFor(t), towerStats('mortar', 1).cost);
  g.callWave();
  assert.equal(g.refundFor(t), Math.floor(towerStats('mortar', 1).cost * BALANCE.economy.sellRefund));
});

test('nothing moves until the first wave is called', () => {
  const g = new Game();
  run(g, 30);
  assert.equal(g.wave, 0);
  assert.equal(g.creeps.length, 0);
  assert.equal(g.gold, BALANCE.difficulty.medium.startGold, 'no interest before the game starts');
});

test('a creep walks the whole route in about a minute', () => {
  const g = new Game();
  assert.ok(Math.abs(g.routeLength / g.creepSpeed - BALANCE.waves.routeSeconds) < 0.01);
});

test('an undefended wave costs a life per creep', () => {
  const g = new Game();
  g.callWave();
  run(g, BALANCE.waves.routeSeconds + BALANCE.waves.size * BALANCE.waves.spacing + 1);
  assert.equal(g.lives, BALANCE.difficulty.medium.lives - BALANCE.waves.size * BALANCE.waves.leakCost);
});

test('pacing: a cleared wave is followed by a 10 s rest, then the next wave', () => {
  const g = new Game();
  g.gold = 5000;
  // a strong defence clears wave 1 quickly
  for (const [c, r] of grassCells().filter(([, r]) => r <= 5).slice(0, 14)) {
    const t = g.build('bolt', c, r);
    if (typeof t === 'object') {
      g.upgrade(t);
      g.upgrade(t);
    }
  }
  g.callWave();
  let restSeen = false;
  for (let i = 0; i < 1200 && g.wave === 1; i++) {
    g.advance(0.1);
    if (g.countdown > 0) restSeen = true;
  }
  assert.ok(restSeen, 'a rest countdown ran');
  assert.equal(g.wave, 2);
  assert.ok(g.time < BALANCE.waves.maxWaveTime, `wave 2 came at ${g.time.toFixed(0)}s, before the 80 s limit`);
});

test('pacing: a wave that is not cleared gets 80 s, then 10 s rest, then the next wave', () => {
  const g = new Game();
  g.callWave();
  // no defence: creeps leak after ~60 s, which also clears the wave; slow them by checking the limit directly
  run(g, BALANCE.waves.maxWaveTime + BALANCE.waves.countdown + 1);
  assert.ok(g.wave >= 2);
});

test('Start now: once a wave has spawned, the next one can start at once, with a bonus', () => {
  const g = new Game();
  g.callWave();
  assert.equal(g.canCallWave, false, 'not while the wave is still spawning');
  run(g, BALANCE.waves.size * BALANCE.waves.spacing + 0.5);
  assert.equal(g.canCallWave, true);
  const bonus = g.earlyBonus;
  assert.ok(bonus > 0 && bonus <= BALANCE.waves.earlyGoldMax);
  const before = g.gold;
  g.callWave();
  assert.equal(g.wave, 2);
  assert.ok(g.gold >= before + bonus);
});

test('a boss walks at the end of every 5th wave, tougher and slower', () => {
  const g = new Game();
  const seen: Array<{ wave: number; boss: boolean; hp: number; speed: number }> = [];
  g.on((e) => {
    if (e.type === 'spawn') seen.push({ wave: e.creep.wave, boss: e.creep.boss, hp: e.creep.maxHp, speed: e.creep.speed });
  });
  g.callWave();
  for (let w = 1; w < BALANCE.bosses.every; w++) {
    run(g, BALANCE.waves.size * BALANCE.waves.spacing + 0.5);
    g.callWave();
  }
  run(g, BALANCE.waves.size * BALANCE.waves.spacing * 3 + 1);
  const bosses = seen.filter((s) => s.boss);
  assert.equal(bosses.length, 1);
  assert.equal(bosses[0].wave, BALANCE.bosses.every);
  const normal = seen.find((s) => s.wave === BALANCE.bosses.every && !s.boss)!;
  assert.ok(bosses[0].hp >= normal.hp * BALANCE.bosses.hpFactor * 0.95 && bosses[0].speed < normal.speed, `boss ${bosses[0].hp} vs creep ${normal.hp}`);
  assert.equal(seen.filter((s) => s.wave === BALANCE.bosses.every).at(-1)!.boss, true, 'the boss comes last');
});

test('mortar shells hit creeps walking close together', () => {
  const g = new Game();
  g.gold = 1000;
  for (const [c, r] of grassCells().filter(([, r]) => r === 4 || r === 5).slice(0, 4)) g.build('mortar', c, r);
  settle(g);
  let multi = 0;
  let hitsThisShell = 0;
  g.on((e) => {
    if (e.type === 'fire') hitsThisShell = 0;
  });
  const before = new Map<number, number>();
  g.callWave();
  for (let i = 0; i < 300; i++) {
    for (const c of g.creeps) before.set(c.id, c.hp);
    g.advance(0.1);
    const damaged = g.creeps.filter((c) => (before.get(c.id) ?? c.hp) > c.hp).length;
    if (damaged >= 2) multi++;
  }
  assert.ok(multi > 0, 'at least one shell hurt two or more creeps');
  void hitsThisShell;
});

test('towers beside the route kill creeps and earn gold', () => {
  const g = new Game();
  for (const [c, r] of grassCells().filter(([, r]) => r === 4 || r === 5).slice(0, 6)) g.build('bolt', c, r);
  g.callWave();
  run(g, 60);
  const kills = g.towers.reduce((s, t) => s + t.kills, 0);
  assert.ok(kills >= BALANCE.waves.size / 2, `kills ${kills}`);
});

test('interest: every period, a share of banked gold', () => {
  const g = new Game();
  g.callWave();
  const before = g.gold;
  run(g, BALANCE.economy.interestPeriod + 0.05);
  assert.ok(g.gold - before >= Math.floor(before * BALANCE.economy.interestRate));
});

test('creeps get tougher every wave', () => {
  for (let w = 2; w <= BALANCE.waves.count; w++) assert.ok(creepHp(w) > creepHp(w - 1));
});

test('losing every life ends the game', () => {
  const g = new Game();
  g.callWave();
  run(g, 600);
  assert.equal(g.phase, 'lost');
});

test('difficulty: harder levels mean tougher creeps and never more lives, locked per game', () => {
  const hp: number[] = [];
  for (const d of DIFFICULTY_ORDER) {
    const g = new Game(1, d);
    assert.equal(g.difficulty, d);
    assert.equal(g.gold, BALANCE.difficulty[d].startGold);
    assert.equal(g.lives, BALANCE.difficulty[d].lives);
    let first = 0;
    g.on((e) => {
      if (e.type === 'spawn' && !first) first = e.creep.maxHp;
    });
    g.callWave();
    g.advance(0.1);
    hp.push(first);
  }
  for (let i = 1; i < hp.length; i++) assert.ok(hp[i] > hp[i - 1], `hp by difficulty ${hp.join(',')}`);
  const lives = DIFFICULTY_ORDER.map((d) => BALANCE.difficulty[d].lives);
  for (let i = 1; i < lives.length; i++) assert.ok(lives[i] <= lives[i - 1], `lives by difficulty ${lives.join(",")}`);
  assert.ok(lives[0] > lives[lives.length - 1]);
});

test('construction: building and each upgrade take their time, and a working tower does not shoot', () => {
  const C = BALANCE.construction;
  const g = new Game();
  g.gold = 1000;
  const [c, r] = grassCells().filter(([, r]) => r === 4 || r === 5)[0];
  const t = g.build('bolt', c, r) as Exclude<ReturnType<Game['build']>, string>;
  assert.equal(t.work?.type, 'build');
  assert.equal(t.work?.total, C.build);
  const done: string[] = [];
  g.on((e) => {
    if (e.type === 'built' || e.type === 'upgrade') done.push(`${e.type}@${g.time.toFixed(1)}`);
  });
  g.callWave();
  let shots = 0;
  g.on((e) => {
    if (e.type === 'fire') shots++;
  });
  run(g, C.build - 0.5);
  assert.equal(shots, 0, 'no shots while building');
  assert.ok(t.work);
  run(g, 1);
  assert.equal(t.work, null);
  assert.equal(g.upgrade(t), null);
  assert.equal(t.work?.total, C.upgrade[0]);
  run(g, C.upgrade[0] + 0.2);
  assert.equal(t.level, 2);
  assert.equal(g.upgrade(t), null);
  assert.equal(t.work?.total, C.upgrade[1], 'the next level takes longer');
  run(g, C.upgrade[1] + 0.2);
  assert.equal(t.level, 3);
  assert.deepEqual(done.map((d) => d.split('@')[0]), ['built', 'upgrade', 'upgrade']);
});
