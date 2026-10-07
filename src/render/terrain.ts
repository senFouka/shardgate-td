import * as THREE from 'three';
import { MAP, buildGrid } from '../data/map';
import { cellX, cellZ } from './coords';

/**
 * The ground: one displaced plane with a canvas-painted colour map. Flat over
 * the map: cobblestone lanes for the creep route, grass with a faint build
 * grid where towers go. Past the edges it rolls up into hills.
 */
export const MARGIN = 10;
const PX_PER_CELL = 48;

export function buildTerrain(maxAnisotropy: number): THREE.Mesh {
  const w = MAP.cols + MARGIN * 2;
  const d = MAP.rows + MARGIN * 2;
  const tex = new THREE.CanvasTexture(paintGround(w, d));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;

  const geo = new THREE.PlaneGeometry(w, d, w * 2, d * 2);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const hx = MAP.cols / 2;
  const hz = MAP.rows / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const ox = Math.max(Math.abs(x) - hx, 0);
    const oz = Math.max(Math.abs(z) - hz, 0);
    const out = Math.hypot(ox, oz);
    const n = noise(x * 0.3, z * 0.3) * 0.6 + noise(x * 0.9, z * 0.9) * 0.25;
    const rise = smooth(1, 9, out);
    p.setY(i, rise * (2.4 + n * 2.6) - 0.02 * (1 - rise));
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }));
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
  // world (cell-centred) -> canvas px; the plane spans [-w/2, w/2] x [-d/2, d/2]
  const toPx = (x: number, z: number): [number, number] => [(x + w / 2) * PX_PER_CELL, (z + d / 2) * PX_PER_CELL];
  let seed = 99;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const blob = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };

  ctx.fillStyle = '#41662b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const greens = ['rgba(92,140,52,0.4)', 'rgba(48,88,34,0.45)', 'rgba(120,150,60,0.3)', 'rgba(34,70,30,0.4)', 'rgba(140,130,70,0.22)'];
  for (let i = 0; i < 500; i++) blob(rnd() * canvas.width, rnd() * canvas.height, 20 + rnd() * 130, greens[i % greens.length]);
  for (let i = 0; i < 26000; i++) {
    const x = rnd() * canvas.width;
    const y = rnd() * canvas.height;
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(130,170,70,0.16)' : 'rgba(25,50,20,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 2, y - 2 - rnd() * 3);
    ctx.stroke();
  }
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = ['#e8e2a0', '#d98fb0', '#a8c8f0', '#f0f0f0'][i % 4];
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(rnd() * canvas.width, rnd() * canvas.height, 0.8 + rnd(), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // cobblestone lanes: dark bed, then stones with a little colour variation
  const kinds = buildGrid();
  const isLane = (c: number, r: number) => c >= 0 && r >= 0 && c < MAP.cols && r < MAP.rows && kinds[r * MAP.cols + c] === 'lane';
  for (let r = 0; r < MAP.rows; r++) {
    for (let c = 0; c < MAP.cols; c++) {
      if (!isLane(c, r)) continue;
      const [x0, y0] = toPx(cellX(c) - 0.5, cellZ(r) - 0.5);
      ctx.fillStyle = '#5d5448';
      ctx.fillRect(x0, y0, PX_PER_CELL, PX_PER_CELL);
      // stones in loose rows
      const rows = 4;
      for (let k = 0; k < rows; k++) {
        let x = x0 + (k % 2) * -6;
        const h = PX_PER_CELL / rows;
        while (x < x0 + PX_PER_CELL) {
          const w = 9 + rnd() * 9;
          const v = 120 + Math.floor(rnd() * 45);
          ctx.fillStyle = `rgb(${v + 12},${v + 4},${v - 10})`;
          const sx = Math.max(x0, x + 1);
          const ex = Math.min(x0 + PX_PER_CELL, x + w - 1);
          if (ex > sx) {
            ctx.beginPath();
            ctx.roundRect(sx, y0 + k * h + 1, ex - sx, h - 2, 3);
            ctx.fill();
          }
          x += w;
        }
      }
    }
  }
  // soft dirt shoulder where lane meets grass
  for (let r = 0; r < MAP.rows; r++) {
    for (let c = 0; c < MAP.cols; c++) {
      if (isLane(c, r)) continue;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!isLane(c + dc, r + dr)) continue;
        const [x0, y0] = toPx(cellX(c) - 0.5, cellZ(r) - 0.5);
        const g = ctx.createLinearGradient(
          x0 + (dc > 0 ? PX_PER_CELL : dc < 0 ? 0 : PX_PER_CELL / 2), y0 + (dr > 0 ? PX_PER_CELL : dr < 0 ? 0 : PX_PER_CELL / 2),
          x0 + PX_PER_CELL / 2, y0 + PX_PER_CELL / 2,
        );
        g.addColorStop(0, 'rgba(70,52,30,0.55)');
        g.addColorStop(0.5, 'rgba(70,52,30,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x0, y0, PX_PER_CELL, PX_PER_CELL);
      }
    }
  }

  // faint build grid over the map
  ctx.strokeStyle = 'rgba(255,255,230,0.07)';
  ctx.lineWidth = 1;
  for (let r = 0; r < MAP.rows; r++) {
    for (let c = 0; c < MAP.cols; c++) {
      if (isLane(c, r)) continue;
      const [x0, y0] = toPx(cellX(c) - 0.5, cellZ(r) - 0.5);
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, PX_PER_CELL - 1, PX_PER_CELL - 1);
    }
  }
  // a soft darker rim marks the edge of the buildable field
  ctx.strokeStyle = 'rgba(20,30,12,0.35)';
  ctx.lineWidth = PX_PER_CELL * 0.6;
  const [ex0, ey0] = toPx(cellX(0) - 0.5, cellZ(0) - 0.5);
  ctx.strokeRect(ex0, ey0, MAP.cols * PX_PER_CELL, MAP.rows * PX_PER_CELL);
  return canvas;
}
