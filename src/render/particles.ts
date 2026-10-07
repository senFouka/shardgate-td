import * as THREE from 'three';

/**
 * One pooled particle system = one draw call. Each particle is a soft round
 * point sprite with its own size, colour (HDR: values above 1 bloom) and
 * life. Gravity, drag and growth are per-particle.
 */
export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** world-unit diameter at birth and death */
  size: number;
  sizeEnd?: number;
  /** linear RGB, may exceed 1 */
  r: number;
  g: number;
  b: number;
  /** opacity at birth (fades to 0) */
  alpha?: number;
  life: number;
  gravity?: number;
  drag?: number;
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform float uSoft;
  varying vec4 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, uSoft) * vColor.a;
    #ifdef ADDITIVE
      gl_FragColor = vec4(vColor.rgb * a, a);
    #else
      gl_FragColor = vec4(vColor.rgb, a);
    #endif
  }
`;

export class Particles {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly vel: Float32Array;
  private readonly base: Float32Array; // r g b alpha
  private readonly life: Float32Array; // age, life, size0, size1
  private readonly phys: Float32Array; // gravity, drag
  private readonly material: THREE.ShaderMaterial;
  private cursor = 0;
  private alive = 0;

  constructor(
    private readonly capacity: number,
    additive: boolean,
    soft = 1.6,
  ) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.base = new Float32Array(capacity * 4);
    this.life = new Float32Array(capacity * 4);
    this.phys = new Float32Array(capacity * 2);
    for (let i = 0; i < capacity; i++) this.life[i * 4 + 1] = -1; // dead
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 600 }, uSoft: { value: soft } },
      defines: additive ? { ADDITIVE: '' } : {},
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 10;
  }

  /** Pixels per world unit at distance 1; call on resize. */
  setScale(drawingBufferHeight: number, fovDeg: number): void {
    this.material.uniforms.uScale.value = drawingBufferHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  emit(p: ParticleSpec): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = p.vx ?? 0;
    this.vel[i * 3 + 1] = p.vy ?? 0;
    this.vel[i * 3 + 2] = p.vz ?? 0;
    this.base[i * 4] = p.r;
    this.base[i * 4 + 1] = p.g;
    this.base[i * 4 + 2] = p.b;
    this.base[i * 4 + 3] = p.alpha ?? 1;
    this.life[i * 4] = 0;
    this.life[i * 4 + 1] = p.life;
    this.life[i * 4 + 2] = p.size;
    this.life[i * 4 + 3] = p.sizeEnd ?? p.size;
    this.phys[i * 2] = p.gravity ?? 0;
    this.phys[i * 2 + 1] = p.drag ?? 0;
  }

  update(dt: number): void {
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      const L = this.life[i * 4 + 1];
      if (L < 0) continue;
      const age = (this.life[i * 4] += dt);
      if (age >= L) {
        this.life[i * 4 + 1] = -1;
        this.size[i] = 0;
        this.col[i * 4 + 3] = 0;
        continue;
      }
      alive++;
      const t = age / L;
      const drag = Math.max(0, 1 - this.phys[i * 2 + 1] * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - this.phys[i * 2] * dt;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.life[i * 4 + 2] + (this.life[i * 4 + 3] - this.life[i * 4 + 2]) * t;
      // quick fade in, smooth fade out
      const fade = Math.min(1, t * 8) * (1 - t) * (1 - t);
      this.col[i * 4] = this.base[i * 4];
      this.col[i * 4 + 1] = this.base[i * 4 + 1];
      this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * fade;
    }
    this.alive = alive;
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  }

  get count(): number {
    return this.alive;
  }
}

/** Shared random helpers. */
export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
export function randDir(): [number, number, number] {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return [s * Math.cos(a), u, s * Math.sin(a)];
}
