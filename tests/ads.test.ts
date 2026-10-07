/** Rewarded-ad helps: what each one does, and that each works only once. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/Game.ts';
import { BALANCE } from '../src/data/balance.ts';

function run(game: Game, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) game.advance(0.1);
}

test('element offer: a fresh set of three once per pick, different from the first', () => {
  const g = new Game(4);
  assert.equal(g.canRerollOffer, false, 'nothing to reroll before an offer');
  g.lives = 1000;
  g.wave = BALANCE.elements.every - 1;
  g.callWave();
  const first = [...g.offer!];
  assert.equal(g.rerollOffer(), true);
  assert.equal(g.offer!.length, 3);
  assert.ok(g.offer!.every((e) => !first.includes(e)), 'all three are new');
  assert.equal(g.rerollOffer(), false, 'only once per pick');
  g.pick(g.offer![0]);
  assert.equal(g.canRerollOffer, false);
});

test('lives refill: back to full once per game, only when lives are missing', () => {
  const g = new Game(1, 'hard');
  g.callWave();
  assert.equal(g.canRefillLives, false, 'full lives: nothing to refill');
  run(g, BALANCE.waves.routeSeconds + 5);
  assert.ok(g.lives < g.maxLives);
  assert.equal(g.refillLives(), true);
  assert.equal(g.lives, BALANCE.difficulty.hard.lives);
  run(g, 30);
  g.lives = 3;
  assert.equal(g.refillLives(), false, 'once per game');
});

test('continue after a loss: half lives, the game goes on, once per game', () => {
  const g = new Game(2);
  g.callWave();
  run(g, 600);
  assert.equal(g.phase, 'lost');
  const wave = g.wave;
  assert.equal(g.continueGame(), true);
  assert.equal(g.phase, 'playing');
  assert.equal(g.lives, Math.ceil(g.maxLives / 2));
  assert.equal(g.wave, wave);
  run(g, 600);
  assert.equal(g.phase, 'lost');
  assert.equal(g.continueGame(), false, 'only once');
});
