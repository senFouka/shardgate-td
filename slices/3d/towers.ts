import * as THREE from 'three';
import type { TowerKind } from '../shared/layout';
import { Particles, rand } from '../../src/render/particles';

/**
 * Our own tower designs, built from simple flat-shaded shapes and dressed
 * with emissive crystals that bloom. Level 2 is visibly bigger and gains
 * moving parts, so an upgrade reads at a glance.
 */
export interface TowerView {
  group: THREE.Group;
  /** where shots leave the tower (world position read each shot) */
  muzzle: THREE.Object3D;
  update(time: number, dt: number): void;
  onFire(): void;
}

export const ELEMENT_COLOR: Record<TowerKind, THREE.Color> = {
  bolt: new THREE.Color(0.45, 0.72, 1.0),
  ember: new THREE.Color(1.0, 0.45, 0.12),
  frost: new THREE.Color(0.45, 0.85, 1.0),
};

const flat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.05, ...extra });

const glow = (color: THREE.Color, intensity: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({
    color: color.clone().multiplyScalar(0.6),
    emissive: color,
    emissiveIntensity: intensity,
    flatShading: true,
    roughness: 0.3,
    ...extra,
  });

let crackTexture: THREE.CanvasTexture | null = null;
/** Glowing lava cracks for Ember stone (emissive map). */
function cracks(): THREE.CanvasTexture {
  if (crackTexture) return crackTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#ff7a20';
  g.lineCap = 'round';
  let s = 7;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 14; i++) {
    let x = r() * 256;
    let y = r() * 256;
    g.lineWidth = 1.5 + r() * 2.5;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 50;
      y += r() * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  crackTexture = new THREE.CanvasTexture(c);
  crackTexture.colorSpace = THREE.SRGBColorSpace;
  crackTexture.wrapS = crackTexture.wrapT = THREE.RepeatWrapping;
  return crackTexture;
}

let auraTexture: THREE.CanvasTexture | null = null;
export function radialTexture(): THREE.CanvasTexture {
  if (auraTexture) return auraTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  auraTexture = new THREE.CanvasTexture(c);
  return auraTexture;
}

/** A soft glowing disc on the ground under a tower. */
function groundAura(color: THREE.Color, radius: number, strength: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: radialTexture(),
      color: color.clone().multiplyScalar(strength),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.renderOrder = 5;
  return m;
}

function plinth(color: number, trim: number, radius: number): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.12, 0.16, 6), flat(trim));
  base.position.y = 0.08;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.86, radius, 0.12, 6), flat(color));
  top.position.y = 0.22;
  g.add(base, top);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function shadows(g: THREE.Object3D): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh && !(o.material as THREE.Material).transparent) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

export function createTower(kind: TowerKind, level: 1 | 2, fx: Particles, withLight: boolean): TowerView {
  switch (kind) {
    case 'bolt':
      return boltTower(level, fx, withLight);
    case 'ember':
      return emberTower(level, fx, withLight);
    case 'frost':
      return frostTower(level, fx, withLight);
  }
}

function addLight(group: THREE.Group, color: THREE.Color, y: number, intensity: number): THREE.PointLight {
  const light = new THREE.PointLight(color, intensity, 3.2, 1.6);
  light.position.y = y;
  group.add(light);
  return light;
}

/* ----------------------------------------------------------------- Bolt */

