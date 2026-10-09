/** Save and resume: a checkpoint at each wave start rebuilds the same game. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/Game.ts';
import { BALANCE } from '../src/data/balance.ts';
import { parseRun, RUN_VERSION } from '../src/systems/saveFormat.ts';

function run(game: Game, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) game.advance(0.1);
}

test('a checkpoint taken as a wave starts rebuilds towers, gold, lives, elements and picks', () => {
  const g = new Game(21, 'hard');
  g.gold = 2000;
  g.lives = 1000;
  g.build('bolt', 9, 8);
  g.build('mortar', 13, 8);
  for (let i = 0; i < 100; i++) g.advance(0.25);
  g.upgrade(g.towers[0]);
  g.wave = BALANCE.elements.every - 1;
  g.callWave(); // wave 5: the first element pick is offered
  g.pick(g.offer![0]);
  run(g, 6);
  g.wave = 9;
  g.callWave(); // wave 10 start: checkpoint taken just before
  const cp = g.lastCheckpoint!;
  assert.equal(cp.wave, 10);
  assert.equal(cp.difficulty, 'hard');
  const raw = JSON.stringify({ ...cp, v: RUN_VERSION, savedAt: 1 });
  const back = parseRun(raw)!;
  const r = Game.fromSave(back);
  assert.equal(r.phase, 'ready');
  assert.equal(r.wave, 9, 'Start replays wave 10');
  assert.equal(r.difficulty, 'hard');
  assert.equal(r.gold, cp.gold);
  assert.equal(r.lives, cp.lives);
  assert.deepEqual(r.towers.map((t) => `${t.kind}${t.level}@${t.col},${t.row}`), ['bolt2@9,8', 'mortar1@13,8'], 'the paid upgrade counts');
  assert.deepEqual(r.elements, g.elements);
  r.callWave();
  assert.equal(r.wave, 10);
  assert.ok(r.offer, 'the wave-10 element pick is offered again');
});

test('element bosses on the road when the game was saved walk again after resuming', () => {
  const g = new Game(5);
  g.lives = 1000;
  g.wave = BALANCE.elements.every - 1;
  g.callWave();
  g.pick(g.offer![0]); // free
  run(g, 6);
  g.wave = BALANCE.elements.every * 2 - 1;
  g.callWave();
  const el = g.offer![0];
  g.pick(el); // summons its boss
  run(g, 6);
  g.callWave();
  const cp = g.lastCheckpoint!;
  assert.deepEqual(cp.state!.guardians, [el]);
  const r = Game.fromSave({ ...cp, v: RUN_VERSION, savedAt: 1 });
  const summoned: string[] = [];
  r.on((e) => {
    if (e.type === 'summon') summoned.push(e.element);
  });
  r.callWave();
  assert.deepEqual(summoned, [el]);
});
