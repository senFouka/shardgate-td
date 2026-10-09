import * as THREE from 'three';
import type { ElementId } from '../data/elements';
import { Particles, rand } from './particles';
import { towerBody } from './towerBodies';
import type { TowerView } from './towers';
import { dynamic } from './bake';
import { TOWER_GLOW } from './towers';
import { animatedMaterial } from './towerBatch';

/**
 * The six element towers, our own designs: each has its own body
 * (towerBodies.ts: basalt forge, ice prisms, copper coils, standing stones,
 * root trunk, coral fountain) and a head that shows what it does:
 * Ember a burning brazier, Frost a crown of ice crystals, Gale a crackling
 * orb, Stone a floating boulder, Venom a bubbling cauldron, Tide a swirling
 * sphere of water. Higher levels are taller, carry more gold, and grow the
 * head (more flame, more crystals, more rings, more stones).
 */

const flat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.05, ...extra });

const GOLD = new THREE.MeshStandardMaterial({ color: 0xd8a94c, metalness: 1, roughness: 0.32 });
const BRONZE = flat(0x8a5a2c, { metalness: 0.7, roughness: 0.38 });
const ROCK = flat(0x6f655a, { roughness: 0.95 });

function shadows(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
}

/** The element's own body (towerBodies.ts) plus a head group sitting on top of it. */
function shell(el: ElementId, level: number): { g: THREE.Group; orn: { update(t: number): void; pulse(): void }; head: THREE.Group; muzzle: THREE.Object3D } {
  const g = new THREE.Group();
  const orn = towerBody(el, level);
  g.add(orn.group);
  const head = new THREE.Group();
  head.position.y = orn.topY + 0.02;
  g.add(head);
  const muzzle = new THREE.Object3D();
  head.add(muzzle);
  return { g, orn, head, muzzle };
}

export function createElementTower(el: ElementId, fx: Particles, level: number): TowerView {
  const L = Math.max(1, Math.min(3, level));
  switch (el) {
    case 'ember':
      return emberTower(fx, L);
    case 'frost':
      return frostTower(fx, L);
    case 'gale':
      return galeTower(fx, L);
    case 'stone':
      return stoneTower(fx, L);
    case 'venom':
      return venomTower(fx, L);
    case 'tide':
      return tideTower(fx, L);
  }
}

const wp = new THREE.Vector3();

/* ---------------------------------------------------------------- Ember */

