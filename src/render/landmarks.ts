import * as THREE from 'three';
import { EXIT_NODE, SPAWN_NODE, nodeCenter } from '../data/map';
import { cellX, cellZ } from './coords';
import { bakeStatic, dynamic } from './bake';

/**
 * The Shardgates: the hero of the scene, our own design. Two great gates
 * stand at the top of the battlefield, blue where the creeps come out and red
 * where they leave. Each is a pointed stone arch on carved pillars with gold
 * bands, on a stepped dais with a ring of glowing runes; a vortex swirls in
 * the arch, crystal shards float above the pillars and orbit the keystone,
 * and motes spill out of the blue gate and are drawn into the red one.
 * Between them, behind, the Shard itself: a great crystal floating over a
 * pedestal, slowly turning, ringed by smaller shards.
 *
 * Per preset: the motes follow the particle density; everything else is a
 * few meshes and two small shaders, the same everywhere.
 */
export interface Landmarks {
  group: THREE.Group;
  update(time: number, dt: number): void;
  setDensity(share: number): void;
  setScale(bufferHeight: number, fov: number): void;
}

const flat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

const STONE = flat(0x8a8378);
const STONE_DARK = flat(0x6e685f);
const STONE_PALE = flat(0x9a9387);
const GOLD = new THREE.MeshStandardMaterial({ color: 0xd8a94c, metalness: 1, roughness: 0.32 });

let glowTex: THREE.CanvasTexture | null = null;
export function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** A soft glow disc lying on the ground at (x, z). */
export function groundGlow(color: THREE.Color, radius: number, strength: number, x = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: color.clone().multiplyScalar(strength), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.03, z);
  m.renderOrder = 5;
  return m;
}

/* ------------------------------------------------------------ shaders */

