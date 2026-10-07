import * as THREE from 'three';
import { isElement, type TowerId } from '../game/Game';
import { createElementTower } from './elementTowers';
import { Particles, rand } from './particles';
import { buildOrnate } from './ornate';

/**
 * Tower models, our own designs built in code on the ornate tower kit
 * (ornate.ts): pale stone, gold trim, coloured panels, a glowing head that
 * shows what the tower does. Each tower turns its head toward its target and
 * reacts when it fires.
 */
export interface TowerView {
  group: THREE.Group;
  /** turns toward the target */
  head: THREE.Object3D;
  /** where shots leave the tower */
  muzzle: THREE.Object3D;
  update(time: number, dt: number): void;
  /** aim at a world point (smoothly) */
  aim(x: number, z: number): void;
  onFire(): void;
}

const flat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.05, ...extra });

const MATS = {
  stone: flat(0x8f897e),
  stoneDark: flat(0x615b52),
  wood: flat(0x6b4a2e),
  brass: flat(0xc79a45, { metalness: 0.65, roughness: 0.4 }),
  iron: flat(0x3d3f45, { metalness: 0.6, roughness: 0.45 }),
  bronze: flat(0x9a6a36, { metalness: 0.6, roughness: 0.4 }),
  boltGlow: flat(0x2f5f9a, { emissive: new THREE.Color(0.35, 0.7, 1.0), emissiveIntensity: 1.6, roughness: 0.3 }),
  ember: flat(0x5a2a10, { emissive: new THREE.Color(1.0, 0.45, 0.1), emissiveIntensity: 1.4 }),
};
const GOLD_TRIM = new THREE.MeshStandardMaterial({ color: 0xd8a94c, metalness: 1, roughness: 0.32 });

function shadows(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
}

/** Hexagonal stone plinth for the Bolt tower. */
function plinth(radius: number): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.1, 0.14, 6), MATS.stoneDark);
  base.position.y = 0.07;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.88, radius, 0.1, 6), MATS.stone);
  top.position.y = 0.19;
  g.add(base, top);
  return g;
}

export function createTower(kind: TowerId, fx: Particles, level = 1): TowerView {
  if (isElement(kind)) return createElementTower(kind, fx, level);
  return kind === 'bolt' ? boltTower(fx, level) : mortarTower(fx, level);
}

/** Smoothly turns `head` toward `want` (radians). */
function turn(head: THREE.Object3D, want: number, dt: number, speed: number): void {
  let d = want - head.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  head.rotation.y += d * Math.min(1, dt * speed);
}

/* ----------------------------------------------------------------- Bolt */

/**
 * Bolt: a small arbalest on a stone post. Level 2 raises the post and adds
 * gold bands and longer limbs; level 3 adds a gold crown of blades with
 * floating rune stones, and a brighter bolt.
 */