function boltTower(level: 1 | 2, fx: Particles, withLight: boolean): TowerView {
  const g = new THREE.Group();
  const big = level === 2;
  g.add(plinth(0x8a8577, 0x5e594f, big ? 0.44 : 0.38));
  const h = big ? 0.95 : 0.7;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(big ? 0.2 : 0.17, big ? 0.27 : 0.23, h, 8), flat(0x9b958a));
  column.position.y = 0.28 + h / 2;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.2, 0.12, 8), flat(0x6c5a3c, { metalness: 0.5, roughness: 0.4 }));
  cap.position.y = 0.28 + h + 0.04;
  g.add(column, cap);
  // brass prongs holding the orb
  const prongs = big ? 4 : 3;
  for (let i = 0; i < prongs; i++) {
    const a = (i / prongs) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.28, 4), flat(0xc9a14a, { metalness: 0.7, roughness: 0.35 }));
    p.position.set(Math.cos(a) * 0.16, cap.position.y + 0.14, Math.sin(a) * 0.16);
    p.rotation.z = Math.cos(a) * -0.35;
    p.rotation.x = Math.sin(a) * 0.35;
    g.add(p);
  }
  const orbY = cap.position.y + 0.26;
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(big ? 0.13 : 0.1, 1), glow(ELEMENT_COLOR.bolt, 1.7));
  orb.position.y = orbY;
  g.add(orb);
  const runes: THREE.Mesh[] = [];
  if (big) {
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.04), glow(ELEMENT_COLOR.bolt, 1.6, { color: 0x555a66 }));
      runes.push(r);
      g.add(r);
    }
  }
  shadows(g);
  g.add(groundAura(ELEMENT_COLOR.bolt, big ? 0.75 : 0.55, big ? 0.35 : 0.22));
  const light = withLight ? addLight(g, ELEMENT_COLOR.bolt, orbY, big ? 1.4 : 0.9) : null;
  const muzzle = new THREE.Object3D();
  muzzle.position.y = orbY;
  g.add(muzzle);
  let pulse = 0;
  return {
    group: g,
    muzzle,
    update(time, dt) {
      pulse = Math.max(0, pulse - dt * 5);
      const s = 1 + pulse * 0.5 + Math.sin(time * 4) * 0.05;
      orb.scale.setScalar(s);
      orb.position.y = orbY + Math.sin(time * 2) * 0.03;
      runes.forEach((r, i) => {
        const a = time * 1.4 + (i / runes.length) * Math.PI * 2;
        r.position.set(Math.cos(a) * 0.36, orbY - 0.05 + Math.sin(time * 2 + i) * 0.05, Math.sin(a) * 0.36);
        r.rotation.y = -a;
      });
      if (light) light.intensity = (big ? 1.4 : 0.9) * (1 + pulse);
    },
    onFire() {
      pulse = 1;
      const p = new THREE.Vector3();
      muzzle.getWorldPosition(p);
      for (let i = 0; i < 6; i++) {
        fx.emit({ x: p.x, y: p.y, z: p.z, vx: rand(-1, 1), vy: rand(-0.5, 1.2), vz: rand(-1, 1), size: 0.12, sizeEnd: 0.02, r: 2, g: 2.4, b: 3, life: 0.25, drag: 3 });
      }
    },
  };
}

/* ---------------------------------------------------------------- Ember */

