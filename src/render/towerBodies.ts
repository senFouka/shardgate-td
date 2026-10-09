import * as THREE from 'three';
import type { ElementId } from '../data/elements';

/**
 * The body of each element tower: its own silhouette and materials, so every
 * element reads from far away by shape, not only by colour.
 * - Ember: a forge of black basalt chunks with glowing lava seams
 * - Frost: a cluster of tall ice prisms on snowy stone
 * - Gale: a slender iron tower wound with copper coils and lightning rods
 * - Stone: rough standing stones in a ring with amber runes
 * - Venom: a twisted root trunk with spreading roots, mushrooms and thorns
 * - Tide: a sandstone fountain basin with coral and shells
 * Higher levels are taller and add a feature (more chunks, prisms, coils,
 * stones, mushrooms, coral). Glowing parts share one material per element
 * that pulses for every tower at once, so the towers still batch together.
 */
export interface TowerBody {
  group: THREE.Group;
  /** where the head sits */
  topY: number;
  update(time: number): void;
  pulse(): void;
}

const flat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.88, metalness: 0.02, ...extra });

const M = {
  basalt: flat(0x2e2926),
  basaltLight: flat(0x45403a),
  lava: flat(0x3a0e02, { emissive: new THREE.Color(2.2, 0.55, 0.06), emissiveIntensity: 1.2, roughness: 0.6 }),
  iron: flat(0x34363c, { metalness: 0.55, roughness: 0.5 }),
  snow: flat(0xeef4fa, { roughness: 0.95 }),
  paleStone: flat(0x9fa6ad),
  ice: new THREE.MeshStandardMaterial({ color: 0x8fd4f5, emissive: new THREE.Color(0.08, 0.35, 0.6), emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.05, flatShading: true, transparent: true, opacity: 0.9 }),
  iceDeep: flat(0x3f86c0, { roughness: 0.2, emissive: new THREE.Color(0.05, 0.2, 0.45), emissiveIntensity: 0.6 }),
  slate: flat(0x3c3f4a),
  slateLight: flat(0x585c6a),
  copper: flat(0xc0703a, { metalness: 0.85, roughness: 0.32 }),
  spark: flat(0x2a2050, { emissive: new THREE.Color(1.1, 0.8, 2.2), emissiveIntensity: 1, roughness: 0.3 }),
  granite: flat(0x8b8174),
  graniteDark: flat(0x645b51),
  moss: flat(0x5d7a34),
  rune: flat(0x3a2a10, { emissive: new THREE.Color(2.0, 1.25, 0.35), emissiveIntensity: 1, roughness: 0.5 }),
  bark: flat(0x4a3428),
  barkDark: flat(0x33241c),
  capPurple: flat(0x7a3ea0),
  capSpot: flat(0xe8d8f0),
  thorn: flat(0x2a3a1c),
  venomGlow: flat(0x1c3a08, { emissive: new THREE.Color(0.7, 2.0, 0.2), emissiveIntensity: 1, roughness: 0.4 }),
  sand: flat(0xd3bd8a),
  sandDark: flat(0xb39a68),
  tile: flat(0x2f8ea0, { roughness: 0.5 }),
  coral: flat(0xf07a6a),
  coralB: flat(0xf2a24a),
  shell: flat(0xf3e2d0),
  gold: new THREE.MeshStandardMaterial({ color: 0xd8a94c, metalness: 1, roughness: 0.32 }),
};

/** Seeded random for stable shapes. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** A rough rock: a low-poly solid with its corners pushed in and out. */
function rough(geo: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const r = rng(seed);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const moved = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = moved.get(key);
    if (!d) moved.set(key, (d = new THREE.Vector3((r() - 0.5) * amount, (r() - 0.5) * amount, (r() - 0.5) * amount)));
    pos.setXYZ(i, pos.getX(i) + d.x, pos.getY(i) + d.y, pos.getZ(i) + d.z);
  }
  g.computeVertexNormals();
  return g;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** A low hexagonal foot every tower stands on. */
function foot(top: THREE.Material, side: THREE.Material, r = 0.5): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(r, r + 0.05, 0.12, 6), side, 0, 0.06, 0));
  g.add(mesh(new THREE.CylinderGeometry(r - 0.06, r - 0.02, 0.08, 6), top, 0, 0.16, 0));
  return g;
}

/* ---------------------------------------------------------------- Ember */