/** Ember Brazier: a bronze fire bowl with a living flame; bigger flame per level. */
function emberTower(fx: Particles, L: number): TowerView {
  const { g, orn, head, muzzle } = shell('ember', L);
  const bowlProf = [
    new THREE.Vector2(0.06, 0), new THREE.Vector2(0.14, 0.02), new THREE.Vector2(0.27, 0.12),
    new THREE.Vector2(0.32 + L * 0.02, 0.24), new THREE.Vector2(0.3 + L * 0.02, 0.26), new THREE.Vector2(0.001, 0.2),
  ];
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlProf, 10), BRONZE);
  head.add(bowl);
  const coals = new THREE.Mesh(
    new THREE.CircleGeometry(0.27 + L * 0.02, 10),
    animatedMaterial(flat(0x3a1004, { emissive: new THREE.Color(1.6, 0.45, 0.08), emissiveIntensity: 1.4 })),
  );
  coals.rotation.x = -Math.PI / 2;
  coals.position.y = 0.21;
  head.add(coals);
  // gold claws holding the bowl, more with level
  const claws = 3 + L;
  for (let i = 0; i < claws; i++) {
    const a = (i / claws) * Math.PI * 2;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22 + L * 0.04, 4), GOLD);
    c.position.set(Math.sin(a) * (0.32 + L * 0.02), 0.3, Math.cos(a) * (0.32 + L * 0.02));
    c.rotation.order = 'YXZ';
    c.rotation.y = a;
    c.rotation.x = 0.45;
    head.add(c);
  }
  // the flame: nested glowing cones that flicker (HDR so they bloom)
  const flames: THREE.Mesh[] = [];
  const layers = [
    { r: 0.2, h: 0.55, c: new THREE.Color(1.1, 0.22, 0.02), o: 0.8 },
    { r: 0.13, h: 0.42, c: new THREE.Color(1.5, 0.55, 0.06), o: 0.85 },
    { r: 0.06, h: 0.26, c: new THREE.Color(1.8, 1.2, 0.4), o: 0.9 },
  ];
  for (const l of layers) {
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(l.r * (0.8 + L * 0.2), l.h * (0.8 + L * 0.2), 7, 1, true),
      new THREE.MeshBasicMaterial({ color: l.c, transparent: true, opacity: l.o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    m.position.y = 0.22 + (l.h * (0.8 + L * 0.2)) / 2;
    flames.push(m);
    head.add(dynamic(m));
  }
  muzzle.position.y = 0.55;
  shadows(bowl);
  let flare = 0;
  return {
    group: g,
    head,
    muzzle,
    aim() {
      /* the flame throws fire in any direction */
    },
    update(time, dt) {
      orn.update(time);
      flare = Math.max(0, flare - dt * 4);
      flames.forEach((f, i) => {
        const k = 1 + Math.sin(time * (9 + i * 3) + i) * 0.08 + flare * 0.5;
        f.scale.set(1 + Math.sin(time * 7 + i * 2) * 0.06, k, 1 + Math.cos(time * 8 + i) * 0.06);
        f.rotation.y = time * (1 + i);
      });
      (coals.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.3 + Math.sin(time * 5) * 0.25 + flare;
      if (Math.random() < dt * (10 + L * 6)) {
        muzzle.getWorldPosition(wp);
        fx.emit({ x: wp.x + rand(-0.12, 0.12), y: wp.y - 0.1, z: wp.z + rand(-0.12, 0.12), vy: rand(1, 1.8), vx: rand(-0.15, 0.15), vz: rand(-0.15, 0.15), size: rand(0.08, 0.15), sizeEnd: 0.02, r: 2.2, g: rand(0.5, 0.9), b: 0.1, life: rand(0.35, 0.6) });
      }
    },
    onFire() {
      flare = 1;
      orn.pulse();
      muzzle.getWorldPosition(wp);
      fx.emit({ x: wp.x, y: wp.y, z: wp.z, size: 0.7, sizeEnd: 0.2, r: 2.2, g: 0.8, b: 0.15, life: 0.15 });
    },
  };
}

/* ---------------------------------------------------------------- Frost */

/** Frost Spire: a slender spire crowned with ice crystals that slowly turn. */
function frostTower(fx: Particles, L: number): TowerView {
  const { g, orn, head, muzzle } = shell('frost', L);
  const ice = animatedMaterial(new THREE.MeshStandardMaterial({
    color: 0x5fb8f0, emissive: new THREE.Color(0.1, 0.45, 1.0), emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.1,
    transparent: true, opacity: 0.9, flatShading: true,
  }));
  const crown = dynamic(new THREE.Group());
  head.add(crown);
  const center = dynamic(new THREE.Mesh(new THREE.OctahedronGeometry(0.14 + L * 0.02, 0), ice));
  center.scale.y = 2.6;
  center.position.y = 0.42 + L * 0.04;
  crown.add(center);
  const n = 2 + L * 2;
  const spikes: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.07 + (i % 2) * 0.02, 0), ice);
    s.scale.y = 3 + (i % 2);
    s.position.set(Math.sin(a) * 0.17, 0.18 + (i % 2) * 0.06, Math.cos(a) * 0.17);
    s.rotation.order = 'YXZ';
    s.rotation.y = a;
    s.rotation.x = 0.5;
    spikes.push(s);
    crown.add(s);
  }
  // a frosty halo ring at level 2+
  let halo: THREE.Mesh | null = null;
  if (L >= 2) {
    halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.014, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.9, 1.8), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.y = 0.45;
    halo.rotation.x = Math.PI / 2;
    head.add(dynamic(halo));
  }
  muzzle.position.y = 0.6 + L * 0.06;
  shadows(crown);
  let flare = 0;
  return {
    group: g,
    head,
    muzzle,
    aim() {
      /* crystals fire from the tip */
    },
    update(time, dt) {
      orn.update(time);
      flare = Math.max(0, flare - dt * 4);
      crown.rotation.y = time * 0.5;
      center.position.y = 0.42 + L * 0.04 + Math.sin(time * 1.8) * 0.04;
      ice.emissiveIntensity = 0.5 + Math.sin(time * 2.4) * 0.1 + flare * 1.2;
      if (halo) {
        halo.rotation.z = time;
        halo.scale.setScalar(1 + Math.sin(time * 2) * 0.05 + flare * 0.3);
      }
      if (Math.random() < dt * (4 + L * 3)) {
        muzzle.getWorldPosition(wp);
        const a = Math.random() * Math.PI * 2;
        fx.emit({ x: wp.x + Math.cos(a) * 0.4, y: wp.y + rand(-0.2, 0.2), z: wp.z + Math.sin(a) * 0.4, vy: -0.25, vx: rand(-0.1, 0.1), size: rand(0.05, 0.09), r: 1.4, g: 2.2, b: 3, life: 1.2 });
      }
    },
    onFire() {
      flare = 1;
      orn.pulse();
    },
  };
}

