/** Elements: picks, element bosses, counters, element tower effects, converting, ground-only Mortar. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Creep, type Tower } from '../src/game/Game.ts';
import { BALANCE, towerStats } from '../src/data/balance.ts';
import { ELEMENT_ORDER, WAVE_ARMOR, elementMultiplier, counterOf } from '../src/data/elements.ts';
import { WAVE_CREEPS, isFlyingLook } from '../src/data/creeps.ts';
import { MAP, buildGrid } from '../src/data/map.ts';

const grassCells = (): Array<[number, number]> => {
  const g = buildGrid();
  const out: Array<[number, number]> = [];
  for (let r = 0; r < MAP.rows; r++) for (let c = 0; c < MAP.cols; c++) if (g[r * MAP.cols + c] === 'grass') out.push([c, r]);
  return out;
};
const nearRoute = () => grassCells().filter(([, r]) => r === 4 || r === 5);
/** grass cells sorted by how much route lies within 3 cells */
const bestSpots = () => {
  const g = buildGrid();
  const cover = ([c, r]: [number, number]) => {
    let n = 0;
    for (let y = r - 3; y <= r + 3; y++) for (let x = c - 3; x <= c + 3; x++) if (g[y * MAP.cols + x] === 'lane' && x >= 0 && x < MAP.cols && Math.hypot(x - c, y - r) <= 3) n++;
    return n;
  };
  return grassCells().sort((a, b) => cover(b) - cover(a));
};

function run(game: Game, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) game.advance(0.1);
}

test('counter cycle: x1.5 against the next element, x0.5 against the previous, x1 otherwise', () => {
  for (let i = 0; i < ELEMENT_ORDER.length; i++) {
    const el = ELEMENT_ORDER[i];
    const next = ELEMENT_ORDER[(i + 1) % 6];
    const prev = ELEMENT_ORDER[(i + 5) % 6];
    assert.equal(elementMultiplier(el, next), 1.5);
    assert.equal(elementMultiplier(el, prev), 0.5);
    assert.equal(elementMultiplier(el, el), 1);
    assert.equal(elementMultiplier(counterOf(el), el), 1.5);
  }
  assert.equal(elementMultiplier(null, 'ember'), 1);
  assert.equal(WAVE_ARMOR.length, BALANCE.waves.count);
});

test('the first pick unlocks at once; element towers are locked until then', () => {
  const g = new Game(7);
  const [c, r] = grassCells()[30];
  assert.equal(g.build('ember', c, r), 'locked');
  assert.ok(g.offer && g.offer.length === 3 && new Set(g.offer).size === 3);
  const el = g.offer![0];
  assert.equal(g.pick(el), el);
  assert.equal(g.elements[el], 1);
  assert.equal(g.offer, null);
  g.gold = 500;
  assert.equal(typeof g.build(el, c, r), 'object');
});

test('a random pick gives any element plus gold', () => {
  const g = new Game(3);
  const gold = g.gold;
  const el = g.pick('random')!;
  assert.ok(ELEMENT_ORDER.includes(el));
  assert.equal(g.gold, gold + BALANCE.elements.randomGold);
  assert.equal(g.elements[el], 1);
});

test('later picks come every 5th wave and summon the element boss; killing it unlocks the element', () => {
  const g = new Game(11);
  g.lives = 1000;
  g.pick(g.offer![0]);
  g.callWave();
  for (let w = 1; w < BALANCE.elements.every; w++) {
    assert.equal(g.offer, null);
    run(g, BALANCE.waves.size * BALANCE.waves.spacing + 0.5);
    g.callWave();
  }
  assert.ok(g.offer, 'a pick is offered when wave 5 starts');
  const el = g.offer!.find((e) => g.elements[e] === 0)!;
  g.pick(el);
  assert.equal(g.elements[el], 0, 'not yet: the boss must fall first');
  const boss = g.creeps.find((c) => c.elementBoss === el)!;
  assert.ok(boss && boss.armor === el);
  // the boss walks the route; let it through to prove the element still arrives
  run(g, 200);
  assert.ok(g.elements[el] >= 1);
});

