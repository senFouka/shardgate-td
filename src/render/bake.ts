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
 * Anything that animates by itself (a turning head, a flame, a ring of
 * orbiting stones) must be marked with `dynamic()` before baking. A marked
 * mesh is left alone; the still pieces inside a marked part are merged with
 * each other, relative to that part, so they keep moving with it.
 * Call on a freshly built object whose root is still at the origin.
 */
export function dynamic<T extends THREE.Object3D>(o: T): T {
  o.userData.dynamic = true;
  return o;
}

/** The part a mesh moves with: its nearest marked ancestor, or the root. */
function anchorOf(o: THREE.Object3D, root: THREE.Object3D): THREE.Object3D {
  for (let p: THREE.Object3D | null = o.parent; p && p !== root; p = p.parent) if (p.userData.dynamic) return p;
  return root;
}

const KEEP = ['position', 'normal', 'uv'];

export function bakeStatic(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const groups = new Map<string, { anchor: THREE.Object3D; material: THREE.Material; meshes: THREE.Mesh[]; cast: boolean; receive: boolean }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    if (Array.isArray(m.material) || m.userData.dynamic) return;
    const anchor = anchorOf(m, root);
    const key = anchor.uuid + ':' + m.material.uuid;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { anchor, material: m.material, meshes: [], cast: false, receive: false }));
    g.meshes.push(m);
    g.cast ||= m.castShadow;
    g.receive ||= m.receiveShadow;
  });
  const local = new THREE.Matrix4();
  for (const g of groups.values()) {
    if (g.meshes.length < 2) {
      // a lone piece moves up to its part (same place on screen), so batching can find it
      const m = g.meshes[0];
      if (m.parent !== g.anchor) g.anchor.attach(m);
      continue;
    }
    const inverseAnchor = new THREE.Matrix4().copy(g.anchor.matrixWorld).invert();
    const geos: THREE.BufferGeometry[] = [];
    for (const m of g.meshes) {
      let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(geo.attributes)) if (!KEEP.includes(name)) geo.deleteAttribute(name);
      if (!geo.attributes.uv) {
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      }
      if (!geo.attributes.normal) geo.computeVertexNormals();
      geo.morphAttributes = {};
      geo = geo.applyMatrix4(local.multiplyMatrices(inverseAnchor, m.matrixWorld));
      geos.push(geo);
    }
    const merged = mergeGeometries(geos, false);
    for (const geo of geos) geo.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, g.material);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    for (const m of g.meshes) m.parent?.remove(m);
    g.anchor.add(mesh);
  }
}
