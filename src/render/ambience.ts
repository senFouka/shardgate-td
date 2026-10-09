import * as THREE from 'three';
import { FIELD_HX, FIELD_HZ } from './terrain';

/**
 * Life in the air: drifting pollen and seeds by day, a few fireflies that
 * pulse, and slow cloud shadows gliding over the land. One draw call for the
 * motes (a point-sprite shader that moves them on the GPU) and one for the
 * cloud shadows. Per preset: the mote count follows the particle density.
 */
const MAX_MOTES = 900;

const MOTE_VERT = /* glsl */ `
  attribute vec4 aSeed;   // x, z start (world), phase, kind (0 pollen, 1 firefly)
  uniform float uTime;
  uniform float uScale;
  uniform vec2 uHalf;
  varying float vKind;
  varying float vAlpha;
  void main() {
    float t = uTime * (0.15 + fract(aSeed.z * 7.3) * 0.2);
    vec3 p = vec3(aSeed.x, 0.0, aSeed.y);
    // a slow wander; wraps around the field so the density stays even
    p.x += sin(t + aSeed.z * 6.28) * 1.6 + uTime * 0.12;
    p.z += cos(t * 0.8 + aSeed.z * 3.1) * 1.2;
    p.x = mod(p.x + uHalf.x, uHalf.x * 2.0) - uHalf.x;
    p.y = 0.35 + fract(aSeed.z * 13.7) * (aSeed.w > 0.5 ? 1.6 : 2.6) + sin(t * 2.3 + aSeed.z * 40.0) * 0.18;
    vKind = aSeed.w;
    vAlpha = aSeed.w > 0.5 ? pow(0.5 + 0.5 * sin(uTime * 2.1 + aSeed.z * 50.0), 3.0) : 0.55;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (aSeed.w > 0.5 ? 0.16 : 0.07) * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const MOTE_FRAG = /* glsl */ `
  varying float vKind;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, 1.6) * vAlpha;
    vec3 col = vKind > 0.5 ? vec3(1.9, 1.7, 0.6) : vec3(1.15, 1.1, 0.85);
    gl_FragColor = vec4(col * a, a);
  }
`;

const CLOUD_VERT = /* glsl */ `
  varying vec2 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const CLOUD_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec2 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  void main() {
    vec2 p = vWorld * 0.045 + vec2(uTime * 0.012, uTime * 0.006);
    float n = vnoise(p) * 0.6 + vnoise(p * 2.3) * 0.3 + vnoise(p * 5.1) * 0.1;
    float shade = smoothstep(0.52, 0.72, n) * 0.22;
    gl_FragColor = vec4(0.0, 0.02, 0.05, shade);
  }
`;

export interface Ambience {
  group: THREE.Group;
  update(time: number): void;
  setScale(bufferHeight: number, fov: number): void;
  setDensity(share: number): void;
}

export function buildAmbience(): Ambience {
  const group = new THREE.Group();
  let seed = 31337;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const half = new THREE.Vector2(FIELD_HX + 4, FIELD_HZ + 4);
  const seeds = new Float32Array(MAX_MOTES * 4);
  for (let i = 0; i < MAX_MOTES; i++) {
    const firefly = rnd() < 0.12 ? 1 : 0;
    seeds.set([(rnd() * 2 - 1) * half.x, (rnd() * 2 - 1) * half.y, rnd(), firefly], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_MOTES * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
  const moteMat = new THREE.ShaderMaterial({
    vertexShader: MOTE_VERT,
    fragmentShader: MOTE_FRAG,
    uniforms: { uTime: { value: 0 }, uScale: { value: 800 }, uHalf: { value: half } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const motes = new THREE.Points(geo, moteMat);
  motes.renderOrder = 15;
  group.add(motes);

  // cloud shadows: a big plane just above the ground, darkening in soft patches
  const cloudGeo = new THREE.PlaneGeometry(140, 140);
  cloudGeo.rotateX(-Math.PI / 2);
  const cloudMat = new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
  });
  const clouds = new THREE.Mesh(cloudGeo, cloudMat);
  clouds.position.y = 0.02;
  clouds.renderOrder = 3;
  group.add(clouds);

  return {
    group,
    update(time) {
      moteMat.uniforms.uTime.value = time;
      cloudMat.uniforms.uTime.value = time;
    },
    setScale(bufferHeight, fov) {
      moteMat.uniforms.uScale.value = bufferHeight / (2 * Math.tan((fov * Math.PI) / 360));
    },
    setDensity(share) {
      geo.setDrawRange(0, Math.round(MAX_MOTES * Math.max(0.15, Math.min(1, share))));
    },
  };
}
