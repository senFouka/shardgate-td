import * as THREE from 'three';

/**
 * Draws the still parts of all towers together. After `bakeStatic`, a tower
 * is a few merged meshes (stone, gold, panels...) plus its moving parts.
 * Here the merged still meshes of every tower go into one `BatchedMesh` per
 * material, so forty towers cost about as many draw calls as one. Towers of
 * the same kind and level share their geometry (stored once).
 *
 * Left with the tower (not batched): moving parts (`dynamic()` in bake.ts)
 * and meshes whose material changes over time (`animatedMaterial()`), so
 * pulsing gems and glowing coals still pulse per tower.
 */
export function animatedMaterial<T extends THREE.Material>(m: T): T {
  m.userData.animated = true;
  return m;
}

export interface BatchHandle {
  parts: Array<{ batch: Batch; instance: number; local: THREE.Matrix4 }>;
}

interface Batch {
  mesh: THREE.BatchedMesh;
  /** geometry id per tower-kind part key */
  geometries: Map<string, number>;
  usedVertices: number;
  /** vertex capacity of the batch buffers */
  capacity: number;
}

const KEEP = ['position', 'normal', 'uv'];

/** Materials that look the same are one material (towers each create their own copies). */
function materialKey(m: THREE.Material): string {
  const s = m as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
  return [
    m.type, s.color?.getHexString(), s.emissive?.getHexString(), s.emissiveIntensity, s.roughness, s.metalness,
    s.map?.uuid, m.transparent, m.opacity, s.flatShading, m.blending, m.side, m.depthWrite,
    s.color ? `${s.color.r.toFixed(3)},${s.color.g.toFixed(3)},${s.color.b.toFixed(3)}` : '',
    s.emissive ? `${s.emissive.r.toFixed(3)},${s.emissive.g.toFixed(3)},${s.emissive.b.toFixed(3)}` : '',
  ].join('|');
}

function prepare(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.morphAttributes = {};
  return g;
}

export class TowerBatcher {
  readonly root = new THREE.Group();
  private readonly batches = new Map<string, Batch>();
  private readonly handles = new Set<BatchHandle>();
  private readonly tmp = new THREE.Matrix4();

  private batchFor(material: THREE.Material): Batch {
    const key = materialKey(material);
    let b = this.batches.get(key);
    if (!b) {
      const mesh = new THREE.BatchedMesh(32, 8192, 0, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // each instance is culled on its own
      this.root.add(mesh);
      b = { mesh, geometries: new Map(), usedVertices: 0, capacity: 8192 };
      this.batches.set(key, b);
    }
    return b;
  }

  /**
   * Moves a tower's still, non-animated meshes (direct children of its group)
   * into the batches. `kindKey` names the tower kind and level: towers with
   * the same key have the same geometry. Call after the group is placed.
   */
  adopt(group: THREE.Object3D, kindKey: string): BatchHandle {
    group.updateMatrixWorld(true);
    const handle: BatchHandle = { parts: [] };
    this.handles.add(handle);
    const meshes = group.children.filter((o): o is THREE.Mesh => {
      const m = o as THREE.Mesh;
      return !!m.isMesh && !m.userData.dynamic && !Array.isArray(m.material) && !(m.material as THREE.Material).userData.animated && !(m as THREE.SkinnedMesh).isSkinnedMesh;
    });
    meshes.forEach((m, i) => {
      const batch = this.batchFor(m.material as THREE.Material);
      const partKey = `${kindKey}:${i}:${m.geometry.attributes.position.count}`;
      let geometryId = batch.geometries.get(partKey);
      if (geometryId === undefined) {
        const geo = prepare(m.geometry);
        const need = geo.attributes.position.count;
        const bm = batch.mesh;
        if (batch.usedVertices + need > batch.capacity) {
          batch.capacity = Math.max(batch.capacity * 2, batch.usedVertices + need * 2);
          bm.setGeometrySize(batch.capacity, 0);
        }
        geometryId = bm.addGeometry(geo);
        batch.usedVertices += need;
        batch.geometries.set(partKey, geometryId);
        geo.dispose();
      }
      const bm = batch.mesh;
      if (bm.instanceCount >= bm.maxInstanceCount) bm.setInstanceCount(bm.maxInstanceCount * 2);
      const instance = bm.addInstance(geometryId);
      const local = m.matrix.clone();
      bm.setMatrixAt(instance, this.tmp.multiplyMatrices(group.matrixWorld, local));
      handle.parts.push({ batch, instance, local });
      m.parent?.remove(m);
    });
    // what stays with the tower is small moving detail (flames, rings, orbs, the turning head):
    // its shadow is barely visible but would cost a second draw each, so it casts none
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = false;
    });
    return handle;
  }

  /** Follows the tower group (it rises out of the ground while being built). */
  sync(handle: BatchHandle, group: THREE.Object3D): void {
    group.updateMatrixWorld(true);
    for (const p of handle.parts) p.batch.mesh.setMatrixAt(p.instance, this.tmp.multiplyMatrices(group.matrixWorld, p.local));
  }

  release(handle: BatchHandle): void {
    for (const p of handle.parts) p.batch.mesh.deleteInstance(p.instance);
    handle.parts.length = 0;
    this.handles.delete(handle);
  }

  /** Frees the batches' GPU buffers (the view is going away). */
  dispose(): void {
    for (const b of this.batches.values()) {
      this.root.remove(b.mesh);
      b.mesh.dispose();
    }
    this.batches.clear();
    this.handles.clear();
  }
}
