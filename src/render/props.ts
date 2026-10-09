import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Static scenery from the CC0 model packs (see ASSETS.md): loading,
 * recolouring to our palette, and instancing (one draw call per mesh of a
 * model, however many copies).
 */
const loader = new GLTFLoader();

export function loadGltf(url: string): Promise<GLTF | null> {
  return new Promise((resolve) =>
    loader.load(url, resolve, undefined, (e) => {
      console.warn('[props] model failed', url, e);
      resolve(null);
    }),
  );
}

const N = 'models/kenney-nature/';
export const PROP_MODELS = {
  rock: [`${N}rock_largeA.glb`, `${N}rock_largeB.glb`, `${N}rock_largeC.glb`],
  rockTall: [`${N}rock_tallA.glb`],
  tree: [`${N}tree_oak.glb`, `${N}tree_detailed.glb`, `${N}tree_default.glb`],
  bush: [`${N}plant_bushLarge.glb`, `${N}plant_bushDetailed.glb`],
  grass: [`${N}grass_large.glb`, `${N}grass_leafsLarge.glb`],
  // small things on the battlefield's grass (cleared from a cell when a tower goes there)
  flower: [`${N}flower_purpleA.glb`, `${N}flower_purpleB.glb`, `${N}flower_redA.glb`, `${N}flower_redB.glb`, `${N}flower_yellowA.glb`, `${N}flower_yellowB.glb`],
  tuft: [`${N}grass.glb`, `${N}grass_leafs.glb`, `${N}plant_flatShort.glb`],
  mushroom: [`${N}mushroom_red.glb`, `${N}mushroom_tanGroup.glb`, `${N}mushroom_redGroup.glb`, `${N}mushroom_tanTall.glb`],
  pebble: [`${N}stone_smallA.glb`, `${N}stone_smallC.glb`, `${N}stone_smallFlatA.glb`, `${N}stone_smallFlatB.glb`],
  // around the lake
  pine: [`${N}tree_pineRoundB.glb`, `${N}tree_pineRoundD.glb`],
  broadleaf: [`${N}tree_fat.glb`, `${N}tree_plateau.glb`, `${N}tree_detailed_dark.glb`],
  autumn: [`${N}tree_default_fall.glb`, `${N}tree_oak_fall.glb`],
  smallBush: [`${N}plant_bushSmall.glb`],
  wood: [`${N}log.glb`, `${N}log_large.glb`, `${N}stump_old.glb`, `${N}stump_roundDetailed.glb`],
  boulder: [`${N}rock_largeD.glb`, `${N}rock_largeE.glb`, `${N}stone_largeA.glb`, `${N}stone_largeC.glb`],
  crag: [`${N}rock_tallB.glb`, `${N}rock_tallE.glb`, `${N}stone_tallA.glb`, `${N}stone_tallC.glb`, `${N}stone_tallF.glb`],
  lily: [`${N}lily_large.glb`, `${N}lily_small.glb`],
  column: [`${N}statue_column.glb`, `${N}statue_columnDamaged.glb`],
  obelisk: [`${N}statue_obelisk.glb`],
  ruin: [`${N}statue_block.glb`, `${N}statue_ring.glb`],
} as const;
export type PropKind = keyof typeof PROP_MODELS;

/** Our palette for the Kenney Nature Kit's material names (CC0 allows recolouring). */
const RECOLOR: Record<string, { default: number } & Partial<Record<PropKind, number>>> = {
  grass: { default: 0x5e8c36, rock: 0x6f9a3e, rockTall: 0x6f9a3e, bush: 0x4f7d2f, boulder: 0x648f37, crag: 0x648f37, tuft: 0x5d8f34, flower: 0x5d8f34, smallBush: 0x4a7a2c },
  leafsGreen: { default: 0x4c7a2e, tuft: 0x6a9a3a, lily: 0x4f8a34 },
  leafsDark: { default: 0x2f5a2a },
  dirt: { default: 0x8d877c, crag: 0x6e655a, boulder: 0x7a7064 },
  woodBark: { default: 0x6b4a2e },
  woodBarkDark: { default: 0x4e3826 },
  woodInner: { default: 0xc9a26a },
  stone: { default: 0x9a948a, pebble: 0x8c867c, crag: 0x6c645a, boulder: 0x7d756a, column: 0xb3ab9c, obelisk: 0xb3ab9c, ruin: 0xb3ab9c },
  stoneDark: { default: 0x6e6860 },
  colorPurple: { default: 0xb07ae0 },
  colorRed: { default: 0xd84a3a },
  colorYellow: { default: 0xf2cf4a },
};

export function recolor(model: THREE.Object3D, kind: PropKind): void {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats as THREE.MeshStandardMaterial[]) {
      const map = RECOLOR[m.name];
      if (map) m.color.setHex(map[kind] ?? map.default);
      m.roughness = 0.9;
      m.metalness = 0;
      if (kind === 'grass' || kind === 'bush' || kind === 'tuft' || kind === 'flower' || kind === 'lily' || m.name.startsWith('leafs')) m.side = THREE.DoubleSide;
    }
  });
}