function boltTower(fx: Particles, level: number): TowerView {
  const g = new THREE.Group();
  const L = Math.max(1, Math.min(3, level));
  g.add(plinth(0.42 + (L - 1) * 0.03));
  const postH = 0.5 + (L - 1) * 0.22;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2 + (L - 1) * 0.02, postH, 8), MATS.stone);
  post.position.y = 0.23 + postH / 2;
  const collarY = 0.23 + postH + 0.03;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.08, 8), MATS.brass);
  collar.position.y = collarY;
  g.add(post, collar);
  if (L >= 2) {
    for (const f of [0.25, 0.7]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.175 + (1 - f) * 0.02, 0.022, 5, 8), GOLD_TRIM);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.23 + postH * f;
      g.add(band);
    }
  }
  const runes: THREE.Mesh[] = [];
  if (L >= 3) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.32, 4), GOLD_TRIM);
      blade.position.set(Math.cos(a) * 0.2, collarY + 0.12, Math.sin(a) * 0.2);
      blade.rotation.z = Math.cos(a) * -0.45;
      blade.rotation.x = Math.sin(a) * 0.45;
      g.add(blade);
    }
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.03), MATS.boltGlow);
      runes.push(r);
      g.add(r);
    }
  }

  // the head: an arbalest with brass limbs and a glowing bolt
  const head = new THREE.Group();
  head.position.y = collarY + 0.1;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.62 + (L - 1) * 0.06), MATS.wood);
  stock.position.z = 0.06;
  head.add(stock);
  const limbLen = 0.34 + (L - 1) * 0.06;
  for (const side of [-1, 1]) {
    const limb = new THREE.Mesh(new THREE.BoxGeometry(limbLen, 0.05, 0.06), L >= 2 ? GOLD_TRIM : MATS.brass);
    limb.position.set(side * (limbLen * 0.6), 0.02, 0.26);
    limb.rotation.y = side * -0.35;
    head.add(limb);
  }
  const bolt = new THREE.Mesh(new THREE.OctahedronGeometry(0.06 + (L - 1) * 0.01, 0), MATS.boltGlow);
  bolt.scale.set(1, 1, 3.4);
  bolt.position.set(0, 0.1, 0.22);
  head.add(bolt);
  const string = new THREE.Mesh(new THREE.BoxGeometry(limbLen * 1.85, 0.015, 0.015), flat(0xe8e0c8));
  string.position.set(0, 0.03, 0.12);
  head.add(string);
  g.add(head);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.1, 0.5);
  head.add(muzzle);
  shadows(g);

  let recoil = 0;
  let want = 0;
  const wp = new THREE.Vector3();
  return {
    group: g,
    head,
    muzzle,
    aim(x, z) {
      g.getWorldPosition(wp);
      want = Math.atan2(x - wp.x, z - wp.z);
    },
    update(time, dt) {
      turn(head, want, dt, 14);
      recoil = Math.max(0, recoil - dt * 6);
      head.position.z = -recoil * 0.08;
      bolt.visible = recoil < 0.55;
      (bolt.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + (L - 1) * 0.4 + Math.sin(time * 4) * 0.3;
      runes.forEach((r, i) => {
        const a = time * 1.5 + (i / runes.length) * Math.PI * 2;
        r.position.set(Math.cos(a) * 0.34, collarY - 0.1 + Math.sin(time * 2 + i) * 0.04, Math.sin(a) * 0.34);
        r.rotation.y = -a;
      });
    },
    onFire() {
      recoil = 1;
      muzzle.getWorldPosition(wp);
      for (let i = 0; i < 6 + L * 2; i++) {
        fx.emit({ x: wp.x, y: wp.y, z: wp.z, vx: rand(-1, 1), vy: rand(-0.3, 1), vz: rand(-1, 1), size: 0.1, sizeEnd: 0.02, r: 1.2, g: 2, b: 3.2, life: 0.22, drag: 3 });
      }
    },
  };
}

/* ------------------------------------------------------------ Light (orb) */

/**
 * The glowing-orb ornate tower the user picked for the Light element
 * (element towers arrive in Milestone 3). Kept here so its look is ready.
 */
export function orbTower(fx: Particles, tier: number): TowerView {
  const g = new THREE.Group();
  const orn = buildOrnate({ panel: 0x1f3f9e, glow: new THREE.Color(0.35, 0.8, 1.4), tier, shape: 'hourglass' });
  g.add(orn.group);
  const head = new THREE.Group();
  head.position.y = orn.topY + 0.32;
  const orbMat = flat(0x2a6fd0, { emissive: new THREE.Color(0.45, 0.85, 1.6), emissiveIntensity: 1.8, roughness: 0.15, flatShading: false });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.15 + tier * 0.02, 20, 14), orbMat);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.24 + tier * 0.03, 0.018, 6, 28), MATS.brass);
  head.add(orb, halo);
  g.add(head);
  const muzzle = new THREE.Object3D();
  head.add(muzzle);
  shadows(head);
  let flare = 0;
  const wp = new THREE.Vector3();
  return {
    group: g,
    head,
    muzzle,
    aim() {
      /* the orb fires in any direction */
    },
    update(time, dt) {
      orn.update(time);
      flare = Math.max(0, flare - dt * 5);
      halo.rotation.x = Math.PI / 2 + Math.sin(time * 1.3) * 0.5;
      halo.rotation.y = time * 1.6;
      orb.position.y = Math.sin(time * 2) * 0.03;
      orb.scale.setScalar(1 + flare * 0.35);
      orbMat.emissiveIntensity = 1.6 + Math.sin(time * 3) * 0.3 + flare * 2.5;
      if (Math.random() < dt * 6) {
        head.getWorldPosition(wp);
        const ang = Math.random() * Math.PI * 2;
        fx.emit({ x: wp.x + Math.cos(ang) * 0.3, y: wp.y - 0.2, z: wp.z + Math.sin(ang) * 0.3, vy: 0.5, size: 0.06, r: 0.8, g: 1.6, b: 3, life: 1.0 });
      }
    },
    onFire() {
      flare = 1;
      orn.pulse();
    },
  };
}

