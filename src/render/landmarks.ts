import * as THREE from 'three';
import { EXIT_NODE, SPAWN_NODE, nodeCenter } from '../data/map';
import { cellX, cellZ } from './coords';

/**
 * The two portals at the top of the map, our own design: a stone ring on two
 * pillars around a swirling vortex, blue where creeps come in and red where
 * they leave, with a small stone arch between them.
 */
export interface Landmarks {
  group: THREE.Group;
  update(time: number, dt: number): void;
}

const flat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

let glowTex: THREE.CanvasTexture | null = null;
export function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** A soft glow disc lying on the ground at (x, z). */
export function groundGlow(color: THREE.Color, radius: number, strength: number, x = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: color.clone().multiplyScalar(strength), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.03, z);
  m.renderOrder = 5;
  return m;
}

function shadowsOn(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && !(m.material as THREE.Material).transparent) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
}

function vortexMaterial(inner: THREE.Color, outer: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uInner: { value: inner }, uOuter: { value: outer } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uInner; uniform vec3 uOuter; varying vec2 vUv;
      void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; if (r > 1.0) discard;
        float a = atan(p.y, p.x);
        float swirl = sin(a * 5.0 + r * 9.0 - uTime * 4.0) * 0.5 + 0.5;
        float core = smoothstep(1.0, 0.0, r);
        vec3 col = mix(uOuter, uInner, swirl * core);
        gl_FragColor = vec4(col * core * (0.6 + swirl * 0.6), core); }`,
  });
}

function portal(x: number, z: number, inner: THREE.Color, outer: THREE.Color, stone: number): { group: THREE.Group; mat: THREE.ShaderMaterial } {
  const g = new THREE.Group();
  const s = flat(stone);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.3, 8), flat(0x5a5650));
  base.position.y = 0.15;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.22, 7, 20), s);
  ring.position.y = 1.45;
  ring.rotation.x = -0.35; // tilted toward the camera so the vortex reads from above
  const mat = vortexMaterial(inner, outer);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 40), mat);
  disc.position.y = 1.45;
  disc.rotation.x = -0.35;
  g.add(base, ring, disc);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.7, 0.4), s);
    pillar.position.set(side * 1.3, 1.35, 0);
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), flat(stone, { emissive: outer, emissiveIntensity: 1.2 }));
    cap.position.set(side * 1.3, 2.85, 0);
    g.add(pillar, cap);
  }
  shadowsOn(g);
  g.position.set(x, 0, z);
  g.add(groundGlow(outer, 2.4, 0.7));
  return { group: g, mat };
}

export function buildLandmarks(): Landmarks {
  const group = new THREE.Group();
  const s = nodeCenter(SPAWN_NODE[0], SPAWN_NODE[1]);
  const e = nodeCenter(EXIT_NODE[0], EXIT_NODE[1]);
  const z = cellZ(-1.4);
  const blue = portal(cellX(s.col), z, new THREE.Color(1.2, 2.2, 3.0), new THREE.Color(0.15, 0.55, 1.6), 0x4a5260);
  const red = portal(cellX(e.col), z, new THREE.Color(3.0, 1.4, 0.8), new THREE.Color(1.6, 0.25, 0.15), 0x5e4a46);
  group.add(blue.group, red.group);

  // a small stone arch between the portals
  const arch = new THREE.Group();
  const stone = flat(0x8d877c);
  const mid = (cellX(s.col) + cellX(e.col)) / 2;
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.8, 0.7), stone);
    leg.position.set(side * 0.7, 0.9, 0);
    arch.add(leg);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.4, 0.8), stone);
  top.position.y = 1.95;
  arch.add(top);
  shadowsOn(arch);
  arch.position.set(mid, 0, z - 0.4);
  group.add(arch);

  return {
    group,
    update(t) {
      blue.mat.uniforms.uTime.value = t;
      red.mat.uniforms.uTime.value = -t * 1.1;
    },
  };
}
