import * as THREE from 'three';
import { MAP, buildGrid, routePolyline } from '../data/map';
import { FIELD_HX, FIELD_HZ, MARGIN, WATER_Y, buildTerrain, groundHeight, noise, outside } from './terrain';
import { buildWater, type Water } from './water';
import { buildLandmarks, type Landmarks } from './landmarks';
import { mergeStatic, placeKind, placeKindTracked, type Placement, type TrackedCopy } from './props';
import { cellX, cellZ } from './coords';
import { RouteView } from './RouteView';
import { buildAmbience, type Ambience } from './ambience';

/**
 * Everything static about the battlefield: the plateau with its cobblestone
 * road and grass, the cliff and the lake around it, the gates, the forest,
 * ruins and small life on the grass, and the creep route preview.
 *
 * Decor on a buildable cell (tufts, flowers, pebbles, mushrooms) is cleared
 * when a tower goes there and comes back when it is sold.
 */
export class MapView {
  readonly group = new THREE.Group();
  readonly route = new RouteView();
  landmarks: Landmarks | null = null;
  private water: Water | null = null;
  /** pollen, fireflies and cloud shadows */
  readonly ambience: Ambience = buildAmbience();
  private grid: THREE.Mesh | null = null;
  /** decor copies per cell (row * cols + col) */
  private readonly cellDecor = new Map<number, TrackedCopy[]>();
  private readonly cleared = new Set<number>();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);

  async build(maxAnisotropy: number, sunDir: THREE.Vector3): Promise<void> {
    const terrain = buildTerrain(maxAnisotropy);
    this.group.add(terrain.ground, terrain.field);
    this.water = buildWater(sunDir);
    this.group.add(this.water.mesh, this.ambience.group);
    this.group.add(this.kerbs());
    this.grid = this.buildGrid(maxAnisotropy);
    this.group.add(this.grid);
    this.landmarks = buildLandmarks();
    this.group.add(this.landmarks.group, this.route.points);
    this.route.setRoute(routePolyline().map((p) => [cellX(p.col), cellZ(p.row)] as [number, number]));

    let seed = 4242;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const span = { x: FIELD_HX + MARGIN - 1, z: FIELD_HZ + MARGIN - 1 };
    const at = (x: number, z: number, size: number, extra: Partial<Placement> = {}): Placement => ({ x, z, size, rot: rnd() * 6.28, y: groundHeight(x, z), ...extra });

    /* the land around the lake: forest, bushes, logs, mushrooms, boulders */
    const pines: Placement[] = [];
    const broad: Placement[] = [];
    const autumn: Placement[] = [];
    const bushes: Placement[] = [];
    const smallBushes: Placement[] = [];
    const wood: Placement[] = [];
    const mush: Placement[] = [];
    const boulders: Placement[] = [];
    for (let i = 0; i < 2600; i++) {
      const x = (rnd() * 2 - 1) * span.x;
      const z = (rnd() * 2 - 1) * span.z;
      const h = groundHeight(x, z);
      const out = outside(x, z);
      if (out < 1.5) continue;
      if (h < WATER_Y + 0.25) continue; // in or at the edge of the water
      const forest = noise(x * 0.12 + 40, z * 0.12) * 0.5 + 0.5; // dense groves and open glades
      if (h > 0.55 && rnd() < 0.25 + forest * 0.6) {
        const size = 2.2 + rnd() * 1.6 + Math.min(out, 10) * 0.12;
        const pick = rnd();
        if (pick < 0.12) autumn.push(at(x, z, size));
        else if (pick < 0.45) pines.push(at(x, z, size * 1.1));
        else broad.push(at(x, z, size));
        continue;
      }
      const r = rnd();
      if (r < 0.3) bushes.push(at(x, z, 0.8 + rnd() * 0.7));
      else if (r < 0.45) smallBushes.push(at(x, z, 0.5 + rnd() * 0.4));
      else if (r < 0.52) wood.push(at(x, z, 0.7 + rnd() * 0.6));
      else if (r < 0.6) mush.push(at(x, z, 0.3 + rnd() * 0.3));
      else if (r < 0.68 && h < 0.8) boulders.push(at(x, z, 0.9 + rnd() * 1.2, { yScale: 0.7 + rnd() * 0.4 }));
    }

    /* the plateau's cliff: crags all along it, so it reads as a rock wall */
    const crags: Placement[] = [];
    const taken = new Set<string>();
    for (let i = 0; i < 9000 && crags.length < 260; i++) {
      const x = (rnd() * 2 - 1) * (FIELD_HX + 3);
      const z = (rnd() * 2 - 1) * (FIELD_HZ + 8) - 2;
      const out = outside(x, z);
      if (out < 0.55 || out > 1.15) continue;
      const key = `${Math.round(x / 1.1)},${Math.round(z / 1.1)}`;
      if (taken.has(key)) continue;
      taken.add(key);
      crags.push(at(x, z, 1.3 + rnd() * 1.1, { y: groundHeight(x, z) - 0.25, yScale: 0.8 + rnd() * 0.5 }));
    }

    /* the lake: lily pads in quiet water, a few rocks breaking the surface */
    const lilies: Placement[] = [];
    const lakeRocks: Placement[] = [];
    for (let i = 0; i < 4000; i++) {
      const x = (rnd() * 2 - 1) * span.x;
      const z = (rnd() * 2 - 1) * span.z;
      const depth = WATER_Y - groundHeight(x, z);
      if (depth < 0.2) continue;
      if (depth < 0.8 && rnd() < 0.05 && noise(x * 0.3, z * 0.3) > 0.1) lilies.push({ x, z, size: 0.5 + rnd() * 0.5, rot: rnd() * 6.28, y: WATER_Y + 0.01 });
      else if (rnd() < 0.006) lakeRocks.push(at(x, z, 0.9 + rnd() * 0.9, { yScale: 1.2 + rnd() * 0.6 }));
    }

    /* ruins around the gate plaza: an old place of power */
    const columns: Placement[] = [];
    const obelisks: Placement[] = [];
    const ruins: Placement[] = [];
    const gateX = this.landmarkCenterX();
    for (const side of [-1, 1]) {
      const bx = gateX + side * 5.8;
      columns.push({ x: bx, z: -FIELD_HZ - 1.2, size: 2.4, rot: rnd() * 6.28, y: 0 });
      columns.push({ x: bx, z: -FIELD_HZ - 4.2, size: 2.0, rot: rnd() * 6.28, y: 0 });
      obelisks.push({ x: gateX + side * 3.6, z: -FIELD_HZ - 4.9, size: 3.2, rot: side * 0.2, y: 0 });
      ruins.push({ x: bx + side * 0.2, z: -FIELD_HZ - 2.8, size: 0.9, rot: rnd() * 6.28, y: 0 });
    }
    // broken pieces scattered on the far shore
    for (let i = 0; i < 400 && ruins.length < 14; i++) {
      const x = (rnd() * 2 - 1) * span.x;
      const z = (rnd() * 2 - 1) * span.z;
      const h = groundHeight(x, z);
      if (outside(x, z) < 6 || h < WATER_Y + 0.3 || h > 1.2) continue;
      if (rnd() < 0.5) ruins.push(at(x, z, 0.8 + rnd() * 0.5));
      else columns.push(at(x, z, 1.4 + rnd() * 0.8));
    }

    /* small life on the battlefield's grass: tufts, flowers, pebbles, mushrooms */
    const kinds = buildGrid();
    const tufts: Array<Placement & { key: number }> = [];
    const flowers: Array<Placement & { key: number }> = [];
    const pebbles: Array<Placement & { key: number }> = [];
    const shrooms: Array<Placement & { key: number }> = [];
    for (let r = 0; r < MAP.rows; r++) {
      for (let c = 0; c < MAP.cols; c++) {
        if (kinds[r * MAP.cols + c] !== 'grass') continue;
        const key = r * MAP.cols + c;
        const meadow = noise(c * 0.35 + 11, r * 0.35) * 0.5 + 0.5;
        const byRoad = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => kinds[(r + dr) * MAP.cols + c + dc] === 'lane');
        const chance = byRoad ? 0.55 : meadow > 0.55 ? 0.75 : 0.18;
        const n = rnd() < chance ? 1 + Math.floor(rnd() * (meadow > 0.55 ? 3.2 : 1.6)) : 0;
        for (let k = 0; k < n; k++) {
          const p = { key, x: cellX(c) + (rnd() - 0.5) * 0.8, z: cellZ(r) + (rnd() - 0.5) * 0.8, rot: rnd() * 6.28, y: 0 };
          const pick = rnd();
          if (pick < 0.62) tufts.push({ ...p, size: 0.26 + rnd() * 0.18 });
          else if (pick < 0.78) flowers.push({ ...p, size: 0.24 + rnd() * 0.12 });
          else if (pick < 0.92) pebbles.push({ ...p, size: 0.14 + rnd() * 0.12 });
          else shrooms.push({ ...p, size: 0.2 + rnd() * 0.12 });
        }
      }
    }

    const still = { byHeight: false, castShadow: false };
    // the scenery around the field goes into its own group first, then is merged
    const scenery = new THREE.Group();
    await Promise.all([
      placeKind(scenery, 'pine', pines, { byHeight: true, castShadow: false }),
      placeKind(scenery, 'broadleaf', broad, { byHeight: true, castShadow: false }),
      placeKind(scenery, 'autumn', autumn, { byHeight: true, castShadow: false }),
      placeKind(scenery, 'bush', bushes, { byHeight: false, castShadow: false }),
      placeKind(scenery, 'smallBush', smallBushes, still),
      placeKind(scenery, 'wood', wood, { byHeight: false, castShadow: false }),
      placeKind(scenery, 'mushroom', mush, still),
      placeKind(scenery, 'boulder', boulders, { byHeight: false, castShadow: true }),
      placeKind(scenery, 'crag', crags, { byHeight: true, castShadow: true }),
      placeKind(scenery, 'lily', lilies, still),
      placeKind(scenery, 'boulder', lakeRocks, { byHeight: false, castShadow: false }),
      placeKind(scenery, 'column', columns, { byHeight: true, castShadow: true }),
      placeKind(scenery, 'obelisk', obelisks, { byHeight: true, castShadow: true }),
      placeKind(scenery, 'ruin', ruins, { byHeight: false, castShadow: true }),
      placeKindTracked(this.group, 'tuft', tufts, still, this.cellDecor),
      placeKindTracked(this.group, 'flower', flowers, still, this.cellDecor),
      placeKindTracked(this.group, 'pebble', pebbles, still, this.cellDecor),
      placeKindTracked(this.group, 'mushroom', shrooms, still, this.cellDecor),
    ]);
    mergeStatic(scenery, scenery.children.filter((o): o is THREE.InstancedMesh => (o as THREE.InstancedMesh).isInstancedMesh));
    this.group.add(scenery);
    // nothing here moves (the gates and the ambience animate through shaders and
    // their own groups): compute every matrix once, not every frame
    this.group.updateMatrixWorld(true);
    const moving = new Set<THREE.Object3D>([this.landmarks.group, this.route.points, this.ambience.group]);
    const freeze = (o: THREE.Object3D) => {
      if (moving.has(o)) return;
      o.matrixAutoUpdate = false;
      o.matrixWorldAutoUpdate = false;
      for (const c of o.children) freeze(c);
    };
    for (const c of this.group.children) freeze(c);
  }

  /** The x between the two gates (the plaza's centre). */
  private landmarkCenterX(): number {
    const box = new THREE.Box3().setFromObject(this.landmarks!.group);
    return (box.min.x + box.max.x) / 2;
  }

  /* ------------------------------------------------------- cell decor */

  /** A tower stands on this cell: its decor goes. */
  clearCell(col: number, row: number): void {
    const key = row * MAP.cols + col;
    if (this.cleared.has(key)) return;
    this.cleared.add(key);
    for (const d of this.cellDecor.get(key) ?? []) {
      d.mesh.setMatrixAt(d.index, this.zero);
      d.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** The cell is free again: its decor comes back. */
  restoreCell(col: number, row: number): void {
    const key = row * MAP.cols + col;
    if (!this.cleared.delete(key)) return;
    for (const d of this.cellDecor.get(key) ?? []) {
      d.mesh.setMatrixAt(d.index, d.matrix);
      d.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** A new game: every cell grows back. */
  restoreAll(): void {
    for (const key of [...this.cleared]) this.restoreCell(key % MAP.cols, Math.floor(key / MAP.cols));
  }

  /* ------------------------------------------------------- build grid */

  /** The grid shows only while a tower is being placed. */
  setGridVisible(on: boolean): void {
    if (this.grid) this.grid.visible = on;
  }

  private buildGrid(maxAnisotropy: number): THREE.Mesh {
    const P = 32;
    const cv = document.createElement('canvas');
    cv.width = MAP.cols * P;
    cv.height = MAP.rows * P;
    const g = cv.getContext('2d')!;
    const kinds = buildGrid();
    g.strokeStyle = 'rgba(255,250,220,0.5)';
    g.lineWidth = 1.5;
    for (let r = 0; r < MAP.rows; r++) {
      for (let c = 0; c < MAP.cols; c++) {
        if (kinds[r * MAP.cols + c] !== 'grass') continue;
        g.strokeRect(c * P + 1.5, r * P + 1.5, P - 3, P - 3);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = maxAnisotropy;
    const geo = new THREE.PlaneGeometry(MAP.cols, MAP.rows);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false }));
    mesh.position.set(cellX(0) - 0.5 + MAP.cols / 2, 0.015, cellZ(0) - 0.5 + MAP.rows / 2);
    mesh.renderOrder = 4;
    mesh.visible = false;
    return mesh;
  }

  /* ------------------------------------------------------------ kerbs */

  /** Rough kerb stones wherever the road meets grass: one instanced draw call. */
  private kerbs(): THREE.InstancedMesh {
    const kinds = buildGrid();
    const lane = (c: number, r: number) => c >= 0 && r >= 0 && c < MAP.cols && r < MAP.rows && kinds[r * MAP.cols + c] === 'lane';
    const list: Array<{ m: THREE.Matrix4; tint: number }> = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let r = 0; r < MAP.rows; r++) {
      for (let c = 0; c < MAP.cols; c++) {
        if (!lane(c, r)) continue;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (lane(c + dc, r + dr) || r + dr < 0) continue; // no kerb across the gate stubs at the top edge
          const along = dc === 0;
          // two or three uneven stones per cell edge
          const n = rnd() < 0.5 ? 2 : 3;
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n - 0.5 + (rnd() - 0.5) * 0.08;
            const x = cellX(c) + dc * 0.46 + (along ? t : 0);
            const z = cellZ(r) + dr * 0.46 + (along ? 0 : t);
            const len = (1 / n) * (0.95 + rnd() * 0.25);
            const m = new THREE.Matrix4().compose(
              new THREE.Vector3(x, 0.03 + rnd() * 0.03, z),
              q.setFromEuler(e.set((rnd() - 0.5) * 0.25, (along ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.25)),
              new THREE.Vector3(len, 0.13 + rnd() * 0.07, 0.15 + rnd() * 0.06),
            );
            list.push({ m, tint: 0.78 + rnd() * 0.32 });
          }
        }
      }
    }
    const geo = new THREE.DodecahedronGeometry(0.62, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), list.length);
    const base = new THREE.Color(0x8e8576);
    const moss = new THREE.Color(0x6f7f4e);
    const col = new THREE.Color();
    list.forEach(({ m, tint }, i) => {
      mesh.setMatrixAt(i, m);
      col.copy(base).lerp(moss, tint > 1.0 ? 0.35 : 0).multiplyScalar(tint);
      mesh.setColorAt(i, col);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  update(time: number, dt: number): void {
    this.landmarks?.update(time, dt);
    this.water?.update(time);
    this.ambience.update(time);
    this.route.update(time);
  }
}
