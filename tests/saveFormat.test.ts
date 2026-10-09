/**
 * The rules that reconcile the platform save store with the local fallback
 * store (used on visits where the CrazyGames SDK failed to load).
 * Ported from Element Warden with the progress counter renamed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_PROFILE_KEY,
  BACKUP_RUN_KEY,
  normalizeProfile,
  parseRun,
  reconcileSaves,
} from '../src/systems/saveFormat.ts';

const profile = (lifetime: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    v: 1,
    bests: {},
    lifetimeWavesCleared: lifetime,
    settings: { muted: false, speed: 1 },
    hints: [],
    updatedAt: 1000,
    ...extra,
  });
const run = (wave: number, savedAt: number) =>
  JSON.stringify({ v: 1, difficulty: 'medium', wave, gold: 0, lives: 20, towers: [], savedAt });
const keys = (w: Array<{ key: string }>) => w.map((x) => x.key);

test('no fallback store: the platform store is used as is', () => {
  const r = reconcileSaves({ profile: profile(50), run: run(4, 10) }, null);
  assert.equal(r.profileFrom, 'primary');
  assert.equal(r.run?.wave, 4);
  assert.deepEqual(r.writes, []);
});

test('real progress vs a newer but empty profile from a failed visit: real progress wins', () => {
  const real = profile(240, { updatedAt: 1000 });
  const emptyButNewer = profile(0, { updatedAt: 9_999_999 });
  const r = reconcileSaves({ profile: real, run: null }, { profile: emptyButNewer, run: null });
  assert.equal(r.profileFrom, 'primary');
  assert.equal(r.profile?.lifetimeWavesCleared, 240);
  assert.deepEqual(r.writes, [], 'nothing may be overwritten');
});

test('fallback only (first visits had no SDK): it is migrated to the platform store', () => {
  const r = reconcileSaves({ profile: null, run: null }, { profile: profile(60), run: run(7, 50) });
  assert.equal(r.profileFrom, 'fallback');
  assert.equal(r.runFrom, 'fallback');
  assert.deepEqual(keys(r.writes), ['profile', 'run'], 'no backup needed when there was nothing');
});

test('fallback holds more progress: it wins, and the platform copy is backed up first', () => {
  const r = reconcileSaves({ profile: profile(60), run: null }, { profile: profile(80), run: null });
  assert.equal(r.profileFrom, 'fallback');
  assert.deepEqual(keys(r.writes), [BACKUP_PROFILE_KEY, 'profile']);
  assert.equal(r.writes[0].value, profile(60), 'the backup is the exact overwritten copy');
});

test('a tie keeps the platform copy', () => {
  const r = reconcileSaves({ profile: profile(60), run: null }, { profile: profile(60, { hints: ['x'] }), run: null });
  assert.equal(r.profileFrom, 'primary');
  assert.deepEqual(r.writes, []);
});

test('same profile in both stores: the newer run wins', () => {
  const newerLocal = reconcileSaves({ profile: profile(60), run: run(3, 100) }, { profile: profile(60), run: run(9, 200) });
  assert.equal(newerLocal.runFrom, 'fallback');
  assert.equal(newerLocal.run?.wave, 9);
  assert.deepEqual(keys(newerLocal.writes), [BACKUP_RUN_KEY, 'run']);

  const newerPlatform = reconcileSaves({ profile: profile(60), run: run(3, 300) }, { profile: profile(60), run: run(9, 200) });
  assert.equal(newerPlatform.runFrom, 'primary');
  assert.deepEqual(newerPlatform.writes, []);
});

test("a newer run is ignored when its store's profile lost", () => {
  const r = reconcileSaves({ profile: profile(500), run: run(3, 100) }, { profile: profile(8), run: run(5, 999) });
  assert.equal(r.profileFrom, 'primary');
  assert.equal(r.runFrom, 'primary');
  assert.equal(r.run?.wave, 3);
});

test("the platform's run is set aside when its profile lost and the winner has no run", () => {
  const r = reconcileSaves({ profile: profile(10), run: run(4, 100) }, { profile: profile(80), run: null });
  assert.equal(r.profileFrom, 'fallback');
  assert.equal(r.run, null);
  assert.deepEqual(keys(r.writes), [BACKUP_PROFILE_KEY, 'profile', BACKUP_RUN_KEY, 'run']);
  assert.equal(r.writes[3].value, '', 'the stale run is removed');
});

test('lifetime counter: missing or negative becomes 0, fractions are floored', () => {
  assert.equal(normalizeProfile({}).lifetimeWavesCleared, 0);
  assert.equal(normalizeProfile({ lifetimeWavesCleared: -5 }).lifetimeWavesCleared, 0);
  assert.equal(normalizeProfile({ lifetimeWavesCleared: 12.7 }).lifetimeWavesCleared, 12);
});

test('game speed setting: defaults to 1x, keeps 1.5x, old 2x/3x become 1.5x, rejects anything else', () => {
  assert.equal(normalizeProfile({}).settings.speed, 1);
  assert.equal(normalizeProfile({ settings: { muted: true, speed: 1.5 } }).settings.speed, 1.5);
  assert.equal(normalizeProfile({ settings: { muted: true, speed: 2 } } as never).settings.speed, 1.5);
  assert.equal(normalizeProfile({ settings: { muted: true, speed: 3 } } as never).settings.speed, 1.5);
  assert.equal(normalizeProfile({ settings: { muted: false, speed: 7 } } as never).settings.speed, 1);
});

test('hints seen: default empty, strings kept once', () => {
  assert.deepEqual(normalizeProfile({}).hints, []);
  assert.deepEqual(normalizeProfile({ hints: ['place', 'place', 1, 'path'] } as never).hints, ['place', 'path']);
});

test('a run save without a tower list is rejected', () => {
  assert.equal(parseRun(JSON.stringify({ v: 1, wave: 3, savedAt: 1 })), null);
  assert.equal(parseRun(run(3, 1))?.wave, 3);
});

test('graphics settings: an old profile without them starts automatic', () => {
  const g = normalizeProfile({}).settings.graphics;
  assert.equal(g.auto, true);
  assert.equal(g.detectedTier, null);
});

test('volumes: defaults for old profiles, clamped to 0..1, junk replaced', () => {
  const d = normalizeProfile({}).settings;
  assert.equal(d.musicVolume, 0.5);
  assert.equal(d.sfxVolume, 0.5);
  const c = normalizeProfile({ settings: { musicVolume: 3, sfxVolume: 'loud' } } as never).settings;
  assert.equal(c.musicVolume, 1);
  assert.equal(c.sfxVolume, 0.5);
});
