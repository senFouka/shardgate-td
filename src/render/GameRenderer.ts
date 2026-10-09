import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { PARTICLE_SCALE, SHADOW_MAP_SIZE, type GraphicsDetails } from '../data/graphics';

/**
 * Owns the WebGL renderer and the post-processing chain, and applies the
 * graphics details live (no reload):
 *
 * - resolution: pixel ratio cap
 * - shadows: on/off and map size for every registered shadow light
 * - antialias: MSAA on the composer's render target (the canvas itself is
 *   created without AA so it can be switched at runtime)
 * - bloom / post: passes in the composer
 *
 * With none of AA, bloom or post the scene renders straight to the canvas.
 */
const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.14);
      // warm highlights, cool shadows: a golden-hour look
      c.rgb += vec3(0.035, 0.015, -0.025) * smoothstep(0.35, 0.9, l) + vec3(-0.012, 0.0, 0.025) * (1.0 - smoothstep(0.0, 0.35, l));
      vec2 d = vUv - 0.5; float v = smoothstep(0.9, 0.3, length(d * vec2(1.0, 0.8)));
      c.rgb *= mix(0.62, 1.0, v);
      gl_FragColor = c; }`,
};

/**
 * Only light brighter than this glows. Lit white surfaces (bone, pale stone)
 * reach about 1.2 under the sun; emissive crystals, fire and spells are 1.5+.
 */
const BLOOM_THRESHOLD = 1.35;

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private details: GraphicsDetails | null = null;
  private readonly shadowLights: THREE.DirectionalLight[] = [];
  private readonly resizeListeners: Array<() => void> = [];

  constructor(
    parent: HTMLElement,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    parent.appendChild(this.renderer.domElement);
    window.addEventListener('resize', () => this.resize());
  }

  /** The GPU name the browser reports ('' when hidden). */
  gpuName(): string {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  }

  /** Lights listed here follow the shadow setting. */
  addShadowLight(light: THREE.DirectionalLight): void {
    this.shadowLights.push(light);
    if (this.details) this.applyShadows(this.details);
  }

  onResize(fn: () => void): void {
    this.resizeListeners.push(fn);
  }

  get particleScale(): number {
    return this.details ? PARTICLE_SCALE[this.details.particles] : 1;
  }

  get current(): GraphicsDetails | null {
    return this.details;
  }

  apply(details: GraphicsDetails): void {
    const prev = this.details;
    this.details = { ...details };
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, details.resolution));
    if (!prev || prev.shadows !== details.shadows) this.applyShadows(details);
    if (!prev || prev.antialias !== details.antialias || prev.bloom !== details.bloom || prev.post !== details.post) {
      this.buildComposer(details);
    }
    this.resize();
  }

  private applyShadows(d: GraphicsDetails): void {
    const on = d.shadows !== 'off';
    const was = this.renderer.shadowMap.enabled;
    this.renderer.shadowMap.enabled = on;
    for (const light of this.shadowLights) {
      light.castShadow = on;
      if (on) {
        const size = SHADOW_MAP_SIZE[d.shadows as 'low' | 'high'];
        light.shadow.mapSize.set(size, size);
        light.shadow.map?.dispose();
        light.shadow.map = null;
      }
    }
    // turning shadows on or off changes every lit shader
    if (was !== on) {
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        for (const mat of Array.isArray(m) ? m : m ? [m] : []) mat.needsUpdate = true;
      });
    }
  }

  private buildComposer(d: GraphicsDetails): void {
    this.composer?.dispose();
    this.composer = null;
    if (!d.antialias && !d.bloom && !d.post) return;
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: d.antialias ? 4 : 0 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (d.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, BLOOM_THRESHOLD));
    if (d.post) composer.addPass(new ShaderPass(GRADE_SHADER));
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    for (const fn of this.resizeListeners) fn();
  }

  /** Drawing-buffer height in device pixels (for point-sprite sizing). */
  bufferHeight(): number {
    return this.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  }

  render(dt: number): void {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  /** Compiles every material in the scene now, so nothing hitches mid-fight. */
  async warmUp(): Promise<void> {
    await this.renderer.compileAsync(this.scene, this.camera);
    this.render(0.016);
  }
}
