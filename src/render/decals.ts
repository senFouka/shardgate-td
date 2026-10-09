import * as THREE from 'three';

/**
 * Marks left on the ground by impacts: a scorch where fire and shells land,
 * frost on the stones, cracks under boulders, a poison puddle, a wet splash.
 * They fade over a few seconds. All of them are one instanced mesh with a
 * small painted atlas, so any number of marks is one draw call; a ring
 * buffer recycles the oldest mark when it is full.
 * Per preset: `setBudget` (particle density) shortens how long marks stay.
 */
export type DecalKind = 'scorch' | 'frost' | 'crack' | 'poison' | 'wet';
const KINDS: DecalKind[] = ['scorch', 'frost', 'crack', 'poison', 'wet'];
const MAX = 160;
const CELL = 128;

const VERT = /* glsl */ `
  attribute vec4 aData;   // kind, birth time, life, (unused)
  uniform float uTime;
  uniform float uKinds;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    float age = uTime - aData.y;
    vFade = clamp(1.0 - age / aData.z, 0.0, 1.0);
    // fade in fast, then out slowly
    vFade *= smoothstep(0.0, 0.08, age);
    vUv = vec2((aData.x + uv.x) / uKinds, uv.y);
    vec4 w = instanceMatrix * vec4(position, 1.0);
    if (age < 0.0 || vFade <= 0.0) w = vec4(0.0, -100.0, 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * w;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    vec4 t = texture2D(uAtlas, vUv);
    float a = t.a * vFade;
    if (a < 0.01) discard;
    gl_FragColor = vec4(t.rgb, a);
  }
`;

function paintAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = CELL * KINDS.length;
  c.height = CELL;
  const g = c.getContext('2d')!;
  let seed = 77;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const R = CELL / 2;
  KINDS.forEach((kind, i) => {
    const cx = i * CELL + R;
    const cy = R;
    g.save();
    if (kind === 'scorch') {
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.95);
      grd.addColorStop(0, 'rgba(18,12,8,0.85)');
      grd.addColorStop(0.45, 'rgba(30,20,12,0.6)');
      grd.addColorStop(1, 'rgba(30,20,12,0)');
      g.fillStyle = grd;
      g.fillRect(i * CELL, 0, CELL, CELL);
      // jagged soot spikes
      for (let k = 0; k < 14; k++) {
        const a = rnd() * Math.PI * 2;
        const len = R * (0.5 + rnd() * 0.45);
        g.strokeStyle = 'rgba(20,14,10,0.45)';
        g.lineWidth = 3 + rnd() * 4;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        g.stroke();
      }
      // a few embers still glowing
      for (let k = 0; k < 8; k++) {
        g.fillStyle = 'rgba(255,140,40,0.75)';
        g.beginPath();
        g.arc(cx + (rnd() - 0.5) * R * 0.8, cy + (rnd() - 0.5) * R * 0.8, 1.5 + rnd() * 2, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === 'frost') {
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.95);
      grd.addColorStop(0, 'rgba(225,245,255,0.75)');
      grd.addColorStop(0.6, 'rgba(180,225,250,0.45)');
      grd.addColorStop(1, 'rgba(180,225,250,0)');
      g.fillStyle = grd;
      g.fillRect(i * CELL, 0, CELL, CELL);
      // frost ferns: branching white lines
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 2;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + rnd() * 0.3;
        const len = R * (0.6 + rnd() * 0.3);
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        for (let b = 1; b < 4; b++) {
          const px = cx + Math.cos(a) * len * (b / 4);
          const py = cy + Math.sin(a) * len * (b / 4);
          for (const side of [-1, 1]) {
            g.moveTo(px, py);
            g.lineTo(px + Math.cos(a + side * 0.7) * len * 0.18, py + Math.sin(a + side * 0.7) * len * 0.18);
          }
        }
        g.stroke();
      }
    } else if (kind === 'crack') {
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.6);
      grd.addColorStop(0, 'rgba(40,32,24,0.55)');
      grd.addColorStop(1, 'rgba(40,32,24,0)');
      g.fillStyle = grd;
      g.fillRect(i * CELL, 0, CELL, CELL);
      g.strokeStyle = 'rgba(25,20,15,0.85)';
      g.lineCap = 'round';
      for (let k = 0; k < 7; k++) {
        let a = rnd() * Math.PI * 2;
        let x = cx;
        let y = cy;
        g.lineWidth = 3.5;
        g.beginPath();
        g.moveTo(x, y);
        const steps = 4 + Math.floor(rnd() * 3);
        for (let s = 0; s < steps; s++) {
          a += (rnd() - 0.5) * 0.9;
          x += Math.cos(a) * R * 0.17;
          y += Math.sin(a) * R * 0.17;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    } else if (kind === 'poison') {
      // a puddle: blobby outline, bright rim, bubbles
      g.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const rr = R * (0.62 + Math.sin(a * 3 + 1) * 0.08 + Math.sin(a * 5) * 0.05);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.7);
      grd.addColorStop(0, 'rgba(90,170,30,0.85)');
      grd.addColorStop(0.8, 'rgba(60,130,20,0.8)');
      grd.addColorStop(1, 'rgba(150,230,60,0.9)');
      g.fillStyle = grd;
      g.fill();
      for (let k = 0; k < 7; k++) {
        g.strokeStyle = 'rgba(200,255,120,0.8)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(cx + (rnd() - 0.5) * R * 0.8, cy + (rnd() - 0.5) * R * 0.8, 2 + rnd() * 4, 0, Math.PI * 2);
        g.stroke();
      }
    } else {
      // wet stones: dark, cool, with a few droplets
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.95);
      grd.addColorStop(0, 'rgba(30,60,80,0.55)');
      grd.addColorStop(0.7, 'rgba(30,60,80,0.35)');
      grd.addColorStop(1, 'rgba(30,60,80,0)');
      g.fillStyle = grd;
      g.fillRect(i * CELL, 0, CELL, CELL);
      for (let k = 0; k < 18; k++) {
        const a = rnd() * Math.PI * 2;
        const rr = R * (0.4 + rnd() * 0.5);
        g.fillStyle = 'rgba(170,220,240,0.55)';
        g.beginPath();
        g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.5 + rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Decals {
  readonly mesh: THREE.InstancedMesh;
  private readonly data: THREE.InstancedBufferAttribute;
  private readonly mat: THREE.ShaderMaterial;
  private next = 0;
  private lifeScale = 1;
  private readonly m = new THREE.Matrix4();
  private readonly flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private readonly spin = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 0, 1);

  constructor() {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4).fill(0), 4);
    for (let i = 0; i < MAX; i++) this.data.setXYZW(i, 0, -999, 0.001, 0);
    this.data.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aData', this.data);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uAtlas: { value: paintAtlas() }, uTime: { value: 0 }, uKinds: { value: KINDS.length } },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
  }

  /** How long marks stay, from the particle density (0.2 .. 1). */
  setBudget(share: number): void {
    this.lifeScale = Math.max(0.35, Math.min(1, share));
  }

  add(kind: DecalKind, x: number, z: number, radius: number, life: number, time: number): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    const s = radius * 2;
    // lying flat, turned at random so repeated marks never look stamped
    const q = this.flat.clone().multiply(this.spin.setFromAxisAngle(this.up, Math.random() * Math.PI * 2));
    this.m.compose(new THREE.Vector3(x, 0.025 + (i % 7) * 0.0006, z), q, new THREE.Vector3(s, s, 1));
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.data.setXYZW(i, KINDS.indexOf(kind), time, life * this.lifeScale, 0);
    this.data.needsUpdate = true;
  }

  update(time: number): void {
    this.mat.uniforms.uTime.value = time;
  }

  clear(): void {
    for (let i = 0; i < MAX; i++) this.data.setXYZW(i, 0, -999, 0.001, 0);
    this.data.needsUpdate = true;
  }
}
