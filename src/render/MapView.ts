import * as THREE from 'three';
import { MAP, buildGrid, routePolyline } from '../data/map';
import { buildTerrain, MARGIN } from './terrain';
import { buildLandmarks, type Landmarks } from './landmarks';
import { placeKind, type Placement } from './props';
import { cellX, cellZ } from './coords';
import { RouteView } from './RouteView';

/**
 * Everything static about the battlefield: ground with cobblestone lanes,
 * low kerb stones along the lanes, the portals, the scenery around the map,
 * and the creep route preview.
 */
export class MapView {
  readonly group = new THREE.Group();
  readonly route = new RouteView();
  private landmarks: Landmarks | null = null;

  async build(maxAnisotropy: number): Promise<void> {
    this.group.add(buildTerrain(maxAnisotropy));
    this.group.add(this.kerbs());
    this.landmarks = buildLandmarks();
    this.group.add(this.landmarks.group, this.route.points);
    this.route.setRoute(routePolyline().map((p) => [cellX(p.col), cellZ(p.row)] as [number, number]));

    let seed = 4242;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

    // scenery beyond the edges: forest thinning toward the field, rocks at the rim
    const trees: Placement[] = [];
    const bushes: Placement[] = [];
    const rocks: Placement[] = [];
    const hw = MAP.cols / 2;
    const hd = MAP.rows / 2;
    const span = MARGIN - 1;
    for (let i = 0; i < 620; i++) {
      const x = (rnd() * 2 - 1) * (hw + span);
      const z = (rnd() * 2 - 1) * (hd + span);
      const out = Math.max(Math.abs(x) - hw, Math.abs(z) - hd);
      if (out < 0.4) continue;
      // keep the portals' surroundings open
      if (z < -hd && Math.abs(x - cellX(MAP.cols / 2)) < 7) continue;
      if (out < 1.8) {
        if (rnd() < 0.35) rocks.push({ x, z, size: 0.9 + rnd() * 1.1, rot: rnd() * 6.28, yScale: 0.7 + rnd() * 0.5 });
        else bushes.push({ x, z, size: 0.7 + rnd() * 0.6, rot: rnd() * 6.28 });
        continue;
      }
      trees.push({ x, z, size: 2.0 + rnd() * 1.5 + Math.min(out, 6) * 0.15, rot: rnd() * 6.28 });
    }
    // grass tufts on the grass cells only (flat, purely decorative)
    const kinds = buildGrid();
    const grass: Placement[] = [];
    for (let i = 0; i < 260; i++) {
      const c = Math.floor(rnd() * MAP.cols);
      const r = Math.floor(rnd() * MAP.rows);
      if (kinds[r * MAP.cols + c] !== 'grass') continue;
      grass.push({ x: cellX(c) + (rnd() - 0.5) * 0.8, z: cellZ(r) + (rnd() - 0.5) * 0.8, size: 0.3 + rnd() * 0.25, rot: rnd() * 6.28 });
    }

    await Promise.all([
      placeKind(this.group, 'tree', trees, { byHeight: true, castShadow: true }),
      placeKind(this.group, 'bush', bushes, { byHeight: false, castShadow: true }),
      placeKind(this.group, 'rock', rocks, { byHeight: false, castShadow: true }),
      placeKind(this.group, 'grass', grass, { byHeight: false, castShadow: false }),
    ]);
  }

  /** Low kerb stones wherever a lane cell meets grass: one instanced draw call. */
  private kerbs(): THREE.InstancedMesh {
    const kinds = buildGrid();
    const lane = (c: number, r: number) => c >= 0 && r >= 0 && c < MAP.cols && r < MAP.rows && kinds[r * MAP.cols + c] === 'lane';
    const list: THREE.Matrix4[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let r = 0; r < MAP.rows; r++) {
      for (let c = 0; c < MAP.cols; c++) {
        if (!lane(c, r)) continue;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc;
          const nr = r + dr;
          if (lane(nc, nr) || nr < 0) continue; // no kerb across the portal stubs at the top edge
          const along = dc === 0;
          const m = new THREE.Matrix4().compose(
            new THREE.Vector3(cellX(c) + dc * 0.47, 0.07 + rnd() * 0.02, cellZ(r) + dr * 0.47),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (along ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.08, 0)),
            new THREE.Vector3(0.96, 1, 1),
          );
          list.push(m);
        }
      }
    }
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.16, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9, flatShading: true }),
      list.length,
    );
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  update(time: number, dt: number): void {
    this.landmarks?.update(time, dt);
    this.route.update(time);
  }
}
