import * as THREE from 'three';

/**
 * The creep route: a trail of soft glowing dots on the lanes, blue near the
 * entry portal and red near the exit, with pulses flowing toward the exit so
 * the direction reads at any zoom.
 */
const VERT = /* glsl */ `
  attribute float aIdx;
  attribute vec3 aColor;
  varying vec3 vColor;
  uniform float uScale;
  uniform float uTime;
  varying float vGlow;
  void main() {
    vColor = aColor;
    float wave = fract(aIdx * 0.03 - uTime * 0.35);
    vGlow = 0.28 + 0.9 * pow(wave, 6.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = (0.34 + 0.26 * pow(wave, 6.0)) * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vGlow;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, 1.5) * vGlow;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

export class RouteView {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 600 }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(new THREE.BufferGeometry(), this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
  }

  /** Dots every half unit along a world-space polyline [x, z], fading from blue at the start to red at the end. */
  setRoute(points: Array<[number, number]>): void {
    const pos: number[] = [];
    const idx: number[] = [];
    const col: number[] = [];
    const start = new THREE.Color(0.35, 0.85, 2.0);
    const end = new THREE.Color(2.0, 0.45, 0.25);
    let total = 0;
    for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    let k = 0;
    let walked = 0;
    for (let i = 1; i < points.length; i++) {
      const [x0, z0] = points[i - 1];
      const [x1, z1] = points[i];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const steps = Math.max(1, Math.round(len / 0.5));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        pos.push(x0 + (x1 - x0) * t, 0.06, z0 + (z1 - z0) * t);
        idx.push(k++);
        const c = start.clone().lerp(end, (walked + len * t) / total);
        col.push(c.r, c.g, c.b);
      }
      walked += len;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aIdx', new THREE.Float32BufferAttribute(idx, 1));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    this.points.geometry.dispose();
    this.points.geometry = geo;
  }

  setScale(drawingBufferHeight: number, fovDeg: number): void {
    this.material.uniforms.uScale.value = drawingBufferHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  update(time: number): void {
    this.material.uniforms.uTime.value = time;
  }
}
