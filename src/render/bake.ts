import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Draw-call saver for objects built from many small meshes (our towers are
 * ~25 pieces each, and every piece is drawn twice: shadow pass + main pass).
 * Every mesh that never moves on its own is merged with the others that share
 * its material, so a tower becomes a handful of meshes. It looks exactly the
 * same: geometry is only pre-transformed, materials are shared as before (so
 * glowing gems still pulse through their material).
 *
 * Anything that animates by itself (a turning head, a flame, orbiting stones)
 * must be marked with `dynamic()` before baking; it and its children are left
 * alone. Call on a freshly built object whose root is still at the origin.
 */
export function dynamic<T extends THREE.Object3D>(o: T): T {
  o.userData.dynamic = true;
  return o;
}

function isDynamic(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return true;
  return false;
}

const KEEP = ['position', 'normal', 'uv'];

export function bakeStatic(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<THREE.Material, { meshes: THREE.Mesh[]; cast: boolean; receive: boolean }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    if (Array.isArray(m.material) || isDynamic(m, root)) return;
    let g = groups.get(m.material);
    if (!g) groups.set(m.material, (g = { meshes: [], cast: false, receive: false }));
    g.meshes.push(m);
    g.cast ||= m.castShadow;
    g.receive ||= m.receiveShadow;
  });
  const local = new THREE.Matrix4();
  for (const [material, g] of groups) {
    if (g.meshes.length < 2) continue;
    const geos: THREE.BufferGeometry[] = [];
    for (const m of g.meshes) {
      let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(geo.attributes)) if (!KEEP.includes(name)) geo.deleteAttribute(name);
      if (!geo.attributes.uv) {
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      }
      if (!geo.attributes.normal) geo.computeVertexNormals();
      geo.morphAttributes = {};
      geo = geo.applyMatrix4(local.multiplyMatrices(inverseRoot, m.matrixWorld));
      geos.push(geo);
    }
    const merged = mergeGeometries(geos, false);
    for (const geo of geos) geo.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    for (const m of g.meshes) m.parent?.remove(m);
    root.add(mesh);
  }
}
