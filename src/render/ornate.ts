import * as THREE from 'three';
import { dynamic } from './bake';

/**
 * Ornate fantasy towers, built in code. Our own design language for the
 * game's towers: a tall pale-stone body (hourglass or drum) on a stepped
 * octagonal plinth, gold trim bands and pointed gold arches over coloured
 * panels, inset glowing gems, a gold crown of curved blades, and a glowing
 * core on top that shows what the tower does. Higher tiers are taller and
 * carry more gold, more gems, more blades and orbiting shards.
 */
export interface OrnateSpec {
  /** panel colour (the tower's element/identity) */
  panel: number;
  /** gem and glow colour (linear, may exceed 1 for bloom) */
  glow: THREE.Color;
  /** 1..3 */
  tier: number;
  /** body silhouette */
  shape: 'hourglass' | 'drum';
}

export interface Ornate {
  group: THREE.Group;
  /** the height where the crown sits (put the tower's head here) */
  topY: number;
  /** body radius at the crown */
  topRadius: number;
  /** animates gems, shards and blades; call every frame */
  update(time: number): void;
  /** brief flare when the tower fires */
  pulse(): void;
}

/* ---------------------------------------------------------------- materials */

const GOLD = new THREE.MeshStandardMaterial({ color: 0xd8a94c, metalness: 1, roughness: 0.32 });
const GOLD_DARK = new THREE.MeshStandardMaterial({ color: 0x9c7230, metalness: 1, roughness: 0.4 });
const STONE = new THREE.MeshStandardMaterial({ color: 0xb4aea2, roughness: 0.85, flatShading: true });
const STONE_DARK = new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 0.9, flatShading: true });

const bodyTextures = new Map<string, THREE.CanvasTexture>();

/**
 * The body's colour map, wrapped once around the lathe: pale stone blocks,
 * with a coloured panel band carrying gold pointed arches, one per face.
 */
function bodyTexture(panel: number, faces: number, bandFrom: number, bandTo: number): THREE.CanvasTexture {
  const key = `${panel}:${faces}:${bandFrom}:${bandTo}`;
  const cached = bodyTextures.get(key);
  if (cached) return cached;
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  let seed = panel % 9973;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  // stone blocks (v = 0 at the bottom of the body, canvas y flipped)
  g.fillStyle = '#a9a397';
  g.fillRect(0, 0, W, H);
  const rows = 14;
  for (let r = 0; r < rows; r++) {
    const y = (r / rows) * H;
    const h = H / rows;
    let x = (r % 2) * -30;
    while (x < W) {
      const w = 50 + rnd() * 40;
      const v = 160 + Math.floor(rnd() * 30);
      g.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
      x += w;
    }
    g.fillStyle = 'rgba(80,72,60,0.35)';
    g.fillRect(0, y, W, 2);
  }

  // the coloured panel band with gold arches
  const col = new THREE.Color(panel);
  const css = `rgb(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)})`;
  const y0 = H * (1 - bandTo);
  const y1 = H * (1 - bandFrom);
  g.fillStyle = css;
  g.fillRect(0, y0, W, y1 - y0);
  // darker swirl ornament on the panel
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 3;
  const faceW = W / faces;
  for (let f = 0; f < faces; f++) {
    const cx = f * faceW + faceW / 2;
    g.beginPath();
    g.moveTo(cx - faceW * 0.3, y1 - 12);
    g.bezierCurveTo(cx - faceW * 0.1, y0 + (y1 - y0) * 0.3, cx + faceW * 0.1, y0 + (y1 - y0) * 0.7, cx + faceW * 0.3, y0 + 16);
    g.stroke();
  }
  // gold pointed arches
  g.strokeStyle = '#e2b65a';
  g.lineWidth = 7;
  for (let f = 0; f < faces; f++) {
    const x0 = f * faceW + faceW * 0.12;
    const x1 = f * faceW + faceW * 0.88;
    const mid = (x0 + x1) / 2;
    g.beginPath();
    g.moveTo(x0, y1);
    g.lineTo(x0, y0 + (y1 - y0) * 0.45);
    g.quadraticCurveTo(x0, y0 + 6, mid, y0 + 4);
    g.quadraticCurveTo(x1, y0 + 6, x1, y0 + (y1 - y0) * 0.45);
    g.lineTo(x1, y1);
    g.stroke();
  }
  g.fillStyle = '#e2b65a';
  g.fillRect(0, y0 - 6, W, 8);
  g.fillRect(0, y1 - 2, W, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  bodyTextures.set(key, tex);
  return tex;
}

/* ------------------------------------------------------------- pieces */

/** A curved gold blade for the crown: a crescent outline, extruded thin. */
let bladeGeo: THREE.ExtrudeGeometry | null = null;
function blade(): THREE.ExtrudeGeometry {
  if (bladeGeo) return bladeGeo;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.22, 0.25, 0.1, 0.62);
  s.quadraticCurveTo(0.06, 0.32, -0.08, 0.08);
  s.lineTo(0, 0);
  bladeGeo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 6 });
  bladeGeo.translate(0, 0, -0.015);
  return bladeGeo;
}