/* ----------------------------------------------------------------- Gale */

/** Gale Orb: a storm sphere in gold halos (one more halo per level) that crackles. */
function galeTower(fx: Particles, L: number): TowerView {
  const { g, orn, head, muzzle } = shell('gale', L);
  head.position.y += 0.28;
  const orbMat = animatedMaterial(new THREE.MeshStandardMaterial({ color: 0x6a4cff, emissive: new THREE.Color(0.45, 0.4, 1.4), emissiveIntensity: 1, roughness: 0.15 }));
  const orb = dynamic(new THREE.Mesh(new THREE.SphereGeometry(0.15 + L * 0.025, 20, 14), orbMat));
  head.add(orb);
  const halos: THREE.Mesh[] = [];
  for (let i = 0; i < L; i++) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.25 + i * 0.07, 0.016, 6, 30), GOLD);
    halos.push(h);
    head.add(dynamic(h));
  }
  shadows(head);
  let flare = 0;
  return {
    group: g,
    head,
    muzzle,
    aim() {
      /* lightning leaves the orb in any direction */
    },
    update(time, dt) {
      orn.update(time);
      flare = Math.max(0, flare - dt * 6);
      halos.forEach((h, i) => {
        h.rotation.x = Math.PI / 2 + Math.sin(time * (1.1 + i * 0.4) + i) * 0.7;
        h.rotation.y = time * (1.4 + i * 0.5) * (i % 2 ? -1 : 1);
      });
      orb.position.y = Math.sin(time * 2.2) * 0.03;
      orb.scale.setScalar(1 + flare * 0.35 + Math.sin(time * 13) * 0.02);
      orbMat.emissiveIntensity = 0.95 + Math.sin(time * 3) * 0.15 + flare * 1.6;
      // little sparks jumping off the orb
      if (Math.random() < dt * (5 + L * 4)) {
        orb.getWorldPosition(wp);
        const a = Math.random() * Math.PI * 2;
        const r = 0.2 + Math.random() * 0.2;
        for (let k = 0; k < 4; k++) {
          const f = k / 3;
          fx.emit({ x: wp.x + Math.cos(a) * r * f + rand(-0.03, 0.03), y: wp.y + rand(-0.15, 0.15) * f, z: wp.z + Math.sin(a) * r * f + rand(-0.03, 0.03), size: 0.06, r: 1.8, g: 2, b: 3.4, life: 0.09 });
        }
      }
    },
    onFire() {
      flare = 1;
      orn.pulse();
    },
  };
}

/* ---------------------------------------------------------------- Stone */