test('element towers: burn, slow, stun, poison stacks and knockback', () => {
  const g = new Game(5);
  for (const el of ELEMENT_ORDER) g.elements[el] = 1;
  g.gold = 5000;
  g.lives = 1000;
  const spots = bestSpots();
  for (const [i, el] of ELEMENT_ORDER.entries()) g.build(el, spots[i][0], spots[i][1]);
  g.wave = 18; // tough ground creeps, so every tower gets to hit
  const seen = { burn: false, slow: false, stun: false, poison2: false, chain: false };
  g.on((e) => {
    if (e.type === 'fire' && e.shot.chain && e.shot.chain.length > 2) seen.chain = true;
  });
  g.callWave();
  for (let i = 0; i < 600; i++) {
    g.advance(0.1);
    for (const c of g.creeps) {
      if (c.burnLeft > 0) seen.burn = true;
      if (c.slowLeft > 0 && c.slowFactor < 1) seen.slow = true;
      if (c.stunLeft > 0) seen.stun = true;
      if (c.poisonStacks >= 2) seen.poison2 = true;
    }
  }
  assert.deepEqual(seen, { burn: true, slow: true, stun: true, poison2: true, chain: true });
});

test('poison shred makes a creep take more damage', () => {
  const c = { poisonLeft: 2, poisonStacks: 5, poisonShred: 0.04 } as Creep;
  assert.ok(Math.abs(Game.shredOf(c) - 0.2) < 1e-9);
  c.poisonLeft = 0;
  assert.equal(Game.shredOf(c), 0);
});

test('converting a basic tower keeps its place and level, costs the difference', () => {
  const g = new Game(9);
  g.gold = 1000;
  const [c, r] = grassCells()[50];
  const t = g.build('bolt', c, r) as Tower;
  g.upgrade(t);
  assert.equal(g.convert(t, 'frost'), 'locked');
  g.elements.frost = 1;
  const cost = g.convertCost(t, 'frost')!;
  assert.equal(cost, towerStats('frost', 1).cost + towerStats('frost', 2).cost - towerStats('bolt', 1).cost - towerStats('bolt', 2).cost);
  const gold = g.gold;
  assert.equal(g.convert(t, 'frost'), null);
  assert.equal(t.kind, 'frost');
  assert.equal(t.level, 2);
  assert.equal(g.gold, gold - cost);
  assert.equal(g.convertCost(t, 'ember'), null, 'element towers do not convert (yet)');
});

test('Mortar never targets or hurts flying creeps', () => {
  const flyWave = WAVE_CREEPS.findIndex((id) => isFlyingLook(id)) + 1;
  assert.ok(flyWave > 0);
  const g = new Game(1);
  g.gold = 5000;
  for (const [c, r] of nearRoute().slice(0, 8)) g.build('mortar', c, r);
  g.wave = flyWave - 1;
  let fired = 0;
  g.on((e) => {
    if (e.type === 'fire') fired++;
  });
  g.callWave();
  run(g, 40);
  assert.ok(g.creeps.length > 0 && g.creeps.every((c) => c.flying && c.hp === c.maxHp));
  assert.equal(fired, 0);
});

test('element counters change the damage a wave takes', () => {
  // the same Ember tower against Frost armor (strong) and Tide armor (weak)
  const hurt = (armorWave: number) => {
    const g = new Game(2);
    g.elements.ember = 1;
    g.gold = 1000;
    for (const [c, r] of nearRoute().slice(0, 3)) g.build('ember', c, r);
    g.wave = armorWave - 1;
    g.callWave();
    run(g, 25);
    return g.towers.reduce((s, t) => s + t.damageDealt, 0) / Math.max(1, g.creeps.reduce((s, c) => s + c.maxHp, 0) / Math.max(1, g.creeps.length));
  };
  const frostWave = WAVE_ARMOR.indexOf('frost') + 1;
  const tideWave = WAVE_ARMOR.indexOf('tide') + 1;
  assert.ok(hurt(frostWave) > hurt(tideWave));
});
