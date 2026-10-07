import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SECTION, decorations, type Decoration } from '../shared/layout';
import { CREEP_ASSETS, PROP_ASSETS } from '../shared/assets';
import type { CreepModel } from '../../src/render/creeps';
import { rand } from '../../src/render/particles';

/**
 * Scene pieces shared by the live 3D slice and the sprite baker (direction B
 * pre-renders exactly these): lighting, props, gates, creep models.
 */
export const PITCH_DEG = 56;
export const CAM_TARGET = new THREE.Vector3((SECTION.cols - 1) / 2, 0, (SECTION.rows - 1) / 2 + 0.3);

export function addLights(scene: THREE.Scene, shadows: boolean): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight(0xd8e8ff, 0x46351f, 1.15));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.7);
  sun.position.set(CAM_TARGET.x - 6, 14, CAM_TARGET.z - 6);
  sun.target.position.copy(CAM_TARGET);
  scene.add(sun, sun.target);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 11;
    sc.bottom = -11;
    sc.near = 1;
    sc.far = 40;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
  }
  return sun;
}

const loader = new GLTFLoader();
export const loadGltf = (url: string) =>
  new Promise<GLTF | null>((resolve) =>
    loader.load(url, resolve, undefined, (e) => {
      console.warn('model failed', url, e);
      resolve(null);
    }),
  );

/** Target size in cells: trees by height, the rest by their largest side. */
const PROP_SIZE: Record<Decoration['kind'], { size: number; byHeight: boolean }> = {
  rock: { size: 0.8, byHeight: false },
  tree: { size: 1.9, byHeight: true },
  bush: { size: 0.65, byHeight: false },
  grass: { size: 0.4, byHeight: false },
  crystal: { size: 0.6, byHeight: true },
};

/** Our palette for the kit's material names (CC0 allows recolouring). */
const RECOLOR: Record<string, Partial<Record<Decoration['kind'], number>> & { default: number }> = {
  grass: { default: 0x5e8c36, rock: 0x6f9a3e, bush: 0x4f7d2f },
  leafsGreen: { default: 0x4c7a2e },
  dirt: { default: 0x8d877c, rock: 0x8d877c },
  woodBark: { default: 0x6b4a2e },
};

function recolor(model: THREE.Object3D, kind: Decoration['kind']): void {
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

/** Props are instanced per (model, mesh): a handful of draw calls for all of them. */
export async function buildProps(scene: THREE.Scene, castShadows: boolean): Promise<void> {
  const byKind = new Map<Decoration['kind'], Decoration[]>();
  for (const d of decorations()) byKind.set(d.kind, [...(byKind.get(d.kind) ?? []), d]);
  for (const [kind, list] of byKind) {
    const urls = kind === 'crystal' ? [] : PROP_ASSETS[kind];
    const models = (await Promise.all(urls.map(loadGltf))).filter((g): g is GLTF => !!g).map((g) => g.scene);
    for (const m of models) recolor(m, kind);
    const protos = models.length ? models : [proceduralProp(kind)];
    protos.forEach((m, mi) =>
      instanceModel(scene, m, list.filter((_, i) => i % protos.length === mi), PROP_SIZE[kind], castShadows && kind !== 'grass'),
    );
  }
}

function instanceModel(
  scene: THREE.Scene,
  model: THREE.Object3D,
  list: Decoration[],
  target: { size: number; byHeight: boolean },
  cast: boolean,
): void {
  if (!list.length) return;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const norm = target.size / Math.max(0.001, target.byHeight ? size.y : Math.max(size.x, size.y, size.z));
  const m = new THREE.Matrix4();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
    list.forEach((d, i) => {
      const s = d.scale * norm;
      m.compose(
        new THREE.Vector3(d.x, -box.min.y * s, d.y),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, d.rot, 0)),
        new THREE.Vector3(s, s, s),
      );
      inst.setMatrixAt(i, m.multiply(mesh.matrixWorld));
    });
    inst.castShadow = cast;
    inst.receiveShadow = true;
    scene.add(inst);
  });
}

function proceduralProp(kind: Decoration['kind']): THREE.Object3D {
  const g = new THREE.Group();
  const flat = (c: number, extra = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9, ...extra });
  if (kind === 'rock') {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), flat(0x77736b));
    m.scale.set(1.2, 0.75, 1);
    m.position.y = 0.15;
    g.add(m);
  } else if (kind === 'tree') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.6, 6), flat(0x5a3d24));
    trunk.position.y = 0.3;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55 - i * 0.13, 0.7, 7), flat([0x2f5a2a, 0x3a6b30, 0x467a36][i]));
      cone.position.y = 0.75 + i * 0.36;
      g.add(cone);
    }
  } else if (kind === 'bush') {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), flat(0x3f7a33));
    m.position.y = 0.18;
    m.scale.y = 0.75;
    g.add(m);
  } else if (kind === 'grass') {
    const geo = new THREE.ConeGeometry(0.035, 0.26, 3);
    for (let i = 0; i < 5; i++) {
      const blade = new THREE.Mesh(geo, flat(0x6a9a3a));
      blade.position.set(rand(-0.09, 0.09), 0.13, rand(-0.09, 0.09));
      blade.rotation.z = rand(-0.35, 0.35);
      g.add(blade);
    }
  } else {
    const color = new THREE.Color(0.75, 0.45, 1.0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6a3c9a, emissive: color, emissiveIntensity: 1.2, flatShading: true });
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.09 + i * 0.03, 0), mat);
      m.scale.y = 2.4;
      m.position.set([-0.1, 0.08, 0.02][i], 0.18 + i * 0.03, [0.05, 0.08, -0.1][i]);
      m.rotation.set([0.3, -0.25, 0.1][i], 0, [-0.2, 0.3, 0.35][i]);
      g.add(m);
    }
  }
  return g;
}