/** The swirl in a gate's arch: spiral arms around a bright core, a rim of light. */
function vortexMaterial(inner: THREE.Color, outer: THREE.Color, dir: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uInner: { value: inner }, uOuter: { value: outer }, uDir: { value: dir } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uInner; uniform vec3 uOuter; uniform float uDir; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
      void main() {
        // the arch: a circle on top of a rectangle (uv 0..1, the arch top at v = 1)
        vec2 p = vec2(vUv.x - 0.5, vUv.y - 0.62) * vec2(2.0, 2.6);
        float inside = p.y < 0.0 ? (1.0 - smoothstep(0.92, 1.0, abs(p.x))) * smoothstep(-1.62, -1.5, p.y) : 1.0 - smoothstep(0.92, 1.0, length(p));
        if (inside <= 0.001) discard;
        vec2 c = vec2(vUv.x - 0.5, vUv.y - 0.5) * vec2(2.0, 1.6);
        float r = length(c);
        float a = atan(c.y, c.x);
        float t = uTime * uDir;
        float arms = sin(a * 3.0 + log(r + 0.05) * 7.0 - t * 3.0) * 0.5 + 0.5;
        float n = vnoise(vec2(a * 2.0 + t * 0.6, r * 6.0 - t * 1.5));
        float swirl = smoothstep(0.25, 0.95, arms * 0.75 + n * 0.45);
        float core = exp(-r * r * 3.5);
        // calm colours: a deep swirl with lighter arms and a soft core (no glare)
        vec3 col = mix(uOuter * 0.55, uInner, clamp(swirl * 0.55 + core * 0.7, 0.0, 1.0));
        float rim = p.y < 0.0 ? smoothstep(0.75, 0.98, abs(p.x)) : smoothstep(0.75, 0.98, length(p));
        col = mix(col, uInner, rim * 0.35);
        gl_FragColor = vec4(min(col, vec3(1.15)), inside * 0.92);
      }`,
  });
}

/** Motes around a gate, moved on the GPU: out of the blue gate, into the red one. */
function motesMaterial(color: THREE.Color, inward: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 800 }, uColor: { value: color }, uIn: { value: inward ? 1 : 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aSeed; // phase, angle, speed
      uniform float uTime; uniform float uScale; uniform float uIn;
      varying float vA;
      void main() {
        float life = fract(uTime * (0.18 + aSeed.z * 0.2) + aSeed.x);
        float k = uIn > 0.5 ? 1.0 - life : life;     // 0 at the vortex, 1 far out
        float ang = aSeed.y + k * 2.2 * (uIn > 0.5 ? -1.0 : 1.0);
        float rad = 0.2 + k * 2.6;
        vec3 p = vec3(cos(ang) * rad, 1.75 + sin(ang) * rad * 0.55 + k * 0.4, sin(ang) * rad * 0.35 + 0.2 + k * 1.2);
        vA = sin(life * 3.14159);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.09 + 0.07 * (1.0 - k)) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float a = pow(1.0 - d, 1.5) * vA;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
}

/* --------------------------------------------------------------- pieces */

/** A stepped octagonal dais with a ring of glowing rune stones. */
function dais(glow: THREE.Color, runeMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const s1 = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.25, 0.22, 8), STONE_DARK);
  s1.position.y = 0.11;
  const s2 = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.9, 0.2, 8), STONE);
  s2.position.y = 0.32;
  const s3 = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.55, 0.16, 8), STONE_PALE);
  s3.position.y = 0.5;
  g.add(s1, s2, s3);
  // rune stones set into the middle step
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.3), runeMat);
    r.position.set(Math.sin(a) * 1.68, 0.43, Math.cos(a) * 1.68);
    r.rotation.y = a;
    g.add(r);
  }
  // a front stair down to the road
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.32), i % 2 ? STONE : STONE_PALE);
    st.position.set(0, 0.06 + i * 0.16, 2.35 - i * 0.28);
    g.add(st);
  }
  g.add(groundGlow(glow, 3.0, 0.22));
  return g;
}

/** A carved pillar: tapered octagonal shaft with gold bands, a capital and a socket for a crystal. */
function pillar(height: number): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.35, 8), STONE_DARK);
  base.position.y = 0.17;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.36, height, 8), STONE);
  shaft.position.y = 0.35 + height / 2;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.3, 0.32, 8), STONE_PALE);
  cap.position.y = 0.35 + height + 0.16;
  g.add(base, shaft, cap);
  for (const f of [0.18, 0.55, 0.92]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.33 - f * 0.06, 0.04, 5, 8), GOLD);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.35 + height * f;
    g.add(band);
  }
  // a crown of four gold prongs holding the crystal
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const prong = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.45, 4), GOLD);
    prong.position.set(Math.sin(a) * 0.3, 0.35 + height + 0.5, Math.cos(a) * 0.3);
    prong.rotation.order = 'YXZ';
    prong.rotation.y = a;
    prong.rotation.x = -0.35;
    g.add(prong);
  }
  return g;
}

/** A pointed stone arch (two leaning segments meeting at a keystone), facing +z. */
function arch(span: number, rise: number): THREE.Group {
  const g = new THREE.Group();
  const segs = 7;
  for (const side of [-1, 1]) {
    for (let i = 0; i < segs; i++) {
      // each side is a quarter-ish curve from the pillar top to the apex
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const pt = (t: number) => new THREE.Vector2(side * (span / 2) * (1 - Math.sin(t * Math.PI / 2) * 0.98), rise * Math.sin(t * Math.PI / 2) ** 0.8);
      const a = pt(t0);
      const b = pt(t1);
      const len = a.distanceTo(b) + 0.06;
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.36, len, 0.5), i % 2 ? STONE : STONE_PALE);
      block.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
      block.rotation.z = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
      g.add(block);
    }
  }
  return g;
}

/* ------------------------------------------------------------- one gate */

interface Gate {
  group: THREE.Group;
  update(t: number, dt: number): void;
  motes: THREE.Points;
  moteMat: THREE.ShaderMaterial;
}

function gate(x: number, z: number, inner: THREE.Color, outer: THREE.Color, inward: boolean): Gate {
  const g = new THREE.Group();
  const runeMat = new THREE.MeshBasicMaterial({ color: outer.clone().multiplyScalar(0.7) });
  const crystalMat = new THREE.MeshStandardMaterial({
    color: outer.clone().multiplyScalar(0.5), emissive: outer, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.1, flatShading: true,
  });
  g.add(dais(outer, runeMat));
  const H = 2.6;
  const span = 2.5;
  for (const side of [-1, 1]) {
    const p = pillar(H);
    p.position.set(side * span / 2, 0.5, 0);
    g.add(p);
  }
  const a = arch(span, 1.25);
  a.position.y = 0.5 + 0.35 + H + 0.3;
  g.add(a);
  // the keystone: a gold setting with a crystal
  const keystone = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), GOLD);
  keystone.scale.set(1, 1.3, 0.7);
  keystone.position.set(0, a.position.y + 1.25, 0.05);
  g.add(keystone);

  // the vortex fills the arch, slightly in front of the stone
  const vMat = vortexMaterial(inner, outer, inward ? -1 : 1);
  const vortex = new THREE.Mesh(new THREE.PlaneGeometry(span - 0.32, H + 1.55), vMat);
  vortex.position.set(0, 0.5 + 0.35 + (H + 1.55) / 2 - 0.05, 0.02);
  g.add(dynamic(vortex));

  // crystals floating above the pillars and a ring orbiting the keystone
  const floaters: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), crystalMat);
    c.scale.y = 2.3;
    c.position.set(side * span / 2, 0.5 + 0.35 + H + 1.15, 0);
    floaters.push(dynamic(c));
    g.add(c);
  }
  const ring = dynamic(new THREE.Group());
  ring.position.set(0, keystone.position.y + 0.15, 0);
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), crystalMat);
    s.scale.y = 2;
    const ang = (i / 6) * Math.PI * 2;
    s.position.set(Math.cos(ang) * 0.75, Math.sin(ang * 2) * 0.1, Math.sin(ang) * 0.45);
    ring.add(s);
  }
  g.add(ring);

  // motes
  const N = 160;
  const seeds = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) seeds.set([Math.random(), Math.random() * Math.PI * 2, Math.random()], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 6);
  const moteMat = motesMaterial(inner.clone().multiplyScalar(0.38), inward);
  const motes = new THREE.Points(geo, moteMat);
  motes.renderOrder = 16;
  g.add(dynamic(motes));

  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m.material as THREE.Material).transparent) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  bakeStatic(g);
  g.position.set(x, 0, z);

  const baseY = floaters.map((f) => f.position.y);
  let pulse = 0;
  return {
    group: g,
    motes,
    moteMat,
    update(t, dt) {
      vMat.uniforms.uTime.value = t;
      moteMat.uniforms.uTime.value = t;
      floaters.forEach((f, i) => {
        f.position.y = baseY[i] + Math.sin(t * 1.4 + i * 2) * 0.12;
        f.rotation.y = t * (0.8 + i * 0.3);
      });
      ring.rotation.y = t * 0.9 * (inward ? -1 : 1);
      pulse = Math.max(0, pulse - dt);
      crystalMat.emissiveIntensity = 0.55 + Math.sin(t * 2.2) * 0.12;
      (runeMat.color as THREE.Color).copy(outer).multiplyScalar(0.6 + Math.sin(t * 1.7 + x) * 0.15);
    },
  };
}

/* ------------------------------------------------------------- the Shard */

function shardMonument(x: number, z: number): { group: THREE.Group; update(t: number): void } {
  const g = new THREE.Group();
  const shardMat = new THREE.MeshStandardMaterial({
    color: 0x9b8cff, emissive: new THREE.Color(0.55, 0.45, 1.3), emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.15, flatShading: true,
  });
  // the pedestal: a square stepped plinth with gold corners
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 2.2), STONE_DARK);
  p1.position.y = 0.15;
  const p2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), STONE);
  p2.position.y = 0.5;
  const p3 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 0.9, 8), STONE_PALE);
  p3.position.y = 1.15;
  g.add(p1, p2, p3);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 4), GOLD);
    c.position.set(sx * 0.7, 1.0, sz * 0.7);
    g.add(c);
  }
  // the Shard and the smaller shards around it
  const spin = dynamic(new THREE.Group());
  spin.position.y = 3.3;
  const big = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), shardMat);
  big.scale.set(0.8, 2.2, 0.8);
  spin.add(big);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), shardMat);
    s.scale.y = 2.2;
    s.position.set(Math.cos(a) * 1.1, Math.sin(a * 3) * 0.35, Math.sin(a) * 1.1);
    s.rotation.z = Math.cos(a) * 0.4;
    spin.add(s);
  }
  g.add(spin);
  g.add(groundGlow(new THREE.Color(0.6, 0.5, 1.4), 2.4, 0.2));
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m.material as THREE.Material).transparent) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  bakeStatic(g);
  g.position.set(x, 0, z);
  return {
    group: g,
    update(t) {
      spin.rotation.y = t * 0.35;
      spin.position.y = 3.3 + Math.sin(t * 0.9) * 0.15;
      shardMat.emissiveIntensity = 0.5 + Math.sin(t * 1.3) * 0.12;
    },
  };
}

/* --------------------------------------------------------------- build */

export function buildLandmarks(): Landmarks {
  const group = new THREE.Group();
  const s = nodeCenter(SPAWN_NODE[0], SPAWN_NODE[1]);
  const e = nodeCenter(EXIT_NODE[0], EXIT_NODE[1]);
  const z = cellZ(-1.6);
  const blue = gate(cellX(s.col), z, new THREE.Color(0.55, 0.85, 1.0), new THREE.Color(0.12, 0.38, 0.95), false);
  const red = gate(cellX(e.col), z, new THREE.Color(1.0, 0.62, 0.35), new THREE.Color(0.9, 0.18, 0.08), true);
  const shard = shardMonument((cellX(s.col) + cellX(e.col)) / 2, z - 3.2);
  group.add(blue.group, red.group, shard.group);
  const gates = [blue, red];
  return {
    group,
    update(t, dt) {
      blue.update(t, dt);
      red.update(t, dt);
      shard.update(t);
    },
    setDensity(share) {
      for (const gt of gates) gt.motes.geometry.setDrawRange(0, Math.round(160 * Math.max(0.3, Math.min(1, share))));
    },
    setScale(bufferHeight, fov) {
      const k = bufferHeight / (2 * Math.tan((fov * Math.PI) / 360));
      for (const gt of gates) gt.moteMat.uniforms.uScale.value = k;
    },
  };
}
