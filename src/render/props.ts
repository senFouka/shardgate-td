import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

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
} as const;
export type PropKind = keyof typeof PROP_MODELS;

/** Our palette for the Kenney Nature Kit's material names (CC0 allows recolouring). */
const RECOLOR: Record<string, { default: number } & Partial<Record<PropKind, number>>> = {
  grass: { default: 0x5e8c36, rock: 0x6f9a3e, rockTall: 0x6f9a3e, bush: 0x4f7d2f },
  leafsGreen: { default: 0x4c7a2e },
  dirt: { default: 0x8d877c },
  woodBark: { default: 0x6b4a2e },
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
      if (kind === 'grass' || kind === 'bush' || m.name.startsWith('leafs')) m.side = THREE.DoubleSide;
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
      m.compose(new THREE.Vector3(p.x, -box.min.y * ys, p.z), q.setFromEuler(e.set(0, p.rot, 0)), new THREE.Vector3(s, ys, s));
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