/** Stone Monolith: a rune-cut boulder hovering over a squat drum, with orbiting stones. */
function stoneTower(fx: Particles, L: number): TowerView {
  const { g, orn, head, muzzle } = shell('stone', L);
  const geo = new THREE.DodecahedronGeometry(0.24 + L * 0.03, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + Math.sin(i * 12.9898) * 0.08;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 1.15, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const boulder = dynamic(new THREE.Mesh(geo, ROCK));
  boulder.position.y = 0.45;
  head.add(boulder);
  const runeMat = animatedMaterial(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.6, 0.5) }));
  const runes: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.02), runeMat);
    const a = (i / 3) * Math.PI * 2;
    const rr = 0.26 + L * 0.03;
    r.position.set(Math.sin(a) * rr, 0, Math.cos(a) * rr);
    r.rotation.y = a;
    boulder.add(r);
    runes.push(r);
  }
  const pebbleRing = dynamic(new THREE.Group());
  for (let i = 0; i < 1 + L; i++) {
    const a = (i / (1 + L)) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06 + (i % 2) * 0.02, 0), ROCK);
    p.position.set(Math.cos(a) * 0.44, 0.35 + Math.sin(i * 1.9) * 0.08, Math.sin(a) * 0.44);
    p.rotation.set(i, i * 0.7, 0);
    pebbleRing.add(p);
  }
  head.add(pebbleRing);
  // gold brackets reaching up to the boulder
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), GOLD);
    b.position.set(Math.sin(a) * 0.26, 0.12, Math.cos(a) * 0.26);
    b.rotation.order = 'YXZ';
    b.rotation.y = a;
    b.rotation.x = -0.35;
    head.add(b);
  }
  muzzle.position.y = 0.45;
  shadows(head);
  let dip = 0;
  return {
    group: g,
    head,
    muzzle,
    aim() {
      /* the boulder hurls stones in any direction */
    },
    update(time, dt) {
      orn.update(time);
      dip = Math.max(0, dip - dt * 3);
      boulder.position.y = 0.45 + Math.sin(time * 1.4) * 0.05 - dip * 0.12;
      boulder.rotation.y = time * 0.4;
      runeMat.color.setRGB((2.2 + dip * 2) * TOWER_GLOW, (1.3 + dip) * TOWER_GLOW, 0.4 * TOWER_GLOW);
      pebbleRing.rotation.y = -time * 1.1;
      pebbleRing.position.y = Math.sin(time * 2) * 0.05;
    },
    onFire() {
      dip = 1;
      orn.pulse();
      muzzle.getWorldPosition(wp);
      for (let i = 0; i < 6; i++) fx.emit({ x: wp.x + rand(-0.2, 0.2), y: wp.y - 0.2, z: wp.z + rand(-0.2, 0.2), vy: rand(-0.6, -0.2), size: 0.08, r: 2, g: 1.3, b: 0.5, life: 0.3 });
    },
  };
}

/* ---------------------------------------------------------------- Venom */

