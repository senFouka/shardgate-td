/**
 * Canvas 2D drawing helpers.
 *
 * Phaser's Graphics object can only draw flat shapes, so all real art is
 * painted on an offscreen 2D canvas -- where gradients, blur-based glow and
 * additive blending are available -- and then registered as a Phaser texture.
 */
export interface Painting {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

export function paint(w: number, h: number): Painting {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return { canvas, ctx, w, h };
}

/** Soft radial halo. Use with additive blending for energy and light. */
export function halo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  stops: Array<[number, string]>,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Runs `body` with a coloured bloom behind every stroke and fill it makes. */
export function withGlow(
  ctx: CanvasRenderingContext2D,
  color: string,
  blur: number,
  body: () => void,
): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  body();
  ctx.restore();
}

export function polygon(ctx: CanvasRenderingContext2D, points: Array<[number, number]>): void {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

export function linearFill(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: Array<[number, string]>,
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  return g;
}

/** Rounded rectangle path. */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Deterministic value noise -- keeps the art identical between reloads. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
