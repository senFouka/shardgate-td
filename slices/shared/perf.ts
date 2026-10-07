/**
 * Renderer-agnostic measurements for the slices, read by the headless
 * harness through `window.__perf`: frame times and WebGL draw calls per frame.
 * Import this first, before any renderer creates its context.
 */
interface PerfState {
  frames: number[];
  drawCalls: number[];
  reset(): void;
  summary(): { fpsAvg: number; fpsMin1s: number; frameP95: number; drawCallsAvg: number; drawCallsMax: number };
}

let callsThisFrame = 0;
const DRAW_FNS = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'];
for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype] as unknown as Array<Record<string, unknown>>) {
  for (const name of DRAW_FNS) {
    const orig = proto[name] as ((...a: unknown[]) => unknown) | undefined;
    if (typeof orig !== 'function') continue;
    proto[name] = function (this: unknown, ...args: unknown[]) {
      callsThisFrame++;
      return orig.apply(this, args);
    };
  }
}

const state: PerfState = {
  frames: [],
  drawCalls: [],
  reset() {
    this.frames = [];
    this.drawCalls = [];
  },
  summary() {
    const f = this.frames;
    const total = f.reduce((a, b) => a + b, 0);
    // worst 1-second window
    let worst = Infinity;
    for (let i = 0, j = 0, acc = 0; j < f.length; j++) {
      acc += f[j];
      while (acc > 1000 && i < j) {
        worst = Math.min(worst, ((j - i) * 1000) / acc);
        acc -= f[i++];
      }
    }
    const sorted = [...f].sort((a, b) => a - b);
    const dc = this.drawCalls;
    return {
      fpsAvg: f.length ? (f.length * 1000) / total : 0,
      fpsMin1s: worst === Infinity ? (f.length * 1000) / Math.max(1, total) : worst,
      frameP95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      drawCallsAvg: dc.length ? dc.reduce((a, b) => a + b, 0) / dc.length : 0,
      drawCallsMax: dc.length ? Math.max(...dc) : 0,
    };
  },
};

let last = performance.now();
function tick(now: number): void {
  state.frames.push(now - last);
  state.drawCalls.push(callsThisFrame);
  callsThisFrame = 0;
  last = now;
  if (state.frames.length > 20000) state.reset();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

(window as unknown as { __perf: PerfState }).__perf = state;
