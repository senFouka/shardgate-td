import * as THREE from 'three';
import { EXIT_NODE, MAP, SPAWN_NODE, buildGrid, nodeCenter } from '../data/map';
import { cellX, cellZ } from './coords';

/**
 * The ground, in two parts:
 * - the battlefield: a flat plane with a high-detail painted map (cobblestone
 *   lanes with relief, rich grass, no grid lines) and a matching bump map
 * - the land around it: the field stands on a low plateau; its edge drops
 *   as a cliff into a lake that rings it, then the shore rises into wooded
 *   hills. Coloured per vertex by height and slope.
 * `groundHeight` is the one height function everything else (water depth,
 * props) agrees with.
 */
export const MARGIN = 16;
const PX_PER_CELL = 48;
/** half sizes of the battlefield (world units) */
export const FIELD_HX = MAP.cols / 2;
export const FIELD_HZ = MAP.rows / 2;
/** the lake's surface */
export const WATER_Y = -0.95;

/** The open stone plaza behind the two gates at the top edge. */
function plaza(): { x0: number; x1: number; z0: number; z1: number } {
  const s = nodeCenter(SPAWN_NODE[0], SPAWN_NODE[1]);
  const e = nodeCenter(EXIT_NODE[0], EXIT_NODE[1]);
  const mid = (cellX(s.col) + cellX(e.col)) / 2;
  return { x0: mid - 6.5, x1: mid + 6.5, z0: -FIELD_HZ - 5.5, z1: -FIELD_HZ + 0.5 };
}
const PLAZA = plaza();

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Cheap deterministic value noise in [-1, 1]. */
export function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const h = (a: number, b: number) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
}

const rectDist = (x: number, z: number, x0: number, x1: number, z0: number, z1: number) =>
  Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));

/** How far a point lies outside the plateau (battlefield + gate plaza); 0 on it. */
export function outside(x: number, z: number): number {
  const field = rectDist(x, z, -FIELD_HX, FIELD_HX, -FIELD_HZ, FIELD_HZ);
  const p = PLAZA;
  return Math.min(field, rectDist(x, z, p.x0, p.x1, p.z0, p.z1));
}

/** Ground height anywhere: 0 on the plateau, a cliff, the lake bed, a shore, then hills. */
export function groundHeight(x: number, z: number): number {
  const out = outside(x, z);
  if (out <= 0) return 0;
  const n1 = noise(x * 0.17, z * 0.17);
  const n2 = noise(x * 0.6 + 7, z * 0.6 - 3);
  const cliffEdge = 0.3 + n2 * 0.12;
  const cliff = smooth(cliffEdge, cliffEdge + 0.9, out);
  const bankStart = 4.2 + n1 * 1.4;
  const bank = smooth(bankStart, bankStart + 2.4, out);
  const hills = smooth(bankStart + 4, bankStart + 13, out);
  return -1.8 * cliff + 2.05 * bank + hills * (2.2 + noise(x * 0.09 + 3, z * 0.09) * 2.4) + bank * n2 * 0.18;
}

export interface Terrain {
  ground: THREE.Mesh;
  field: THREE.Mesh;
}

export function buildTerrain(maxAnisotropy: number): Terrain {
  return { ground: buildGround(), field: buildField(maxAnisotropy) };
}

/* ------------------------------------------------------------ the land */

function buildGround(): THREE.Mesh {
  const w = MAP.cols + MARGIN * 2;
  const d = MAP.rows + MARGIN * 2;
  const geo = new THREE.PlaneGeometry(w, d, w * 3, d * 3);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    // tucked a hair under the battlefield plane, so the two never fight
    p.setY(i, outside(x, z) <= 0 ? -0.01 : groundHeight(x, z));
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const grassA = new THREE.Color('#4e7a2c');
  const grassB = new THREE.Color('#6a923a');
  const grassC = new THREE.Color('#3b6327');
  const hill = new THREE.Color('#355a24');
  const rockA = new THREE.Color('#7b7064');
  const rockB = new THREE.Color('#5c544b');
  const sand = new THREE.Color('#c2b083');
  const bed = new THREE.Color('#4e5a49');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const steep = 1 - nrm.getY(i);
    const n = noise(x * 0.35, z * 0.35) * 0.5 + 0.5;
    const n2 = noise(x * 1.3 + 9, z * 1.3) * 0.5 + 0.5;
    // grass, varied in big soft patches; darker as the hills climb
    c.copy(grassA).lerp(grassB, smooth(0.45, 0.9, n) * 0.8).lerp(grassC, smooth(0.5, 0.95, 1 - n) * 0.6);
    c.lerp(hill, smooth(0.6, 4, y));
    // wet sand and a muddy lake bed near and under the water
    if (y < WATER_Y + 0.45) c.lerp(sand, smooth(WATER_Y + 0.45, WATER_Y + 0.05, y));
    if (y < WATER_Y - 0.1) c.lerp(bed, smooth(WATER_Y - 0.1, WATER_Y - 0.8, y));
    // bare rock on steep slopes (the plateau's cliff)
    c.lerp(rockA.clone().lerp(rockB, n2), smooth(0.18, 0.45, steep));
    c.multiplyScalar(0.92 + n2 * 0.16);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: false }));
  mesh.receiveShadow = true;
  return mesh;
}