/* --------------------------------------------------------------- Mortar */

/**
 * Mortar: a stout drum tower with crimson panels; a bronze mortar sits in its
 * gold crown, glowing at the mouth, and lobs burning shells.
 */
function mortarTower(fx: Particles, level: number): TowerView {
  const g = new THREE.Group();
  const orn = buildOrnate({ panel: 0x8e1f22, glow: new THREE.Color(1.6, 0.55, 0.15), tier: level, shape: 'drum' });
  g.add(orn.group);
  const head = new THREE.Group();
  head.position.y = orn.topY + 0.02;
  const cradle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.1, 8), MATS.iron);
  cradle.position.y = 0.05;
  head.add(cradle);
  const pivot = new THREE.Group();
  pivot.position.y = 0.14;
  pivot.rotation.x = -0.75;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.42, 12), MATS.bronze);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.1;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 14), MATS.brass);
  lip.position.z = 0.31;
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.1, 14), MATS.ember);
  glow.position.z = 0.3;
  pivot.add(barrel, lip, glow);
  head.add(pivot);
  g.add(head);
  const muzzle = new THREE.Object3D();
  muzzle.position.z = 0.36;
  pivot.add(muzzle);
  shadows(head);

  let recoil = 0;
  let want = 0;
  const wp = new THREE.Vector3();
  return {
    group: g,
    head,
    muzzle,
    aim(x, z) {
      g.getWorldPosition(wp);
      want = Math.atan2(x - wp.x, z - wp.z);
    },
    update(time, dt) {
      orn.update(time);
      turn(head, want, dt, 6);
      recoil = Math.max(0, recoil - dt * 3);
      const k = recoil * 0.1;
      barrel.position.z = 0.1 - k;
      lip.position.z = 0.31 - k;
      glow.position.z = 0.3 - k;
      (glow.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + recoil * 3 + Math.sin(time * 5) * 0.2;
      if (Math.random() < dt * 3) {
        muzzle.getWorldPosition(wp);
        fx.emit({ x: wp.x, y: wp.y, z: wp.z, vy: 0.6, size: 0.08, r: 3, g: 1.1, b: 0.2, life: 0.6 });
      }
    },
    onFire() {
      recoil = 1;
      orn.pulse();
      muzzle.getWorldPosition(wp);
      fx.emit({ x: wp.x, y: wp.y, z: wp.z, size: 0.7, sizeEnd: 0.1, r: 3, g: 1.6, b: 0.5, life: 0.12 });
      for (let i = 0; i < 10; i++) {
        fx.emit({ x: wp.x, y: wp.y, z: wp.z, vx: rand(-1.4, 1.4), vy: rand(0.5, 2.2), vz: rand(-1.4, 1.4), size: 0.12, sizeEnd: 0.02, r: 3, g: 1.3, b: 0.3, life: 0.3, drag: 3, gravity: 3 });
      }
    },
  };
}

/* ---------------------------------------------------------- range ring */

/** A glowing ring on the ground showing a tower's reach. */
export function rangeRing(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.97, 1, 64),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.15, 0.7), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(0.97, 64),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.3, 0.15), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.add(fill);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.05;
  m.renderOrder = 6;
  m.visible = false;
  return m;
}

/** A see-through copy of a tower, tinted green (can build) or red (cannot). */
export function ghostOf(view: TowerView): { group: THREE.Group; setValid(ok: boolean): void } {
  const ok = new THREE.MeshBasicMaterial({ color: 0x7dffa0, transparent: true, opacity: 0.45, depthWrite: false });
  const bad = new THREE.MeshBasicMaterial({ color: 0xff6060, transparent: true, opacity: 0.45, depthWrite: false });
  const meshes: THREE.Mesh[] = [];
  view.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.material = ok;
      m.castShadow = false;
      meshes.push(m);
    }
  });
  return {
    group: view.group,
    setValid(v) {
      for (const m of meshes) m.material = v ? ok : bad;
    },
  };
}