/** A gold fin standing against the base flare. */
let finGeo: THREE.ExtrudeGeometry | null = null;
function fin(): THREE.ExtrudeGeometry {
  if (finGeo) return finGeo;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.16, 0);
  s.quadraticCurveTo(0.05, 0.12, 0.02, 0.42);
  s.lineTo(-0.02, 0.42);
  s.lineTo(0, 0);
  finGeo = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
  finGeo.translate(0, 0, -0.025);
  return finGeo;
}

function ring(radius: number, y: number, tube: number, mat: THREE.Material, sides = 8): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 5, sides), mat);
  m.rotation.x = Math.PI / 2;
  m.rotation.z = Math.PI / sides;
  m.position.y = y;
  return m;
}

const gemMats = new Map<string, THREE.MeshStandardMaterial>();

/** One gem material per glow colour, shared by every tower that uses it. */
function gemMaterial(glow: THREE.Color): THREE.MeshStandardMaterial {
  const key = glow.getHexString() + glow.r.toFixed(3) + glow.g.toFixed(3) + glow.b.toFixed(3);
  let m = gemMats.get(key);
  if (!m) gemMats.set(key, (m = new THREE.MeshStandardMaterial({ color: glow.clone().multiplyScalar(0.35), emissive: glow, emissiveIntensity: 1.1, roughness: 0.2, flatShading: true })));
  return m;
}

/* -------------------------------------------------------------- builder */