function emberBody(L: number): TowerBody {
  const g = new THREE.Group();
  const r = rng(11 + L);
  g.add(foot(M.basaltLight, M.basalt, 0.52));
  // stacked basalt chunks, each a little smaller, glowing seams between them
  let y = 0.2;
  const chunks = 2 + L;
  for (let i = 0; i < chunks; i++) {
    const rad = 0.42 - i * 0.045;
    const h = 0.32 + r() * 0.08;
    const chunk = mesh(rough(new THREE.CylinderGeometry(rad * 0.92, rad, h, 7), 0.08, 40 + i + L * 10), i % 2 ? M.basaltLight : M.basalt, 0, y + h / 2, 0);
    chunk.rotation.y = r() * 6;
    g.add(chunk);
    // a lava seam: a thin glowing ring just under the next chunk
    const seam = mesh(new THREE.CylinderGeometry(rad * 0.86, rad * 0.9, 0.05, 7), M.lava, 0, y + h + 0.01, 0);
    g.add(seam);
    y += h + 0.04;
  }
  // lava trickles down the sides
  for (let i = 0; i < 2 + L; i++) {
    const a = (i / (2 + L)) * Math.PI * 2 + 0.4;
    const len = 0.35 + r() * 0.4;
    const drip = mesh(new THREE.BoxGeometry(0.05, len, 0.03), M.lava, Math.sin(a) * 0.38, 0.25 + len / 2 + r() * 0.3, Math.cos(a) * 0.38);
    drip.rotation.y = a;
    g.add(drip);
  }
  // level 2: iron bands; level 3: basalt horns
  if (L >= 2) {
    for (const f of [0.35, 0.7]) {
      const band = mesh(new THREE.TorusGeometry(0.37 - f * 0.08, 0.035, 5, 10), M.iron, 0, y * f, 0);
      band.rotation.x = Math.PI / 2;
      g.add(band);
    }
  }
  if (L >= 3) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const horn = mesh(rough(new THREE.ConeGeometry(0.09, 0.55, 5), 0.03, 70 + i), M.basalt, Math.sin(a) * 0.3, y + 0.1, Math.cos(a) * 0.3);
      horn.rotation.order = 'YXZ';
      horn.rotation.y = a;
      horn.rotation.x = 0.5;
      g.add(horn);
    }
  }
  return {
    group: g,
    topY: y,
    update(t) {
      M.lava.emissiveIntensity = 1.0 + Math.sin(t * 2.3) * 0.25;
    },
    pulse() {},
  };
}

/* ---------------------------------------------------------------- Frost */

function frostBody(L: number): TowerBody {
  const g = new THREE.Group();
  const r = rng(21 + L);
  g.add(foot(M.snow, M.paleStone, 0.52));
  // snow drifts on the foot
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    const drift = mesh(new THREE.SphereGeometry(0.16, 7, 5), M.snow, Math.sin(a) * 0.36, 0.2, Math.cos(a) * 0.36);
    drift.scale.set(1.3, 0.45, 1);
    g.add(drift);
  }
  // the central prism and a ring of smaller ones leaning out
  const H = 0.95 + L * 0.3;
  const prism = (h: number, rad: number, mat: THREE.Material) => {
    const p = new THREE.Group();
    p.add(mesh(new THREE.CylinderGeometry(rad, rad * 1.05, h, 6), mat, 0, h / 2, 0));
    p.add(mesh(new THREE.ConeGeometry(rad, rad * 2.2, 6), mat, 0, h + rad * 1.1, 0));
    return p;
  };
  const core = prism(H, 0.17, M.iceDeep);
  core.position.y = 0.2;
  g.add(core);
  const n = 3 + L;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3;
    const h = H * (0.45 + r() * 0.35);
    const p = prism(h, 0.09 + r() * 0.04, M.ice);
    p.position.set(Math.sin(a) * 0.22, 0.2, Math.cos(a) * 0.22);
    p.rotation.order = 'YXZ';
    p.rotation.y = a;
    p.rotation.x = 0.22 + r() * 0.15;
    g.add(p);
  }
  return { group: g, topY: 0.2 + H + 0.05, update() {}, pulse() {} };
}

/* ----------------------------------------------------------------- Gale */

