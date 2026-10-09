import * as THREE from 'three';

/**
 * Every creep's health bar in one draw call: one camera-facing quad per
 * creep, the frame, dark back and coloured fill all drawn by the shader.
 * (Three meshes per creep before: 60 creeps cost 180 draws.)
 */
const MAX = 512;
const FRAME = 0.02;
const HEIGHT = 0.07;

const VERT = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec2 aSize;     // bar width, height (inner, world units)
  attribute vec4 aFill;     // rgb fill colour, a: fill fraction
  uniform float uFrame;
  varying vec2 vLocal;
  varying vec2 vSize;
  varying vec4 vFill;
  void main() {
    vec2 outer = aSize + vec2(uFrame * 2.0);
    vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
    mv.xy += position.xy * outer;
    gl_Position = projectionMatrix * mv;
    vLocal = position.xy * outer;
    vSize = aSize;
    vFill = aFill;
  }
`;

const FRAG = /* glsl */ `
  varying vec2 vLocal;
  varying vec2 vSize;
  varying vec4 vFill;
  void main() {
    vec2 half_ = vSize * 0.5;
    if (abs(vLocal.x) > half_.x || abs(vLocal.y) > half_.y) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.9);           // frame
    } else if ((vLocal.x + half_.x) / vSize.x <= vFill.a) {
      gl_FragColor = vec4(vFill.rgb, 1.0);               // health left
    } else {
      gl_FragColor = vec4(0.07, 0.047, 0.047, 0.85);     // missing health
    }
  }
`;

export class HealthBars {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly center: THREE.InstancedBufferAttribute;
  private readonly size: THREE.InstancedBufferAttribute;
  private readonly fill: THREE.InstancedBufferAttribute;
  private n = 0;

  constructor() {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.center = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.size = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.fill = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aCenter', this.center);
    this.geo.setAttribute('aSize', this.size);
    this.geo.setAttribute('aFill', this.fill);
    this.geo.instanceCount = 0;
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uFrame: { value: FRAME } }, transparent: true, depthTest: false, depthWrite: false }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 100;
  }

  /** Start a frame's list of bars. */
  begin(): void {
    this.n = 0;
  }

  /** One bar: world position of its centre, width, and health fraction 0..1. */
  add(x: number, y: number, z: number, width: number, frac: number): void {
    if (this.n >= MAX) return;
    const i = this.n++;
    const f = Math.max(0, Math.min(1, frac));
    (this.center.array as Float32Array).set([x, y, z], i * 3);
    (this.size.array as Float32Array).set([width, HEIGHT], i * 2);
    // green when healthy, through yellow, to red
    const r = f > 0.5 ? (1 - f) * 2 * 0.9 + 0.2 : 0.95;
    const g = f > 0.5 ? 0.88 : 0.2 + f * 1.3;
    (this.fill.array as Float32Array).set([r, g, 0.25, f], i * 4);
  }

  end(): void {
    this.geo.instanceCount = this.n;
    this.center.needsUpdate = true;
    this.size.needsUpdate = true;
    this.fill.needsUpdate = true;
  }
}