export function buildOrnate(spec: OrnateSpec): Ornate {
  const t = Math.max(1, Math.min(3, spec.tier));
  const g = new THREE.Group();
  const FACES = 8;
  const gemMat = gemMaterial(spec.glow);

  // stepped octagonal plinth with front stairs
  const plinthR = 0.46 + t * 0.02;
  const p1 = new THREE.Mesh(new THREE.CylinderGeometry(plinthR, plinthR + 0.04, 0.1, FACES), STONE_DARK);
  p1.position.y = 0.05;
  const p2 = new THREE.Mesh(new THREE.CylinderGeometry(plinthR - 0.07, plinthR - 0.04, 0.09, FACES), STONE);
  p2.position.y = 0.145;
  g.add(p1, p2);
  for (let i = 0; i < 2; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.08), STONE);
    step.position.set(0, 0.025 + i * 0.05, plinthR + 0.02 - i * 0.06);
    g.add(step);
  }

  // the body: an octagonal lathe, hourglass or drum
  const H = spec.shape === 'drum' ? 0.62 + t * 0.12 : 0.95 + t * 0.28;
  const base = 0.19;
  const rb = spec.shape === 'drum' ? 0.36 : 0.34;
  const rw = spec.shape === 'drum' ? 0.32 : 0.2;
  const rt = spec.shape === 'drum' ? 0.34 : 0.27;
  const prof: THREE.Vector2[] = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(rb, 0),
    new THREE.Vector2(rb * 0.97, H * 0.12),
    new THREE.Vector2((rb + rw) / 2, H * 0.32),
    new THREE.Vector2(rw, H * 0.58),
    new THREE.Vector2((rw + rt) / 2, H * 0.8),
    new THREE.Vector2(rt, H * 0.95),
    new THREE.Vector2(rt * 1.08, H),
    new THREE.Vector2(0.001, H),
  ];
  const bandFrom = 0.12;
  const bandTo = spec.shape === 'drum' ? 0.62 : 0.42;
  const bodyMat = new THREE.MeshStandardMaterial({ map: bodyTexture(spec.panel, FACES, bandFrom, bandTo), roughness: 0.85, flatShading: true });
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, FACES), bodyMat);
  body.rotation.y = Math.PI / FACES;
  body.position.y = base;
  g.add(body);
  const radiusAt = (frac: number) => {
    // radius of the profile at a height fraction (linear between points)
    const y = frac * H;
    for (let i = 1; i < prof.length - 1; i++) {
      if (y <= prof[i + 1].y) {
        const a = prof[i];
        const b = prof[i + 1];
        const k = (y - a.y) / Math.max(1e-6, b.y - a.y);
        return a.x + (b.x - a.x) * k;
      }
    }
    return rt;
  };

  // gold bands: top and bottom of the panel band, plus more with tier
  const bands = [bandFrom, bandTo, 0.97];
  if (t >= 2) bands.push(0.72);
  if (t >= 3) bands.push(0.04);
  for (const f of bands) g.add(ring(radiusAt(f) * 1.04, base + f * H, 0.022 + t * 0.004, GOLD));

  // gems set into the band (more with tier)
  const gemCount = t === 1 ? 4 : 8;
  const gems: THREE.Mesh[] = [];
  for (let i = 0; i < gemCount; i++) {
    const a = (i / gemCount) * Math.PI * 2 + (t === 1 ? Math.PI / 4 : 0);
    const f = (bandFrom + bandTo) / 2 + 0.08;
    const r = radiusAt(f) * 1.02;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.035 + t * 0.006, 0), gemMat);
    gem.scale.set(0.7, 1.4, 0.5);
    gem.position.set(Math.sin(a) * r, base + f * H, Math.cos(a) * r);
    gem.rotation.y = a;
    gems.push(gem);
    g.add(gem);
  }

  // gold fins against the flare of the base
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const m = new THREE.Mesh(fin(), GOLD);
    m.position.set(Math.sin(a) * (rb + 0.01), base, Math.cos(a) * (rb + 0.01));
    m.rotation.y = a - Math.PI / 2;
    m.scale.setScalar(0.8 + t * 0.15);
    g.add(m);
  }

  // the crown: a gold rim with curved blades leaning out
  const topY = base + H;
  const topR = rt * 1.08;
  g.add(ring(topR, topY + 0.02, 0.035, GOLD_DARK));
  const blades: THREE.Mesh[] = [];
  const bladeCount = [3, 4, 6][t - 1];
  for (let i = 0; i < bladeCount; i++) {
    const a = (i / bladeCount) * Math.PI * 2;
    const b = new THREE.Mesh(blade(), GOLD);
    b.position.set(Math.sin(a) * topR * 0.85, topY, Math.cos(a) * topR * 0.85);
    // flat side facing outward, leaning away from the centre: reads from every side
    b.rotation.order = 'YXZ';
    b.rotation.y = a;
    b.rotation.x = 0.32;
    b.scale.setScalar(0.75 + t * 0.2);
    blades.push(b);
    g.add(b);
  }

  // tier 3: shards orbiting the crown (one ring that turns, so it draws as one mesh)
  const shardRing = dynamic(new THREE.Group());
  if (t >= 3) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), gemMat);
      s.scale.y = 2.2;
      s.position.set(Math.cos(a) * (topR + 0.22), topY + 0.25 + Math.sin(i * 1.7) * 0.05, Math.sin(a) * (topR + 0.22));
      s.rotation.y = -a;
      shardRing.add(s);
    }
    g.add(shardRing);
  }

  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  let flare = 0;
  return {
    group: g,
    topY,
    topRadius: topR,
    update(time) {
      flare = Math.max(0, flare - 0.06);
      // the gems of all towers of one colour share a material (so they draw together): they pulse together
      gemMat.emissiveIntensity = 1.0 + Math.sin(time * 2.2) * 0.25;
      shardRing.rotation.y = -time * 1.2;
      shardRing.position.y = Math.sin(time * 2) * 0.05;
    },
    pulse() {
      flare = 1;
    },
  };
}