export interface Placement {
  x: number;
  z: number;
  /** final size in world units (largest side, or height when `byHeight`) */
  size: number;
  rot: number;
  /** squash/stretch on y */
  yScale?: number;
  /** ground height under it (0 = the battlefield) */
  y?: number;
}

/** Instances `model` at every placement, normalised to the requested size. */
export function instance(
  parent: THREE.Object3D,
  model: THREE.Object3D,
  list: Placement[],
  opts: { byHeight: boolean; castShadow: boolean },
): void {
  if (!list.length) return;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const ref = Math.max(0.001, opts.byHeight ? size.y : Math.max(size.x, size.y, size.z));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
    list.forEach((p, i) => {
      const s = p.size / ref;
      const ys = s * (p.yScale ?? 1);
      m.compose(new THREE.Vector3(p.x, (p.y ?? 0) - box.min.y * ys, p.z), q.setFromEuler(e.set(0, p.rot, 0)), new THREE.Vector3(s, ys, s));
      inst.setMatrixAt(i, m.multiply(mesh.matrixWorld));
    });
    inst.castShadow = opts.castShadow;
    inst.receiveShadow = true;
    parent.add(inst);
  });
}

/** Loads every model of a kind and spreads `list` across them. */
export async function placeKind(
  parent: THREE.Object3D,
  kind: PropKind,
  list: Placement[],
  opts: { byHeight: boolean; castShadow: boolean },
): Promise<void> {
  const models = (await Promise.all(PROP_MODELS[kind].map(loadGltf))).filter((g): g is GLTF => !!g).map((g) => g.scene);
  models.forEach((m) => recolor(m, kind));
  models.forEach((m, mi) => instance(parent, m, list.filter((_, i) => i % models.length === mi), opts));
}

/** One placed copy that can be hidden and shown again (decor on a buildable cell). */
export interface TrackedCopy {
  mesh: THREE.InstancedMesh;
  index: number;
  matrix: THREE.Matrix4;
}

/**
 * Like `placeKind`, but every placement carries a key (a cell), and the copies
 * made for it are returned per key, so they can be hidden when a tower is built
 * on that cell and shown again when it is sold.
 */
export async function placeKindTracked(
  parent: THREE.Object3D,
  kind: PropKind,
  list: Array<Placement & { key: number }>,
  opts: { byHeight: boolean; castShadow: boolean },
  out: Map<number, TrackedCopy[]>,
): Promise<void> {
  const models = (await Promise.all(PROP_MODELS[kind].map(loadGltf))).filter((g): g is GLTF => !!g).map((g) => g.scene);
  models.forEach((m) => recolor(m, kind));
  models.forEach((model, mi) => {
    const mine = list.filter((_, i) => i % models.length === mi);
    if (!mine.length) return;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const ref = Math.max(0.001, opts.byHeight ? size.y : Math.max(size.x, size.y, size.z));
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, mine.length);
      mine.forEach((p, i) => {
        const s = p.size / ref;
        const ys = s * (p.yScale ?? 1);
        const m = new THREE.Matrix4()
          .compose(new THREE.Vector3(p.x, (p.y ?? 0) - box.min.y * ys, p.z), q.setFromEuler(e.set(0, p.rot, 0)), new THREE.Vector3(s, ys, s))
          .multiply(mesh.matrixWorld);
        inst.setMatrixAt(i, m);
        let copies = out.get(p.key);
        if (!copies) out.set(p.key, (copies = []));
        copies.push({ mesh: inst, index: i, matrix: m });
      });
      inst.castShadow = opts.castShadow;
      inst.receiveShadow = true;
      parent.add(inst);
    });
  });
}

/**
 * Turns many instanced props that never move into a handful of meshes: each
 * part's material colour is written into the geometry (vertex colours), so all
 * of them share one material per kind of surface (sides, flat shading, shadow).
 * Same picture, a few draw calls for the whole landscape. Instances are baked
 * into the geometry, so this is only for scenery that never changes.
 */
export function mergeStatic(parent: THREE.Object3D, meshes: THREE.InstancedMesh[]): void {
  const groups = new Map<string, { material: THREE.MeshStandardMaterial; geos: THREE.BufferGeometry[]; cast: boolean }>();
  const m = new THREE.Matrix4();
  for (const im of meshes) {
    const mat = im.material as THREE.MeshStandardMaterial;
    const key = `${mat.side}|${mat.flatShading}|${im.castShadow}`;
    let g = groups.get(key);
    if (!g) {
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: mat.side, flatShading: mat.flatShading });
      groups.set(key, (g = { material, geos: [], cast: im.castShadow }));
    }
    const src = (im.geometry.index ? im.geometry.toNonIndexed() : im.geometry.clone()) as THREE.BufferGeometry;
    for (const name of Object.keys(src.attributes)) if (name !== 'position' && name !== 'normal') src.deleteAttribute(name);
    if (!src.attributes.normal) src.computeVertexNormals();
    const n = src.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = mat.color ?? new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    src.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m);
      g.geos.push(src.clone().applyMatrix4(m));
    }
    src.dispose();
    parent.remove(im);
  }
  for (const g of groups.values()) {
    const merged = mergeGeometries(g.geos, false);
    for (const geo of g.geos) geo.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, g.material);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}