/* ------------------------------------------------------ spawn and exit */

export interface Gates {
  group: THREE.Group;
  update(time: number, dt: number): void;
}

export function buildGates(withLights: boolean): Gates {
  const group = new THREE.Group();
  const portalMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; if (r > 1.0) discard;
        float a = atan(p.y, p.x);
        float swirl = sin(a * 5.0 + r * 9.0 - uTime * 4.0) * 0.5 + 0.5;
        float core = smoothstep(1.0, 0.0, r);
        vec3 col = mix(vec3(0.5, 0.1, 1.4), vec3(2.2, 0.9, 2.6), swirl * core);
        gl_FragColor = vec4(col * core * (0.6 + swirl * 0.6), core); }`,
  });
  // spawn portal: a stone ring on two pillars around a vortex
  const spawn = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x4a4450, flatShading: true, roughness: 0.9 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.13, 6, 14), stone);
  ring.position.y = 0.78;
  ring.castShadow = true;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.56, 32), portalMat);
  disc.position.y = 0.78;
  spawn.add(ring, disc);
  for (const s of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.6, 0.24), stone);
    pillar.position.set(0, 0.8, s * 0.8);
    pillar.castShadow = true;
    spawn.add(pillar);
  }
  spawn.rotation.y = Math.PI / 2;
  spawn.position.set(-0.7, 0, 2);
  group.add(spawn);
  if (withLights) {
    const l = new THREE.PointLight(0xb070ff, 3, 4, 1.5);
    l.position.set(-0.45, 0.8, 2);
    group.add(l);
  }

  // exit: the Shardgate, two pillars and a floating golden shard
  const exit = new THREE.Group();
  const pale = new THREE.MeshStandardMaterial({ color: 0xcfc6b0, flatShading: true, roughness: 0.8 });
  for (const s of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.6, 6), pale);
    pillar.position.set(0, 0.8, s * 0.7);
    pillar.castShadow = true;
    exit.add(pillar);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 1.8), pale);
  lintel.position.y = 1.65;
  lintel.castShadow = true;
  exit.add(lintel);
  const shard = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.22, 0),
    new THREE.MeshStandardMaterial({ color: 0xb8862a, emissive: new THREE.Color(1.0, 0.72, 0.25), emissiveIntensity: 2.2, flatShading: true }),
  );
  shard.scale.y = 1.8;
  shard.position.y = 0.95;
  exit.add(shard);
  exit.position.set(15.7, 0, 7);
  group.add(exit);
  return {
    group,
    update(time, dt) {
      portalMat.uniforms.uTime.value = time;
      shard.rotation.y += dt;
      shard.position.y = 0.95 + Math.sin(time * 1.8) * 0.08;
    },
  };
}

/* -------------------------------------------------------------- creeps */

export async function loadCreepModels(): Promise<{ grunt: CreepModel; brute: CreepModel }> {
  const out = {} as { grunt: CreepModel; brute: CreepModel };
  for (const kind of ['grunt', 'brute'] as const) {
    const a = CREEP_ASSETS[kind];
    const g = a ? await loadGltf(a.url) : null;
    const attach: NonNullable<CreepModel['attach']> = [];
    for (const at of a?.attach ?? []) {
      const ag = await loadGltf(at.url);
      if (ag) attach.push({ gltf: ag, bone: at.bone });
    }
    out[kind] = g && a
      ? { gltf: g, height: a.height, yaw: a.yaw, attach }
      : { gltf: proceduralCreepGltf(kind), height: kind === 'brute' ? 0.8 : 0.55, yaw: 0 };
  }
  return out;
}

/** Fallback creep when no model is available. */
function proceduralCreepGltf(kind: 'grunt' | 'brute'): GLTF {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.3, 0),
    new THREE.MeshStandardMaterial({ color: kind === 'grunt' ? 0x7a4a8a : 0x8a3a2a, flatShading: true }),
  );
  body.scale.set(1.3, 0.8, 1);
  body.position.y = 0.3;
  g.add(body);
  return { scene: g, animations: [] } as unknown as GLTF;
}