/** Venom Font: an iron cauldron of glowing poison between thorns; bubbles rise from it. */
function venomTower(fx: Particles, L: number): TowerView {
  const { g, orn, head, muzzle } = shell('venom', L);
  const prof = [
    new THREE.Vector2(0.001, 0), new THREE.Vector2(0.16, 0.01), new THREE.Vector2(0.28, 0.1),
    new THREE.Vector2(0.3, 0.22), new THREE.Vector2(0.25, 0.32), new THREE.Vector2(0.28, 0.35), new THREE.Vector2(0.24, 0.36), new THREE.Vector2(0.001, 0.3),
  ];
  // a hollow, gnarled seed pod grown out of the trunk
  const pot = new THREE.Mesh(new THREE.LatheGeometry(prof, 9), flat(0x5a3f2c, { roughness: 0.9 }));
  head.add(pot);
  const brew = new THREE.Mesh(new THREE.CircleGeometry(0.24, 14), animatedMaterial(new THREE.MeshStandardMaterial({ color: 0x3a8a10, emissive: new THREE.Color(0.7, 2.0, 0.2), emissiveIntensity: 1.2, roughness: 0.2 })));
  brew.rotation.x = -Math.PI / 2;
  brew.position.y = 0.32;
  head.add(dynamic(brew));
  // thorns curling up around the cauldron (more with level)
  const thornMat = flat(0x24401a, { roughness: 0.7 });
  const n = 3 + L * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3 + (i % 2) * 0.12, 5), i % 3 === 0 && L >= 2 ? GOLD : thornMat);
    t.position.set(Math.sin(a) * 0.33, 0.2, Math.cos(a) * 0.33);
    t.rotation.order = 'YXZ';
    t.rotation.y = a;
    t.rotation.x = 0.55;
    head.add(t);
  }
  muzzle.position.y = 0.4;
  shadows(pot);
  let flare = 0;
  return {
    group: g,
    head,
    muzzle,
    aim() {
      /* the brew spits in any direction */
    },
    update(time, dt) {
      orn.update(time);
      flare = Math.max(0, flare - dt * 4);
      (brew.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.1 + Math.sin(time * 3.3) * 0.2 + flare * 1.5;
      brew.position.y = 0.32 + Math.sin(time * 2.5) * 0.01;
      if (Math.random() < dt * (6 + L * 4)) {
        brew.getWorldPosition(wp);
        fx.emit({ x: wp.x + rand(-0.2, 0.2), y: wp.y, z: wp.z + rand(-0.2, 0.2), vy: rand(0.3, 0.7), size: rand(0.06, 0.12), sizeEnd: 0.14, r: 0.8, g: 2.4, b: 0.3, life: rand(0.5, 0.9), alpha: 0.9 });
      }
    },
    onFire() {
      flare = 1;
      orn.pulse();
    },
  };
}

/* ----------------------------------------------------------------- Tide */

/** Tide Well: a floating sphere of water inside spinning rings, dripping into the crown. */
function tideTower(fx: Particles, L: number): TowerView {
  const { g, orn, head, muzzle } = shell('tide', L);
  head.position.y += 0.3;
  const water = animatedMaterial(new THREE.MeshStandardMaterial({
    color: 0x2aa8d8, emissive: new THREE.Color(0.15, 0.9, 1.3), emissiveIntensity: 1.0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85,
  }));
  const sphere = dynamic(new THREE.Mesh(new THREE.IcosahedronGeometry(0.17 + L * 0.03, 2), water));
  head.add(sphere);
  const rings: THREE.Mesh[] = [];
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.2, 2.8), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 1 + L; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.26 + i * 0.06, 0.02, 6, 30), i === 0 ? GOLD : ringMat);
    rings.push(r);
    head.add(dynamic(r));
  }
  shadows(sphere);
  let flare = 0;
  return {
    group: g,
    head,
    muzzle,
    aim() {
      /* the well lobs water in any direction */
    },
    update(time, dt) {
      orn.update(time);
      flare = Math.max(0, flare - dt * 3);
      const wob = Math.sin(time * 3) * 0.05;
      sphere.scale.set(1 + wob + flare * 0.3, 1 - wob + flare * 0.3, 1 + wob + flare * 0.3);
      sphere.position.y = Math.sin(time * 1.6) * 0.04;
      sphere.rotation.y = time * 0.8;
      water.emissiveIntensity = 0.95 + Math.sin(time * 2) * 0.15 + flare;
      rings.forEach((r, i) => {
        r.rotation.x = Math.PI / 2 + Math.sin(time * 0.9 + i * 1.7) * 0.4;
        r.rotation.z = time * (0.8 + i * 0.35) * (i % 2 ? -1 : 1);
      });
      if (Math.random() < dt * (4 + L * 3)) {
        sphere.getWorldPosition(wp);
        fx.emit({ x: wp.x + rand(-0.12, 0.12), y: wp.y - 0.15, z: wp.z + rand(-0.12, 0.12), vy: -0.4, size: rand(0.05, 0.08), r: 0.6, g: 1.8, b: 2.6, life: 0.6, gravity: 3 });
      }
    },
    onFire() {
      flare = 1;
      orn.pulse();
    },
  };
}
