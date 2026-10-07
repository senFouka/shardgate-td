/** Every sound must ship in both formats: .ogg, and .mp3 for iPhone Safari. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { SOUNDS } from '../src/data/sounds.ts';

test('every sound has an .ogg and an .mp3 file in public/', () => {
  for (const [id, def] of Object.entries(SOUNDS)) {
    assert.ok(def.file.endsWith('.ogg'), `${id}: ${def.file}`);
    assert.ok(existsSync(`public/${def.file}`), `missing public/${def.file}`);
    assert.ok(existsSync(`public/${def.file.replace(/\.ogg$/, '.mp3')}`), `missing mp3 for ${id}`);
  }
});