function emberTower(level: 1 | 2, fx: Particles, withLight: boolean): TowerView {
  const g = new THREE.Group();
  const big = level === 2;
  const basalt = flat(0x2c2522, { emissive: new THREE.Color(1, 0.45, 0.1), emissiveMap: cracks(), emissiveIntensity: 1.6 });
  const base = plinth(0x3a302b, 0x241e1b, big ? 0.46 : 0.4);
  g.add(base);
  const h = big ? 0.75 : 0.5;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(big ? 0.24 : 0.22, big ? 0.34 : 0.3, h, 7), basalt);
  body.position.y = 0.28 + h / 2;
  g.add(body);
  // brazier bowl (lathe profile)
  const bowlPts = [
    new THREE.Vector2(0.08, 0),
    new THREE.Vector2(0.2, 0.04),
    new THREE.Vector2(0.3, 0.14),
    new THREE.Vector2(0.33, 0.2),
    new THREE.Vector2(0.28, 0.21),
  ];
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlPts, 8), flat(0x4a3a30, { metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide }));
  const bowlY = 0.28 + h;
  bowl.position.y = bowlY;
  bowl.scale.setScalar(big ? 1.2 : 1);
  g.add(bowl);
  const horns: THREE.Mesh[] = [];
  if (big) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6, 5), flat(0x1d1715, { emissive: new THREE.Color(1, 0.35, 0.05), emissiveMap: cracks(), emissiveIntensity: 2 }));
      horn.position.set(Math.cos(a) * 0.32, bowlY + 0.18, Math.sin(a) * 0.32);
      horn.rotation.z = Math.cos(a) * -0.5;
      horn.rotation.x = Math.sin(a) * 0.5;
      horns.push(horn);
      g.add(horn);
    }
  }
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(big ? 0.17 : 0.13, 0), glow(ELEMENT_COLOR.ember, 4));
  crystal.scale.y = 1.7;
  const crystalY = bowlY + (big ? 0.38 : 0.3);
  crystal.position.y = crystalY;
  g.add(crystal);
  shadows(g);
  g.add(groundAura(ELEMENT_COLOR.ember, big ? 0.85 : 0.6, big ? 0.55 : 0.35));
  const light = withLight ? addLight(g, ELEMENT_COLOR.ember, crystalY, big ? 2.2 : 1.4) : null;
  const muzzle = new THREE.Object3D();
  muzzle.position.y = crystalY;
  g.add(muzzle);
  let pulse = 0;
  let emitAcc = 0;
  const wp = new THREE.Vector3();
  return {
    group: g,
    muzzle,
    update(time, dt) {
      pulse = Math.max(0, pulse - dt * 4);
      crystal.rotation.y += dt * 1.5;
      crystal.position.y = crystalY + Math.sin(time * 3) * 0.04;
      crystal.scale.set(1 + pulse * 0.4, 1.7 * (1 + pulse * 0.4), 1 + pulse * 0.4);
      // constant flames from the brazier
      emitAcc += dt * (big ? 34 : 22);
      bowl.getWorldPosition(wp);
      while (emitAcc >= 1) {
        emitAcc--;
        const r = big ? 0.24 : 0.18;
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * r;
        fx.emit({
          x: wp.x + Math.cos(a) * d, y: wp.y + 0.2, z: wp.z + Math.sin(a) * d,
          vx: rand(-0.1, 0.1), vy: rand(0.6, 1.2), vz: rand(-0.1, 0.1),
          size: rand(0.16, 0.26) * (big ? 1.25 : 1), sizeEnd: 0.03,
          r: 3, g: rand(0.9, 1.4), b: 0.2, life: rand(0.35, 0.6), drag: 1,
        });
      }
      if (big && Math.random() < dt * 8) {
        // orbiting ember motes
        const a = time * 2 + Math.random();
        fx.emit({ x: wp.x + Math.cos(a) * 0.5, y: wp.y + rand(0, 0.5), z: wp.z + Math.sin(a) * 0.5, vy: 0.5, size: 0.06, r: 3, g: 1.2, b: 0.3, life: 0.8 });
      }
      horns.forEach((h2, i) => ((h2.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6 + Math.sin(time * 3 + i) * 0.6 + pulse * 2));
      if (light) light.intensity = (big ? 2.2 : 1.4) * (0.85 + Math.sin(time * 17) * 0.08 + Math.sin(time * 7.3) * 0.07 + pulse);
    },
    onFire() {
      pulse = 1;
      muzzle.getWorldPosition(wp);
      for (let i = 0; i < 10; i++) {
        fx.emit({ x: wp.x, y: wp.y, z: wp.z, vx: rand(-1.4, 1.4), vy: rand(0, 1.6), vz: rand(-1.4, 1.4), size: 0.18, sizeEnd: 0.02, r: 3, g: 1.1, b: 0.2, life: 0.35, drag: 3 });
      }
    },
  };
}

/* ---------------------------------------------------------------- Frost */

function iceMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x9fe4ff,
    emissive: ELEMENT_COLOR.frost,
    emissiveIntensity: 0.5,
    roughness: 0.12,
    metalness: 0.1,
    flatShading: true,
    transparent: true,
    opacity: 0.88,
  });
}