function galeBody(L: number): TowerBody {
  const g = new THREE.Group();
  g.add(foot(M.slateLight, M.slate, 0.5));
  const H = 0.95 + L * 0.28;
  // a slender iron-banded shaft
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.24, H, 8), M.slate, 0, 0.2 + H / 2, 0));
  // copper coils wound around it
  const coils = 3 + L * 2;
  for (let i = 0; i < coils; i++) {
    const f = (i + 0.5) / coils;
    const rad = 0.24 - f * 0.08;
    const coil = mesh(new THREE.TorusGeometry(rad, 0.035, 6, 14), M.copper, 0, 0.25 + f * (H - 0.15), 0);
    coil.rotation.x = Math.PI / 2;
    coil.rotation.y = (i % 2 ? 0.12 : -0.12);
    g.add(coil);
  }
  // lightning rods: three iron spikes leaning out from the top, glowing tips
  const rods = 2 + L;
  for (let i = 0; i < rods; i++) {
    const a = (i / rods) * Math.PI * 2;
    const rod = new THREE.Group();
    rod.add(mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.6, 5), M.iron, 0, 0.3, 0));
    rod.add(mesh(new THREE.OctahedronGeometry(0.05, 0), M.spark, 0, 0.62, 0));
    rod.position.set(Math.sin(a) * 0.12, 0.2 + H - 0.1, Math.cos(a) * 0.12);
    rod.rotation.order = 'YXZ';
    rod.rotation.y = a;
    rod.rotation.x = 0.55;
    g.add(rod);
  }
  return {
    group: g,
    topY: 0.2 + H,
    update(t) {
      M.spark.emissiveIntensity = 0.9 + Math.max(0, Math.sin(t * 9) * Math.sin(t * 3.1)) * 1.2;
    },
    pulse() {},
  };
}

/* ---------------------------------------------------------------- Stone */

function stoneBody(L: number): TowerBody {
  const g = new THREE.Group();
  const r = rng(31 + L);
  g.add(foot(M.moss, M.graniteDark, 0.54));
  // a ring of rough standing stones leaning slightly in
  const n = 2 + L;
  const H = 0.85 + L * 0.22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const h = H * (0.85 + r() * 0.3);
    // tall, narrow menhirs standing well apart, leaning out a little
    const slab = mesh(rough(new THREE.BoxGeometry(0.17, h, 0.13, 1, 3, 1), 0.04, 90 + i + L * 7), i % 2 ? M.granite : M.graniteDark, Math.sin(a) * 0.37, 0.2 + h / 2, Math.cos(a) * 0.37);
    slab.rotation.order = 'YXZ';
    slab.rotation.y = a;
    slab.rotation.x = 0.1;
    g.add(slab);
    // moss at its foot and a glowing rune on the outer face
    g.add(mesh(new THREE.SphereGeometry(0.1, 6, 4), M.moss, Math.sin(a) * 0.38, 0.2, Math.cos(a) * 0.38));
    const rune = mesh(new THREE.BoxGeometry(0.06, 0.18, 0.02), M.rune, Math.sin(a) * 0.45, 0.2 + h * 0.55, Math.cos(a) * 0.45);
    rune.rotation.y = a;
    g.add(rune);
  }
  // a low altar in the middle, under the floating boulder
  g.add(mesh(rough(new THREE.CylinderGeometry(0.17, 0.22, 0.24, 6), 0.04, 99), M.granite, 0, 0.32, 0));
  // level 3: lintels across the stones (a small henge)
  if (L >= 3) {
    for (let i = 0; i < n; i += 2) {
      const a = ((i + 0.5) / n) * Math.PI * 2 + 0.3;
      const lintel = mesh(new THREE.BoxGeometry(0.42, 0.1, 0.16), M.graniteDark, Math.sin(a) * 0.3, 0.2 + H + 0.05, Math.cos(a) * 0.3);
      lintel.rotation.y = a + Math.PI / 2;
      g.add(lintel);
    }
  }
  return {
    group: g,
    topY: 0.3 + H * 0.5,
    update(t) {
      M.rune.emissiveIntensity = 0.85 + Math.sin(t * 1.6) * 0.2;
    },
    pulse() {},
  };
}

/* ---------------------------------------------------------------- Venom */

