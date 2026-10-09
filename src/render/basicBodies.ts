import * as THREE from 'three';

/**
 * Bodies of the two basic towers, in the same hand-built style as the element
 * towers (towerBodies.ts):
 * - Bolt: a square stone watchtower topped by a timber platform; level 2 adds
 *   banners and iron corner caps, level 3 gold-tipped corner spires
 * - Mortar: a round stone bastion with battlements; level 2 adds iron bands
 *   and a banner, level 3 a gold rim and a stack of cannonballs
 * Materials are shared module-wide so every tower batches together.
 */
const flat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.88, metalness: 0.02, ...extra });

const M = {
  stone: flat(0x9a9286),
  stoneB: flat(0x857d71),
  stoneDark: flat(0x5f5850),
  wood: flat(0x7a5434),
  woodDark: flat(0x523823),
  iron: flat(0x3a3c42, { metalness: 0.55, roughness: 0.5 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd8a94c, metalness: 1, roughness: 0.32 }),
  bannerBlue: flat(0x2f5fa8, { side: THREE.DoubleSide }),
  bannerRed: flat(0xa83228, { side: THREE.DoubleSide }),
  floor: flat(0x4a4038),
  ball: flat(0x26272b, { metalness: 0.4, roughness: 0.5 }),
};

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** A hanging cloth banner with a pointed tail, facing +z. */
function banner(mat: THREE.Material, w: number, h: number): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, -h);
  s.lineTo(0, -h * 0.78);
  s.lineTo(-w / 2, -h);
  s.lineTo(-w / 2, 0);
  return new THREE.Mesh(new THREE.ShapeGeometry(s), mat);
}

export interface BasicBody {
  group: THREE.Group;
  /** where the head sits */
  topY: number;
}

/* ----------------------------------------------------------------- Bolt */

export function boltBody(L: number): BasicBody {
  const g = new THREE.Group();
  const r = rng(5 + L);
  g.add(mesh(new THREE.BoxGeometry(0.92, 0.12, 0.92), M.stoneDark, 0, 0.06, 0));
  // courses of cut stone, a little narrower toward the top, each block shaded on its own
  const courses = 2 + L;
  let y = 0.12;
  for (let i = 0; i < courses; i++) {
    const w = 0.66 - i * 0.03;
    const h = 0.2;
    // two blocks per side, offset every other course
    for (let k = 0; k < 4; k++) {
      const off = i % 2 ? 0.08 : -0.08;
      const blk = mesh(new THREE.BoxGeometry(w / 2 + 0.02, h - 0.02, w + 0.01), r() < 0.5 ? M.stone : M.stoneB, (k % 2 ? 1 : -1) * (w / 4) + (k > 1 ? off : -off) * 0.2, y + h / 2, 0);
      if (k > 1) blk.rotation.y = Math.PI / 2;
      g.add(blk);
    }
    y += h;
  }
  // the timber platform with corner posts and a low rail
  const pw = 0.82;
  g.add(mesh(new THREE.BoxGeometry(pw, 0.07, pw), M.wood, 0, y + 0.035, 0));
  for (let k = 0; k < 6; k++) g.add(mesh(new THREE.BoxGeometry(pw + 0.01, 0.012, 0.025), M.woodDark, 0, y + 0.072, -pw / 2 + 0.06 + k * ((pw - 0.12) / 5)));
  const postH = 0.28;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = (sx * (pw - 0.07)) / 2;
    const pz = (sz * (pw - 0.07)) / 2;
    g.add(mesh(new THREE.BoxGeometry(0.07, postH, 0.07), M.woodDark, px, y + 0.07 + postH / 2, pz));
    if (L >= 2) g.add(mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), M.iron, px, y + 0.07 + postH, pz));
    if (L >= 3) g.add(mesh(new THREE.ConeGeometry(0.05, 0.28, 4), M.gold, px, y + 0.07 + postH + 0.17, pz));
  }
  for (const [rx, rz, rot] of [[0, -1, 0], [0, 1, 0], [-1, 0, 1], [1, 0, 1]]) {
    const rail = mesh(new THREE.BoxGeometry(pw - 0.07, 0.035, 0.035), M.wood, (rx * (pw - 0.07)) / 2, y + 0.24, (rz * (pw - 0.07)) / 2);
    rail.rotation.y = rot ? Math.PI / 2 : 0;
    g.add(rail);
  }
  // level 2+: banners hanging from the platform on two sides
  if (L >= 2) {
    for (const side of [-1, 1]) {
      const b = banner(side < 0 ? M.bannerBlue : M.bannerRed, 0.22, 0.38 + L * 0.04);
      b.position.set(0, y - 0.01, side * (0.66 / 2 + 0.012));
      if (side < 0) b.rotation.y = Math.PI;
      g.add(b);
    }
  }
  return { group: g, topY: y + 0.08 };
}

/* --------------------------------------------------------------- Mortar */

export function mortarBody(L: number): BasicBody {
  const g = new THREE.Group();
  const R = 0.44 + L * 0.02;
  const H = 0.36 + L * 0.12;
  g.add(mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.1, 0.12, 12), M.stoneDark, 0, 0.06, 0));
  // the bastion wall in two tones, with a slight batter (wider at the foot)
  g.add(mesh(new THREE.CylinderGeometry(R, R + 0.04, H, 12), M.stone, 0, 0.12 + H / 2, 0));
  g.add(mesh(new THREE.CylinderGeometry(R + 0.045, R + 0.05, 0.06, 12), M.stoneB, 0, 0.12 + H * 0.35, 0));
  const top = 0.12 + H;
  // the floor inside the battlements
  g.add(mesh(new THREE.CylinderGeometry(R - 0.03, R - 0.03, 0.04, 12), M.floor, 0, top + 0.02, 0));
  // merlons around the rim
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const m = mesh(new THREE.BoxGeometry(0.16, 0.16, 0.1), i % 2 ? M.stone : M.stoneB, Math.sin(a) * (R - 0.02), top + 0.08, Math.cos(a) * (R - 0.02));
    m.rotation.y = a;
    g.add(m);
  }
  if (L >= 2) {
    for (const f of [0.15, 0.75]) {
      const band = mesh(new THREE.TorusGeometry(R + 0.03, 0.02, 4, 16), M.iron, 0, 0.12 + H * f, 0);
      band.rotation.x = Math.PI / 2;
      g.add(band);
    }
    // a banner pole on the rim
    g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 5), M.woodDark, -R * 0.7, top + 0.35, -R * 0.55));
    const b = banner(M.bannerRed, 0.24, 0.2);
    b.rotation.z = Math.PI / 2;
    b.position.set(-R * 0.7, top + 0.68, -R * 0.55);
    g.add(b);
  }
  if (L >= 3) {
    const rim = mesh(new THREE.TorusGeometry(R + 0.005, 0.022, 4, 20), M.gold, 0, top + 0.005, 0);
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    // a little pyramid of cannonballs on the foot
    const at = (x: number, y: number, z: number) => g.add(mesh(new THREE.SphereGeometry(0.055, 8, 6), M.ball, x, y, z));
    const bx = R * 0.85;
    at(bx, 0.17, 0.32);
    at(bx + 0.1, 0.17, 0.27);
    at(bx + 0.05, 0.25, 0.3);
  }
  return { group: g, topY: top + 0.02 };
}
