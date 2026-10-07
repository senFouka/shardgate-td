/** Graphics presets, saved-settings validation and the hardware → preset rules. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, detectTier, normalizeGraphics, presetOf, stepDown } from '../src/data/graphics.ts';

test('desktop GPUs: dedicated and Apple M-series get High', () => {
  for (const gpu of [
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 (0x00001F0A) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
  ]) assert.equal(detectTier({ gpu, mobile: false, memoryGB: 8, cores: 8 }), 'high', gpu);
});

test('desktop integrated GPUs get Medium, old Intel on few cores gets Low', () => {
  assert.equal(detectTier({ gpu: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', mobile: false, cores: 8 }), 'medium');
  assert.equal(detectTier({ gpu: 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', mobile: false, cores: 12 }), 'medium');
  assert.equal(detectTier({ gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', mobile: false, cores: 8 }), 'medium');
  assert.equal(detectTier({ gpu: 'ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)', mobile: false, cores: 4 }), 'low');
});

test('software rendering and very low memory get Low', () => {
  assert.equal(detectTier({ gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', mobile: false }), 'low');
  assert.equal(detectTier({ gpu: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650)', mobile: false, memoryGB: 2 }), 'low');
});

test('a strong GPU with little memory is capped at Medium', () => {
  assert.equal(detectTier({ gpu: 'NVIDIA GeForce GTX 1650', mobile: false, memoryGB: 4 }), 'medium');
});

test('phones: recent chips Medium, older ones Low, never High automatically', () => {
  assert.equal(detectTier({ gpu: 'Adreno (TM) 740', mobile: true, memoryGB: 8 }), 'medium');
  assert.equal(detectTier({ gpu: 'Adreno (TM) 610', mobile: true, memoryGB: 4 }), 'low');
  assert.equal(detectTier({ gpu: 'Mali-G78 MC14', mobile: true, memoryGB: 8 }), 'medium');
  assert.equal(detectTier({ gpu: 'Mali-G52 MC2', mobile: true, memoryGB: 4 }), 'low');
  assert.equal(detectTier({ gpu: 'Apple GPU', mobile: true }), 'medium');
});

test('a hidden GPU name on desktop plays safe with Medium', () => {
  assert.equal(detectTier({ gpu: '', mobile: false }), 'medium');
});

test('presets: details map back to their preset, any change is Custom', () => {
  for (const p of ['low', 'medium', 'high'] as const) assert.equal(presetOf(PRESETS[p]), p);
  assert.equal(presetOf({ ...PRESETS.high, bloom: false }), 'custom');
});

test('step down: High -> Medium -> Low -> nothing', () => {
  assert.equal(stepDown('high'), 'medium');
  assert.equal(stepDown('medium'), 'low');
  assert.equal(stepDown('low'), null);
});

test('saved graphics: missing means automatic High until detection, junk is repaired', () => {
  const d = normalizeGraphics(undefined);
  assert.equal(d.auto, true);
  assert.equal(d.detectedTier, null);
  const fixed = normalizeGraphics({ auto: false, details: { resolution: 7, shadows: 'ultra', bloom: 'yes', particles: 'low' } });
  assert.equal(fixed.auto, false);
  assert.equal(fixed.details.resolution, 2);
  assert.equal(fixed.details.shadows, 'high');
  assert.equal(fixed.details.bloom, true);
  assert.equal(fixed.details.particles, 'low');
  assert.equal(fixed.preset, 'custom');
});