function venomBody(L: number): TowerBody {
  const g = new THREE.Group();
  const r = rng(41 + L);
  g.add(foot(M.moss, M.barkDark, 0.5));
  // roots spreading over the foot
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r() * 0.4;
    const root = mesh(new THREE.ConeGeometry(0.07, 0.6, 5), M.barkDark, Math.sin(a) * 0.28, 0.2, Math.cos(a) * 0.28);
    root.rotation.order = 'YXZ';
    root.rotation.y = a;
    root.rotation.x = Math.PI / 2 - 0.25;
    g.add(root);
  }
  // a twisted trunk: short segments, each turned and shifted
  const segs = 3 + L;
  let y = 0.18;
  for (let i = 0; i < segs; i++) {
    const h = 0.26;
    const rad = 0.24 - i * 0.022;
    const seg = mesh(new THREE.CylinderGeometry(rad * 0.9, rad, h + 0.04, 7), i % 2 ? M.bark : M.barkDark, Math.sin(i * 1.3) * 0.04, y + h / 2, Math.cos(i * 1.7) * 0.04);
    seg.rotation.y = i * 0.7;
    seg.rotation.z = Math.sin(i * 2.1) * 0.08;
    g.add(seg);
    y += h;
  }
  // mushrooms on the trunk, more with level
  for (let i = 0; i < 1 + L; i++) {
    const a = r() * Math.PI * 2;
    const my = 0.35 + r() * (y - 0.5);
    const cap = mesh(new THREE.SphereGeometry(0.11 + r() * 0.05, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.capPurple, Math.sin(a) * 0.22, my, Math.cos(a) * 0.22);
    cap.rotation.order = 'YXZ';
    cap.rotation.y = a;
    cap.rotation.x = 0.35;
    g.add(cap);
    g.add(mesh(new THREE.SphereGeometry(0.025, 5, 4), M.capSpot, Math.sin(a) * 0.25, my + 0.08, Math.cos(a) * 0.25));
  }
  // thorns
  for (let i = 0; i < 4 + L * 2; i++) {
    const a = r() * Math.PI * 2;
    const ty = 0.3 + r() * (y - 0.4);
    const th = mesh(new THREE.ConeGeometry(0.025, 0.16, 4), M.thorn, Math.sin(a) * 0.2, ty, Math.cos(a) * 0.2);
    th.rotation.order = 'YXZ';
    th.rotation.y = a;
    th.rotation.x = Math.PI / 2 - 0.3;
    g.add(th);
  }
  // glowing sap in a crack
  g.add(mesh(new THREE.BoxGeometry(0.05, y * 0.5, 0.03), M.venomGlow, 0, y * 0.45, 0.2));
  return {
    group: g,
    topY: y - 0.02,
    update(t) {
      M.venomGlow.emissiveIntensity = 0.85 + Math.sin(t * 2.7) * 0.25;
    },
    pulse() {},
  };
}

/* ----------------------------------------------------------------- Tide */

function tideBody(L: number): TowerBody {
  const g = new THREE.Group();
  const r = rng(51 + L);
  g.add(foot(M.sand, M.sandDark, 0.52));
  const H = 0.55 + L * 0.2;
  // a fluted sandstone pedestal with a ring of blue tiles
  g.add(mesh(new THREE.CylinderGeometry(0.17, 0.28, H, 10), M.sand, 0, 0.2 + H / 2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.235, 0.255, 0.08, 10), M.tile, 0, 0.2 + H * 0.35, 0));
  // the basin
  const prof = [new THREE.Vector2(0.12, 0), new THREE.Vector2(0.36, 0.1), new THREE.Vector2(0.44, 0.24), new THREE.Vector2(0.4, 0.26), new THREE.Vector2(0.001, 0.14)];
  g.add(mesh(new THREE.LatheGeometry(prof, 12), M.sandDark, 0, 0.2 + H, 0));
  g.add(mesh(new THREE.CircleGeometry(0.38, 12).rotateX(-Math.PI / 2), M.tile, 0, 0.2 + H + 0.2, 0));
  // coral growing up around the pedestal
  const corals = 2 + L;
  for (let i = 0; i < corals; i++) {
    const a = (i / corals) * Math.PI * 2 + r() * 0.5;
    const c = new THREE.Group();
    const mat = i % 2 ? M.coral : M.coralB;
    c.add(mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.4, 5), mat, 0, 0.2, 0));
    for (const s of [-1, 1]) {
      const br = mesh(new THREE.CylinderGeometry(0.022, 0.032, 0.22, 5), mat, s * 0.05, 0.32, 0);
      br.rotation.z = -s * 0.7;
      c.add(br);
    }
    c.position.set(Math.sin(a) * 0.33, 0.18, Math.cos(a) * 0.33);
    c.rotation.y = a;
    g.add(c);
  }
  // shells at the foot
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 1;
    const sh = mesh(new THREE.ConeGeometry(0.07, 0.12, 6), M.shell, Math.sin(a) * 0.42, 0.21, Math.cos(a) * 0.42);
    sh.rotation.x = Math.PI / 2;
    sh.rotation.z = a;
    g.add(sh);
  }
  return { group: g, topY: 0.2 + H + 0.1, update() {}, pulse() {} };
}

const BUILDERS: Record<ElementId, (L: number) => TowerBody> = {
  ember: emberBody,
  frost: frostBody,
  gale: galeBody,
  stone: stoneBody,
  venom: venomBody,
  tide: tideBody,
};

export function towerBody(el: ElementId, level: number): TowerBody {
  const body = BUILDERS[el](Math.max(1, Math.min(3, level)));
  body.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return body;
}
