import * as THREE from 'three';

/**
 * Battlefield camera at a fixed pitch. Starts zoomed out on the whole map;
 * the player zooms in to build and moves around:
 *
 * - desktop: mouse wheel zooms toward the cursor, drag pans, arrow keys / WASD pan
 * - touch: one-finger drag pans, two-finger pinch zooms
 *
 * The view never leaves the map. Movement is eased so it feels smooth.
 */
export interface RigOptions {
  /** map size in world units */
  width: number;
  depth: number;
  pitchDeg: number;
  /** closest zoom: how many cells across the screen at most zoom */
  minCellsAcross: number;
}

export class CameraRig {
  private readonly pitch: number;
  private target = new THREE.Vector3();
  private goal = new THREE.Vector3();
  private dist = 30;
  private goalDist = 30;
  private maxDist = 30;
  private minDist = 8;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchStart = 0;
  private pinchDist = 0;
  private readonly keys = new Set<string>();
  private readonly ray = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** true while the last pointer gesture moved the view (so a tap can be told apart later) */
  dragged = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLElement,
    private readonly opts: RigOptions,
  ) {
    this.pitch = THREE.MathUtils.degToRad(opts.pitchDeg);
    dom.style.touchAction = 'none';
    dom.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    dom.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    // physical key positions: WASD stays WASD on AZERTY (ZQSD) and other layouts
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.fit();
    this.dist = this.goalDist = this.maxDist;
  }

  /** Recomputes the zoom limits for the current aspect ratio (call on resize). */
  fit(): void {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // perspective: the near (bottom) edge of the view is narrower, so leave extra width
    const needW = this.opts.width * 1.12 + 2;
    const needH = (this.opts.depth + 3) * Math.sin(this.pitch) + 3;
    this.maxDist = Math.max(needW / this.camera.aspect, needH) / (2 * tanHalf);
    this.minDist = this.opts.minCellsAcross / this.camera.aspect / (2 * tanHalf);
    this.goalDist = THREE.MathUtils.clamp(this.goalDist, this.minDist, this.maxDist);
    this.clampGoal();
  }

  /** 0 = zoomed all the way in, 1 = whole map. */
  get zoom(): number {
    return (this.dist - this.minDist) / Math.max(0.001, this.maxDist - this.minDist);
  }

  /** Jump to a zoom (0..1) centred on a world point. */
  focus(x: number, z: number, zoom: number, instant = false): void {
    this.goal.set(x, 0, z);
    this.goalDist = THREE.MathUtils.lerp(this.minDist, this.maxDist, zoom);
    this.clampGoal();
    if (instant) {
      this.target.copy(this.goal);
      this.dist = this.goalDist;
    }
  }

  /** The point the camera looks at and its distance; feed shadows and fog. */
  get view(): { target: THREE.Vector3; distance: number } {
    return { target: this.target, distance: this.dist };
  }

  update(dt: number): void {
    // keyboard pan, faster when zoomed out
    const pan = this.dist * 0.9 * dt;
    let kx = 0;
    let kz = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) kx -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) kx += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) kz -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) kz += 1;
    if (kx || kz) {
      this.goal.x += kx * pan;
      this.goal.z += kz * pan;
      this.clampGoal();
    }
    // dragging follows the finger exactly; zoom and keys ease in quickly
    if (this.pointers.size > 0) this.target.copy(this.goal);
    const k = 1 - Math.exp(-dt * 20);
    this.target.lerp(this.goal, k);
    this.dist += (this.goalDist - this.dist) * k;
    this.camera.position.set(this.target.x, Math.sin(this.pitch) * this.dist, this.target.z + Math.cos(this.pitch) * this.dist);
    this.camera.lookAt(this.target);
  }

  /** Moves the camera to the goal immediately (used while dragging). */
  private applyNow(): void {
    this.target.copy(this.goal);
    this.camera.position.set(this.target.x, Math.sin(this.pitch) * this.dist, this.target.z + Math.cos(this.pitch) * this.dist);
    this.camera.lookAt(this.target);
  }

  /* ---------------------------------------------------------------- input */

  private groundAt(clientX: number, clientY: number, usingGoal = false): THREE.Vector3 | null {
    const rect = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    let cam = this.camera;
    if (usingGoal) {
      cam = this.camera.clone();
      cam.position.set(this.goal.x, Math.sin(this.pitch) * this.goalDist, this.goal.z + Math.cos(this.pitch) * this.goalDist);
      cam.lookAt(this.goal);
      cam.updateMatrixWorld();
    }
    this.ray.setFromCamera(ndc, cam);
    return this.ray.ray.intersectPlane(this.ground, new THREE.Vector3());
  }

  private zoomAt(clientX: number, clientY: number, factor: number): void {
    const before = this.groundAt(clientX, clientY, true);
    this.goalDist = THREE.MathUtils.clamp(this.goalDist * factor, this.minDist, this.maxDist);
    const after = this.groundAt(clientX, clientY, true);
    if (before && after) this.goal.add(before.sub(after));
    this.clampGoal();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0012));
  }

  private onDown(e: PointerEvent): void {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.dragged = false;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchStart = this.goalDist;
    }
  }

  private onMove(e: PointerEvent): void {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (this.pointers.size === 1) {
      const a = this.groundAt(prev.x, prev.y, true);
      const b = this.groundAt(cur.x, cur.y, true);
      if (a && b) {
        this.goal.add(a.sub(b));
        this.clampGoal();
        this.dragged = true;
        this.applyNow();
      }
    } else if (this.pointers.size === 2) {
      this.pointers.set(e.pointerId, cur);
      const [p, q] = [...this.pointers.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      const factor = (this.pinchStart * (this.pinchDist / Math.max(1, d))) / this.goalDist;
      this.zoomAt(mid.x, mid.y, factor);
      this.dragged = true;
      return;
    }
    this.pointers.set(e.pointerId, cur);
  }

  private onUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 1) {
      // a pinch ended: restart panning from the remaining finger
      this.pinchDist = 0;
    }
  }

  /** Keep the view over the map: the more zoomed in, the further it may move. */
  private clampGoal(): void {
    const hw = this.opts.width / 2;
    const hd = this.opts.depth / 2;
    const t = 1 - (this.goalDist - this.minDist) / Math.max(0.001, this.maxDist - this.minDist);
    this.goal.x = THREE.MathUtils.clamp(this.goal.x, -hw * t, hw * t);
    this.goal.z = THREE.MathUtils.clamp(this.goal.z, -hd * t, hd * t);
  }
}
