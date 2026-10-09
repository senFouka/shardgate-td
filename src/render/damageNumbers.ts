import * as THREE from 'three';

/**
 * Floating damage numbers over creeps, all in one draw call: every digit is
 * an instance of one quad that faces the camera, cut from a small glyph atlas
 * drawn once on a canvas. Numbers rise, pop and fade; critical hits are
 * bigger, gold and end in "!".
 *
 * Per graphics preset: `density` (the particle density) caps how many numbers
 * live at once; crits are always shown.
 */
const GLYPHS = '0123456789.k!';
const CELL_W = 48;
const CELL_H = 64;
/** digit quad width as a share of its height (the atlas cell shape) */
const ASPECT = CELL_W / CELL_H;
/** distance between two digits, in quad widths (the glyphs are narrower than their cells) */
const ADVANCE = 0.66;
const MAX_DIGITS = 1600;
const LIFE = 0.85;
/** a new hit on a creep joins its number while that number is younger than this (s) */
const MERGE_WINDOW = 0.35;
/** ...and is this close to it (world units, about a creep and a half) */
const MERGE_DIST = 1.1;

interface Num {
  x: number;
  y: number;
  z: number;
  text: string;
  crit: boolean;
  age: number;
  /** small sideways drift so numbers on one creep do not stack exactly */
  dx: number;
  /** the creep it belongs to, and the damage it shows (hits add up) */
  key: number;
  value: number;
}

const VERT = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec3 aGlyph;   // x: offset in glyph widths from the number's centre, y: glyph index, z: size
  attribute vec4 aColor;
  uniform float uCells;
  uniform float uAspect;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
    // billboard: build the quad in view space, so it always faces the camera
    mv.xy += (position.xy * vec2(uAspect, 1.0) + vec2(aGlyph.x * uAspect, 0.0)) * aGlyph.z;
    gl_Position = projectionMatrix * mv;
    vUv = vec2((aGlyph.y + uv.x) / uCells, uv.y);
    vColor = aColor;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vec4 t = texture2D(uAtlas, vUv);
    // the atlas holds white glyphs (red channel) and a dark outline (alpha)
    vec3 col = mix(vec3(0.05, 0.03, 0.02), vColor.rgb, t.r);
    float a = t.a * vColor.a;
    if (a < 0.02) discard;
    gl_FragColor = vec4(col, a);
  }
`;

function makeAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = CELL_W * GLYPHS.length;
  c.height = CELL_H;
  const g = c.getContext('2d')!;
  g.font = `900 ${CELL_H * 0.86}px "Trebuchet MS", "Segoe UI", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  for (let i = 0; i < GLYPHS.length; i++) {
    const x = i * CELL_W + CELL_W / 2;
    const y = CELL_H / 2 + 2;
    // outline: dark, written to alpha only (red stays 0 there)
    g.strokeStyle = 'rgba(0,0,0,1)';
    g.lineWidth = 9;
    g.strokeText(GLYPHS[i], x, y);
    g.fillStyle = '#fff';
    g.fillText(GLYPHS[i], x, y);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

/** 1234 -> "1234", 12345 -> "12.3k", 0.4 -> "1" */
export function formatDamage(n: number): string {
  const v = Math.max(1, Math.round(n));
  if (v < 10000) return String(v);
  const k = v / 1000;
  return (k < 100 ? k.toFixed(1).replace(/\.0$/, '') : String(Math.round(k))) + 'k';
}

export class DamageNumbers {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly center: THREE.InstancedBufferAttribute;
  private readonly glyph: THREE.InstancedBufferAttribute;
  private readonly color: THREE.InstancedBufferAttribute;
  private readonly live: Num[] = [];

  constructor(private readonly density: () => number) {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setAttribute('uv', quad.getAttribute('uv'));
    this.center = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DIGITS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.glyph = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DIGITS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.color = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DIGITS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aCenter', this.center);
    this.geo.setAttribute('aGlyph', this.glyph);
    this.geo.setAttribute('aColor', this.color);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uAtlas: { value: makeAtlas() }, uCells: { value: GLYPHS.length }, uAspect: { value: ASPECT } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 30;
  }

  /**
   * A hit of `amount` at a world point (the creep's head). Hits close together in
   * place and time (the same creep, or a tight crowd) add into one number that
   * grows, instead of a pile of overlapping numbers. Crits join only crits.
   */
  add(x: number, y: number, z: number, amount: number, crit: boolean, key = -1): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const d = this.live[i];
      if (d.crit !== crit || d.age > MERGE_WINDOW) continue;
      if (d.key !== key && Math.hypot(d.x - x, d.z - z) > MERGE_DIST) continue;
      d.value += amount;
      d.text = formatDamage(d.value) + (crit ? '!' : '');
      d.age = Math.min(d.age, 0.05); // a little pop again
      return;
    }
    // the busier the screen, the fewer plain numbers (crits always show)
    const cap = Math.round(60 + 140 * this.density());
    if (!crit && this.live.length >= cap) return;
    this.live.push({ x, y, z, text: formatDamage(amount) + (crit ? '!' : ''), crit, age: 0, dx: (Math.random() - 0.5) * 0.5, key, value: amount });
  }

  clear(): void {
    this.live.length = 0;
    this.geo.instanceCount = 0;
  }

  update(dt: number): void {
    let n = 0;
    const c = this.center.array as Float32Array;
    const gl = this.glyph.array as Float32Array;
    const col = this.color.array as Float32Array;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const d = this.live[i];
      d.age += dt;
      if (d.age >= LIFE) {
        this.live.splice(i, 1);
        continue;
      }
      const t = d.age / LIFE;
      // pop in, rise, fade at the end
      const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.55 : 1.15 - Math.min(0.15, (t - 0.12) * 0.6);
      const size = (d.crit ? 1.14 : 0.62) * pop;
      const alpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
      const rise = (1 - Math.pow(1 - t, 2)) * (d.crit ? 1.1 : 0.85);
      // crits: strong orange (tone mapping washes out paler golds)
      const [r, g, b] = d.crit ? [1, 0.42, 0.04] : [1, 1, 1];
      const len = d.text.length;
      for (let k = 0; k < len && n < MAX_DIGITS; k++, n++) {
        c[n * 3] = d.x + d.dx * t;
        c[n * 3 + 1] = d.y + rise;
        c[n * 3 + 2] = d.z;
        gl[n * 3] = (k - (len - 1) / 2) * ADVANCE;
        gl[n * 3 + 1] = GLYPHS.indexOf(d.text[k]);
        gl[n * 3 + 2] = size;
        col[n * 4] = r;
        col[n * 4 + 1] = g;
        col[n * 4 + 2] = b;
        col[n * 4 + 3] = alpha;
      }
    }
    this.geo.instanceCount = n;
    this.center.needsUpdate = true;
    this.glyph.needsUpdate = true;
    this.color.needsUpdate = true;
  }
}