/* ------------------------------------------------------- the battlefield */

function buildField(maxAnisotropy: number): THREE.Mesh {
  const { color, bump } = paintField();
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;
  const bumpMap = new THREE.CanvasTexture(bump);
  bumpMap.anisotropy = maxAnisotropy;
  const geo = new THREE.PlaneGeometry(MAP.cols, MAP.rows);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 2.2, roughness: 0.92, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cellX(0) - 0.5 + MAP.cols / 2, 0, cellZ(0) - 0.5 + MAP.rows / 2);
  mesh.receiveShadow = true;
  return mesh;
}

/** The battlefield's colour and bump maps, painted on two canvases in step. */
function paintField(): { color: HTMLCanvasElement; bump: HTMLCanvasElement } {
  const W = MAP.cols * PX_PER_CELL;
  const H = MAP.rows * PX_PER_CELL;
  const mk = () => {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    return cv;
  };
  const color = mk();
  const bump = mk();
  const g = color.getContext('2d')!;
  const b = bump.getContext('2d')!;
  let seed = 1337;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const blob = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) => {
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, col);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const kinds = buildGrid();
  const isLane = (c: number, r: number) => c >= 0 && r >= 0 && c < MAP.cols && r < MAP.rows && kinds[r * MAP.cols + c] === 'lane';
  const P = PX_PER_CELL;

  /* grass: a deep base, big soft patches, blades, clover, tiny flowers */
  g.fillStyle = '#4b772b';
  g.fillRect(0, 0, W, H);
  b.fillStyle = '#7a7a7a';
  b.fillRect(0, 0, W, H);
  const patches = ['rgba(118,160,62,0.32)', 'rgba(52,96,36,0.4)', 'rgba(150,160,70,0.18)', 'rgba(40,82,48,0.32)', 'rgba(96,136,48,0.3)'];
  for (let i = 0; i < 420; i++) blob(g, rnd() * W, rnd() * H, 30 + rnd() * 150, patches[i % patches.length]);
  for (let i = 0; i < 70000; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const light = rnd() < 0.55;
    g.strokeStyle = light ? `rgba(${140 + rnd() * 40},${180 + rnd() * 30},80,0.22)` : 'rgba(22,48,18,0.24)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 4);
    g.stroke();
    if (i % 3 === 0) {
      b.fillStyle = light ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
      b.fillRect(x, y - 2, 1, 3);
    }
  }
  // clover and moss clumps
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    g.fillStyle = rnd() < 0.5 ? 'rgba(70,120,40,0.5)' : 'rgba(110,150,60,0.4)';
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(x + (rnd() - 0.5) * 6, y + (rnd() - 0.5) * 6, 1.5 + rnd() * 2, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle = ['#f3ecb0', '#e8a0c0', '#b8d0f8', '#ffffff', '#f6c060'][i % 5];
    g.globalAlpha = 0.75;
    g.beginPath();
    g.arc(rnd() * W, rnd() * H, 0.9 + rnd() * 1.1, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  /* lanes: worn earth with packed cobbles, clipped to the lane cells */
  const laneClip = (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    for (let r = 0; r < MAP.rows; r++) for (let c = 0; c < MAP.cols; c++) if (isLane(c, r)) ctx.rect(c * P, r * P, P, P);
    ctx.clip();
  };
  g.save();
  b.save();
  laneClip(g);
  laneClip(b);
  // the bed: packed earth, darker in the gaps
  g.fillStyle = '#3f362c';
  g.fillRect(0, 0, W, H);
  b.fillStyle = '#303030';
  b.fillRect(0, 0, W, H);
  for (let i = 0; i < 300; i++) blob(g, rnd() * W, rnd() * H, 20 + rnd() * 60, i % 2 ? 'rgba(90,72,50,0.4)' : 'rgba(40,34,26,0.4)');
  // setts: cut stones in staggered rows across every lane cell (rows run along x),
  // each with a soft bevel (light top-left, dark bottom-right) and its own tint
  const stoneHues: Array<[number, number, number]> = [
    [138, 126, 108], [126, 118, 104], [146, 132, 112], [120, 114, 104], [134, 122, 100], [124, 124, 110],
  ];
  const rowsPerCell = 3;
  const rowH = P / rowsPerCell;
  const gap = 2.2;
  const stoneAt = (x0: number, y0: number, w: number, h: number) => {
    const [hr, hg, hb] = stoneHues[Math.floor(rnd() * stoneHues.length)];
    const v = 0.88 + rnd() * 0.2;
    const rad = Math.min(w, h) * 0.32;
    const grd = g.createLinearGradient(x0, y0, x0 + w, y0 + h);
    grd.addColorStop(0, `rgb(${Math.min(255, hr * v * 1.18)},${Math.min(255, hg * v * 1.18)},${Math.min(255, hb * v * 1.18)})`);
    grd.addColorStop(0.5, `rgb(${hr * v},${hg * v},${hb * v})`);
    grd.addColorStop(1, `rgb(${hr * v * 0.74},${hg * v * 0.74},${hb * v * 0.74})`);
    g.fillStyle = grd;
    g.beginPath();
    g.roundRect(x0, y0, w, h, rad);
    g.fill();
    // a few speckles and a crack now and then
    for (let s = 0; s < 3; s++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,250,235,0.12)' : 'rgba(40,32,24,0.14)';
      g.fillRect(x0 + rnd() * w, y0 + rnd() * h, 1.5, 1.5);
    }
    b.fillStyle = '#d8d8d8';
    b.beginPath();
    b.roundRect(x0, y0, w, h, rad);
    b.fill();
    b.fillStyle = '#f4f4f4';
    b.beginPath();
    b.roundRect(x0 + w * 0.18, y0 + h * 0.2, w * 0.64, h * 0.55, rad * 0.6);
    b.fill();
  };
  // rows run across the whole map, so stones continue from one lane cell to the next
  for (let row = 0; row < MAP.rows * rowsPerCell; row++) {
    const y0 = row * rowH;
    let x = -((row * 7919) % 17) - rnd() * 8;
    while (x < W) {
      const w = P * (0.34 + rnd() * 0.22);
      stoneAt(x + gap / 2, y0 + gap / 2, w - gap, rowH - gap);
      x += w;
    }
  }
  // moss in the gaps and grime trodden into the middle of the road
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = rnd() < 0.6 ? 'rgba(70,96,40,0.3)' : 'rgba(30,24,18,0.2)';
    g.beginPath();
    g.arc(rnd() * W, rnd() * H, 1 + rnd() * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  b.restore();

  /* the road's edge: grass spills over the stones, a little earth shows */
  for (let r = 0; r < MAP.rows; r++) {
    for (let c = 0; c < MAP.cols; c++) {
      if (!isLane(c, r)) continue;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (isLane(c + dc, r + dr) || r + dr < 0) continue;
        // along the shared edge of this lane cell and the grass beside it
        for (let k = 0; k < 7; k++) {
          const t = (k + rnd()) / 7;
          const ex = dc === 0 ? c * P + t * P : c * P + (dc > 0 ? P : 0);
          const ey = dr === 0 ? r * P + t * P : r * P + (dr > 0 ? P : 0);
          const inX = -dc * (2 + rnd() * 7);
          const inY = -dr * (2 + rnd() * 7);
          blob(g, ex + inX * 0.4, ey + inY * 0.4, 5 + rnd() * 6, 'rgba(78,62,40,0.55)');
          g.fillStyle = rnd() < 0.5 ? 'rgba(84,128,44,0.9)' : 'rgba(60,104,36,0.9)';
          g.beginPath();
          g.ellipse(ex + inX, ey + inY, 2 + rnd() * 4, 2 + rnd() * 3, rnd() * 3, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }
  return { color, bump };
}
