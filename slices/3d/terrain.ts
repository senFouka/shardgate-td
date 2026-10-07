import * as THREE from 'three';
import { PATH_CORNERS, SECTION } from '../shared/layout';

/**
 * The ground: one displaced plane with a canvas-painted colour map (grass,
 * dirt road, faint build grid). Inside the playable section it is flat; past
 * its border it rolls up into hills that frame the battlefield.
 *
 * World mapping: cell (col, row) centre -> (x = col, z = row), y up.
 */
export const WORLD = { minX: -6, maxX: 21, minZ: -5, maxZ: 13 } as const;
const PX_PER_CELL = 64;

export function buildTerrain(maxAnisotropy: number): THREE.Mesh {
  const w = WORLD.maxX - WORLD.minX;
  const d = WORLD.maxZ - WORLD.minZ;
  const tex = new THREE.CanvasTexture(paintGround(w, d));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;

  const geo = new THREE.PlaneGeometry(w, d, w * 3, d * 3);
  geo.rotateX(-Math.PI / 2);
  geo.translate(WORLD.minX + w / 2, 0, WORLD.minZ + d / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    // distance outside the playable section (cells), 0 inside
    const ox = Math.max(-0.5 - x, x - (SECTION.cols - 0.5), 0);
    const oz = Math.max(-0.5 - z, z - (SECTION.rows - 0.5), 0);
    const out = Math.hypot(ox, oz);
    const n = noise(x * 0.45, z * 0.45) * 0.6 + noise(x * 1.3, z * 1.3) * 0.25;
    const rise = smooth(0.6, 4.5, out);
    // the exit side stays open so the road can leave the map
    p.setY(i, rise * (1.4 + n * 1.6) - 0.02 * (1 - rise));
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

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

function paintGround(w: number, d: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w * PX_PER_CELL;
  canvas.height = d * PX_PER_CELL;
  const ctx = canvas.getContext('2d')!;
  const toPx = (x: number, z: number): [number, number] => [(x - WORLD.minX) * PX_PER_CELL, (z - WORLD.minZ) * PX_PER_CELL];

  // grass base with large colour variation
  ctx.fillStyle = '#41662b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 99;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const blob = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const greens = ['rgba(92,140,52,0.45)', 'rgba(48,88,34,0.5)', 'rgba(120,150,60,0.35)', 'rgba(34,70,30,0.45)', 'rgba(140,130,70,0.25)'];
  for (let i = 0; i < 420; i++) {
    blob(rnd() * canvas.width, rnd() * canvas.height, 30 + rnd() * 160, greens[i % greens.length]);
  }
  // grass strokes for texture
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * canvas.width;
    const y = rnd() * canvas.height;
    const l = 3 + rnd() * 6;
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(130,170,70,0.18)' : 'rgba(25,50,20,0.2)';
    ctx.lineWidth = 1 + rnd();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 3, y - l);
    ctx.stroke();
  }
  // small flowers
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = ['#e8e2a0', '#d98fb0', '#a8c8f0', '#f0f0f0'][i % 4];
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(rnd() * canvas.width, rnd() * canvas.height, 1.5 + rnd() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // the road: layered soft strokes, then pebbles and wheel ruts
  const road = (width: number, color: string, blur: number) => {
    ctx.save();
    ctx.filter = blur > 0 ? `blur(${blur}px)` : 'none';
    ctx.strokeStyle = color;
    ctx.lineWidth = width * PX_PER_CELL;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    PATH_CORNERS.forEach(([x, z], i) => {
      const [px, py] = toPx(x, z);
      if (i === 0) ctx.moveTo(px - 400, py);
      else ctx.lineTo(px, py);
    });
    const [ex, ey] = toPx(...(PATH_CORNERS[PATH_CORNERS.length - 1] as [number, number]));
    ctx.lineTo(ex + 400, ey);
    ctx.stroke();
    ctx.restore();
  };
  road(1.5, 'rgba(30,24,14,0.6)', 16);
  road(1.12, '#6f573a', 5);
  road(0.96, '#86694a', 3);
  road(0.55, 'rgba(160,130,95,0.45)', 12);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * canvas.width;
    const y = rnd() * canvas.height;
    const wx = x / PX_PER_CELL + WORLD.minX;
    const wz = y / PX_PER_CELL + WORLD.minZ;
    if (distToRoad(wx, wz) > 0.5) continue;
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(70,52,32,0.7)' : 'rgba(200,175,130,0.6)';
    ctx.beginPath();
    ctx.ellipse(x, y, 1.5 + rnd() * 3, 1 + rnd() * 2, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // faint build grid inside the section (the maze is built on it)
  ctx.strokeStyle = 'rgba(255,255,230,0.05)';
  ctx.lineWidth = 1.5;
  for (let c = 0; c <= SECTION.cols; c++) {
    const [x0, y0] = toPx(c - 0.5, -0.5);
    const [, y1] = toPx(c - 0.5, SECTION.rows - 0.5);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y1);
    ctx.stroke();
  }
  for (let r = 0; r <= SECTION.rows; r++) {
    const [x0, y0] = toPx(-0.5, r - 0.5);
    const [x1] = toPx(SECTION.cols - 0.5, r - 0.5);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.stroke();
  }
  return canvas;
}

function distToRoad(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < PATH_CORNERS.length - 1; i++) {
    const [ax, az] = PATH_CORNERS[i];
    const [bx, bz] = PATH_CORNERS[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}