function frostTower(level: 1 | 2, fx: Particles, withLight: boolean): TowerView {
  const g = new THREE.Group();
  const big = level === 2;
  g.add(plinth(0xb9c6cf, 0x7d8a94, big ? 0.45 : 0.39));
  const h = big ? 0.5 : 0.32;
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, h, 6), flat(0xd6e2ea));
  pedestal.position.y = 0.28 + h / 2;
  g.add(pedestal);
  const topY = 0.28 + h;
  const ice = iceMaterial();
  const cluster = new THREE.Group();
  cluster.position.y = topY;
  const spires: Array<[number, number, number, number]> = big
    ? [[0, 0, 0.2, 1.05], [0.17, 0.05, 0.11, 0.6], [-0.14, 0.1, 0.1, 0.55], [0.02, -0.17, 0.1, 0.5], [-0.1, -0.12, 0.08, 0.4], [0.14, -0.1, 0.07, 0.35]]
    : [[0, 0, 0.15, 0.7], [0.13, 0.04, 0.09, 0.42], [-0.11, 0.07, 0.08, 0.36], [0.02, -0.13, 0.07, 0.3]];
  for (const [x, z, r, len] of spires) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), ice);
    s.scale.y = len / r / 2;
    s.position.set(x, len / 2 - 0.05, z);
    s.rotation.set(x * 1.6, Math.random() * 3, -z * 1.6);
    cluster.add(s);
  }
  g.add(cluster);
  const shards: THREE.Mesh[] = [];
  if (big) {
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), ice);
      s.scale.y = 2.6;
      shards.push(s);
      g.add(s);
    }
  }
  shadows(g);
  g.add(groundAura(ELEMENT_COLOR.frost, big ? 0.9 : 0.62, big ? 0.5 : 0.32));
  const tipY = topY + (big ? 0.95 : 0.62);
  const light = withLight ? addLight(g, ELEMENT_COLOR.frost, tipY - 0.2, big ? 1.8 : 1.1) : null;
  const muzzle = new THREE.Object3D();
  muzzle.position.y = tipY;
  g.add(muzzle);
  let pulse = 0;
  const wp = new THREE.Vector3();
  return {
    group: g,
    muzzle,
    update(time, dt) {
      pulse = Math.max(0, pulse - dt * 4);
      cluster.scale.setScalar(1 + pulse * 0.12);
      ice.emissiveIntensity = 0.45 + Math.sin(time * 2.2) * 0.15 + pulse * 1.2;
      shards.forEach((s, i) => {
        const a = time * 1.1 + (i / shards.length) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.42, tipY - 0.35 + Math.sin(time * 1.7 + i) * 0.08, Math.sin(a) * 0.42);
        s.rotation.y = a;
      });
      // drifting snow sparkles
      if (Math.random() < dt * (big ? 14 : 8)) {
        g.getWorldPosition(wp);
        const a = Math.random() * Math.PI * 2;
        const d = rand(0.2, big ? 0.8 : 0.6);
        fx.emit({ x: wp.x + Math.cos(a) * d, y: wp.y + rand(0.3, 1.3), z: wp.z + Math.sin(a) * d, vy: -0.15, vx: rand(-0.1, 0.1), size: 0.06, r: 1.6, g: 2.2, b: 3, life: 1.4 });
      }
      if (light) light.intensity = (big ? 1.8 : 1.1) * (1 + pulse * 0.8);
    },
    onFire() {
      pulse = 1;
      muzzle.getWorldPosition(wp);
      for (let i = 0; i < 8; i++) {
        fx.emit({ x: wp.x, y: wp.y, z: wp.z, vx: rand(-1, 1), vy: rand(-0.4, 1), vz: rand(-1, 1), size: 0.12, sizeEnd: 0.02, r: 1.4, g: 2.4, b: 3.2, life: 0.35, drag: 3 });
      }
    },
  };
}
