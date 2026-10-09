import * as THREE from 'three';
import { MAP } from '../data/map';
import { MARGIN, WATER_Y, groundHeight } from './terrain';

/**
 * The lake around the plateau: one plane with its own shader. The depth under
 * every point comes from the same height function as the ground (baked once
 * into a small texture), so the water is pale turquoise and foamy where it is
 * shallow, deep blue in the middle, and fades out exactly at the shore.
 * Ripples, sun glints and a little sky reflection move with time.
 * Cheap on every preset: one draw call, no extra render passes.
 */
const RES = 256;

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uDepth;
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying vec3 vWorld;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    float depth = texture2D(uDepth, vUv).r * 2.0;
    if (depth <= 0.01) discard;
    vec2 p = vWorld.xz;
    float t = uTime;
    // ripples: two drifting noise layers tilt the surface normal
    float h1 = vnoise(p * 1.3 + vec2(t * 0.35, t * 0.22));
    float h2 = vnoise(p * 2.7 - vec2(t * 0.28, -t * 0.4));
    float hx = vnoise(p * 1.3 + vec2(0.07, 0.0) + vec2(t * 0.35, t * 0.22)) - h1;
    float hz = vnoise(p * 1.3 + vec2(0.0, 0.07) + vec2(t * 0.35, t * 0.22)) - h1;
    vec3 n = normalize(vec3(-hx * 3.0 - (h2 - 0.5) * 0.15, 1.0, -hz * 3.0 - (h1 - 0.5) * 0.15));
    vec3 v = normalize(cameraPosition - vWorld);

    vec3 col = mix(uShallow, uDeep, smoothstep(0.05, 1.1, depth));
    // the sky in the water, stronger at grazing angles
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    col = mix(col, uSky, fres * 0.3 + 0.03);
    // sun glints
    vec3 r = reflect(-uSunDir, n);
    float spec = pow(max(dot(r, v), 0.0), 90.0);
    col += vec3(1.3, 1.2, 1.0) * spec * 0.45;
    // foam: a band along the shore that breathes, plus flecks in the shallows
    float shore = 1.0 - smoothstep(0.02, 0.22, depth);
    float bands = smoothstep(0.55, 0.85, sin(depth * 34.0 - t * 1.6 + vnoise(p * 3.0) * 4.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.08, 0.4, depth));
    float foam = clamp(shore * (0.5 + 0.45 * vnoise(p * 6.0 + t)) + bands * 0.3, 0.0, 1.0);
    col = mix(col, vec3(0.85, 0.92, 0.95), foam * 0.6);

    float alpha = smoothstep(0.0, 0.05, depth) * mix(0.72, 0.94, smoothstep(0.1, 0.9, depth));
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export interface Water {
  mesh: THREE.Mesh;
  update(time: number): void;
}

export function buildWater(sunDir: THREE.Vector3): Water {
  const w = MAP.cols + MARGIN * 2;
  const d = MAP.rows + MARGIN * 2;
  // depth below the surface, sampled where each texel lands on the plane
  const data = new Uint8Array(RES * RES * 4);
  for (let j = 0; j < RES; j++) {
    const z = d / 2 - ((j + 0.5) / RES) * d;
    for (let i = 0; i < RES; i++) {
      const x = -w / 2 + ((i + 0.5) / RES) * w;
      const depth = Math.max(0, WATER_Y - groundHeight(x, z));
      const v = Math.min(255, Math.round((depth / 2) * 255));
      data.set([v, v, v, 255], (j * RES + i) * 4);
    }
  }
  const depthTex = new THREE.DataTexture(data, RES, RES, THREE.RGBAFormat);
  depthTex.magFilter = THREE.LinearFilter;
  depthTex.minFilter = THREE.LinearFilter;
  depthTex.needsUpdate = true;

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uDepth: { value: null },
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(0.11, 0.4, 0.42) },
      uDeep: { value: new THREE.Color(0.015, 0.09, 0.17) },
      uSky: { value: new THREE.Color(0.4, 0.58, 0.72) },
      uSunDir: { value: sunDir.clone().normalize() },
    },
  ]);
  uniforms.uDepth.value = depthTex;
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true });
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER_Y;
  mesh.renderOrder = 1;
  return {
    mesh,
    update(time) {
      mat.uniforms.uTime.value = time;
    },
  };
}
