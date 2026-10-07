import '../shared/perf';
import '../../src/ui/ui.css';
import * as THREE from 'three';
import { SECTION, TOWERS, type TowerSpot } from '../shared/layout';
import { SliceSim, type Shot } from '../shared/sim';
import { mountHud } from '../shared/hud';
import { buildTerrain } from './terrain';
import { Particles, rand, randDir } from '../../src/render/particles';
import { createTower, radialTexture, type TowerView } from './towers';
import { createCreepView, type CreepModel, type CreepView } from '../../src/render/creeps';
import { CAM_TARGET, PITCH_DEG, addLights, buildGates, buildProps, loadCreepModels, type Gates } from './world';
import { METEOR_RADIUS } from '../shared/layout';
import { GameRenderer } from '../../src/render/GameRenderer';
import { GraphicsController, type GraphicsStore } from '../../src/render/GraphicsController';
import { normalizeGraphics, type GraphicsSettings, type Preset } from '../../src/data/graphics';
import { SettingsPanel } from '../../src/ui/SettingsPanel';
import { mountCornerButtons } from '../../src/ui/Hud';
import { toast } from '../../src/ui/Toast';
import { gameEvents } from '../../src/core/EventBus';

const hud = mountHud('A — 3D (Three.js)');

/* ------------------------------------------------------------ renderer */

const gameDiv = document.createElement('div');
gameDiv.id = 'game';
document.body.appendChild(gameDiv);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3a2a);
scene.fog = new THREE.Fog(0x2a3a2a, 18, 34);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
const camTarget = CAM_TARGET.clone();
const PITCH = THREE.MathUtils.degToRad(PITCH_DEG);
let camDist = 16;
const shake = { t: 0, strength: 0 };

const gr = new GameRenderer(gameDiv, scene, camera);
/** particle density multiplier from the graphics settings */
const PS = () => gr.particleScale;

// the slice keeps its graphics settings in localStorage (the game uses the profile)
const STORE_KEY = 'shardgate-slice:graphics';
const store: GraphicsStore = {
  graphics: (() => {
    try {
      return normalizeGraphics(JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null'));
    } catch {
      return normalizeGraphics(null);
    }
  })(),
  setGraphics(g: GraphicsSettings) {
    this.graphics = g;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(g));
    } catch {
      /* storage may be unavailable */
    }
  },
};

function fitCamera(): void {
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const needW = SECTION.cols + 0.6;
  const needH = (SECTION.rows - 0.4) * Math.sin(PITCH) + 1.2;
  camDist = Math.max(needW / camera.aspect, needH) / (2 * tanHalf);
  const dbh = gr.bufferHeight();
  for (const p of [fxAdd, fxSmoke]) p.setScale(dbh, camera.fov);
}

function placeCamera(): void {
  const off = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH)).multiplyScalar(camDist);
  camera.position.copy(camTarget).add(off);
  if (shake.t > 0) {
    const k = shake.strength * shake.t;
    camera.position.x += (Math.random() - 0.5) * k;
    camera.position.y += (Math.random() - 0.5) * k;
  }
  camera.lookAt(camTarget);
}

gr.addShadowLight(addLights(scene, true));

/* ---------------------------------------------------------- particles */

const fxAdd = new Particles(6000, true);
const fxSmoke = new Particles(2000, false, 1.2);
scene.add(fxAdd.points, fxSmoke.points);

/* ------------------------------------------------------------ graphics */

const graphics = new GraphicsController(gr, store);
// ?gfx=low|medium|high forces a preset (used by the measurement harness)
const forced = new URLSearchParams(location.search).get('gfx');
if (forced === 'low' || forced === 'medium' || forced === 'high') graphics.setPreset(forced as Preset);
gameEvents.on('graphics:changed', ({ preset, reason }) => {
  if (reason === 'auto') toast(`Graphics lowered to ${preset} for smoother play. You can change it in Settings.`);
});
let menuOpen = false;
const settings = new SettingsPanel(graphics, { onOpen: () => (menuOpen = true), onClose: () => (menuOpen = false) });
mountCornerButtons(() => settings.open());

/* -------------------------------------------------------------- world */

scene.add(buildTerrain(gr.renderer.capabilities.getMaxAnisotropy()));
gr.onResize(fitCamera);
fitCamera();

/* -------------------------------------------------------------- towers */

const towerViews = new Map<TowerSpot, TowerView>();
for (const t of TOWERS) {
  // emissive crystals + ground glow instead of real point lights (8 lights cost ~30% fps)
  const v = createTower(t.kind, t.level, fxAdd, false);
  v.group.position.set(t.col, 0, t.row);
  v.group.scale.setScalar(1.2);
  scene.add(v.group);
  towerViews.set(t, v);
}

/* -------------------------------------------------------------- creeps */

let creepModels: { grunt: CreepModel; brute: CreepModel } | null = null;
let gates: Gates | null = null;
const sim = new SliceSim();
const creepViews = new Map<number, CreepView>();
const corpses: Array<{ view: CreepView; ttl: number; c: import('../shared/sim').Creep }> = [];
let kills = 0;
let gold = 120;

/* ----------------------------------------------------------- shot visuals */

const shardGeo = new THREE.OctahedronGeometry(0.07, 0);
shardGeo.scale(1, 3.2, 1);
shardGeo.rotateX(Math.PI / 2);
const shardMat = new THREE.MeshStandardMaterial({ color: 0xbff0ff, emissive: new THREE.Color(0.5, 1.2, 1.6), emissiveIntensity: 2.2, flatShading: true });
const shotMeshes = new Map<number, THREE.Mesh>();
const shotStartY = new Map<number, number>();

function shotWorld(s: Shot): THREE.Vector3 {
  const y0 = shotStartY.get(s.id) ?? 1.2;
  return new THREE.Vector3(s.x, s.z * y0, s.y);
}

function updateShotVisual(s: Shot, dt: number): void {
  const p = shotWorld(s);
  if (s.tower.kind === 'bolt') {
    fxAdd.emit({ x: p.x, y: p.y, z: p.z, size: s.tower.level === 2 ? 0.28 : 0.22, sizeEnd: 0.05, r: 2.2, g: 2.8, b: 3.6, life: 0.12 });
    fxAdd.emit({ x: p.x + rand(-0.03, 0.03), y: p.y, z: p.z + rand(-0.03, 0.03), size: 0.09, r: 1.2, g: 1.8, b: 3, life: 0.3 });
  } else if (s.tower.kind === 'ember') {
    const big = s.tower.level === 2;
    fxAdd.emit({ x: p.x, y: p.y, z: p.z, size: big ? 0.5 : 0.4, sizeEnd: 0.1, r: 3.2, g: 1.6, b: 0.4, life: 0.1 });
    for (let i = 0; i < Math.max(1, Math.round(3 * PS())); i++) {
      fxAdd.emit({ x: p.x + rand(-0.06, 0.06), y: p.y + rand(-0.06, 0.06), z: p.z + rand(-0.06, 0.06), vy: rand(0.2, 0.6), size: rand(0.2, 0.32), sizeEnd: 0.03, r: 3, g: rand(0.7, 1.2), b: 0.15, life: rand(0.25, 0.45), drag: 1 });
    }
    if (Math.random() < 0.5 * PS()) fxSmoke.emit({ x: p.x, y: p.y, z: p.z, vy: 0.4, size: 0.2, sizeEnd: 0.5, r: 0.12, g: 0.1, b: 0.09, alpha: 0.5, life: 0.8 });
  } else {
    let m = shotMeshes.get(s.id);
    if (!m) {
      m = new THREE.Mesh(shardGeo, shardMat);
      scene.add(m);
      shotMeshes.set(s.id, m);
    }
    m.position.copy(p);
    const dir = new THREE.Vector3(s.target.x - s.x, 0, s.target.y - s.y);
    if (dir.lengthSq() > 1e-6) m.lookAt(p.clone().add(dir));
    m.scale.setScalar(s.tower.level === 2 ? 1.35 : 1);
    if (Math.random() < dt * 60) fxAdd.emit({ x: p.x, y: p.y, z: p.z, vx: rand(-0.2, 0.2), vy: rand(-0.1, 0.2), vz: rand(-0.2, 0.2), size: 0.14, sizeEnd: 0.02, r: 1.1, g: 2, b: 3, life: 0.35 });
  }
}

function impact(kind: TowerSpot['kind'], level: number, x: number, y: number, z: number): void {
  const n = PS();
  if (kind === 'bolt') {
    for (let i = 0; i < 10 * n; i++) {
      const [dx, dy, dz] = randDir();
      fxAdd.emit({ x, y, z, vx: dx * 2.5, vy: Math.abs(dy) * 2.5, vz: dz * 2.5, size: 0.08, sizeEnd: 0.01, r: 2, g: 2.6, b: 3.5, life: 0.25, drag: 4, gravity: 3 });
    }
    fxAdd.emit({ x, y, z, size: 0.55, sizeEnd: 0.1, r: 1.6, g: 2, b: 3, life: 0.12 });
  } else if (kind === 'ember') {
    fxAdd.emit({ x, y, z, size: level === 2 ? 1.3 : 1, sizeEnd: 0.3, r: 3, g: 1.4, b: 0.3, life: 0.18 });
    for (let i = 0; i < 22 * n; i++) {
      const [dx, dy, dz] = randDir();
      fxAdd.emit({ x, y, z, vx: dx * 2.2, vy: Math.abs(dy) * 2.6, vz: dz * 2.2, size: rand(0.1, 0.22), sizeEnd: 0.02, r: 3, g: rand(0.6, 1.3), b: 0.15, life: rand(0.3, 0.6), drag: 2.5, gravity: 2 });
    }
    for (let i = 0; i < 4 * n; i++) fxSmoke.emit({ x: x + rand(-0.1, 0.1), y, z: z + rand(-0.1, 0.1), vy: rand(0.3, 0.7), size: 0.3, sizeEnd: 0.8, r: 0.1, g: 0.09, b: 0.08, alpha: 0.55, life: 1.0, drag: 1 });
  } else {
    fxAdd.emit({ x, y, z, size: 0.8, sizeEnd: 0.2, r: 1.2, g: 2.2, b: 3, life: 0.16 });
    for (let i = 0; i < 16 * n; i++) {
      const [dx, dy, dz] = randDir();
      fxAdd.emit({ x, y, z, vx: dx * 2, vy: Math.abs(dy) * 2.2, vz: dz * 2, size: rand(0.06, 0.12), sizeEnd: 0.02, r: 1.6, g: 2.4, b: 3.2, life: rand(0.35, 0.6), drag: 2, gravity: 4 });
    }
    for (let i = 0; i < 5 * n; i++) fxSmoke.emit({ x, y: 0.15, z, vx: rand(-0.6, 0.6), vz: rand(-0.6, 0.6), size: 0.3, sizeEnd: 0.7, r: 0.85, g: 0.95, b: 1, alpha: 0.35, life: 0.8, drag: 2 });
  }
}

/* --------------------------------------------------------------- meteor */

interface Meteor {
  mesh: THREE.Mesh;
  ring: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
}
const meteors: Meteor[] = [];
const ringTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.75, 'rgba(255,255,255,0.15)');
  grd.addColorStop(0.92, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();
const flashLight = new THREE.PointLight(0xff8a3a, 0, 8, 1.4);
scene.add(flashLight);
const shockwaves: Array<{ mesh: THREE.Mesh; t: number }> = [];
const scorches: Array<{ mesh: THREE.Mesh; t: number }> = [];

function groundDecal(tex: THREE.Texture, color: THREE.Color, size: number, additive: boolean): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 6;
  return m;
}

const meteorMat = new THREE.MeshStandardMaterial({ color: 0x2a1a12, emissive: new THREE.Color(1, 0.4, 0.1), emissiveIntensity: 2.5, flatShading: true });
const meteorGeo = new THREE.DodecahedronGeometry(0.28, 0);

function startMeteor(x: number, z: number, delay: number): void {
  const mesh = new THREE.Mesh(
    meteorGeo,
    meteorMat,
  );
  scene.add(mesh);
  const ring = groundDecal(ringTex, new THREE.Color(2.5, 0.5, 0.15), METEOR_RADIUS * 2.2, true);
  ring.position.set(x, 0.04, z);
  scene.add(ring);
  meteors.push({ mesh, ring, from: new THREE.Vector3(x + 4, 11, z - 5), to: new THREE.Vector3(x, 0.2, z), t: 0, dur: delay });
}

function meteorImpact(x: number, z: number): void {
  const n = PS();
  shake.t = 1;
  shake.strength = 0.25;
  flashLight.position.set(x, 1.2, z);
  flashLight.intensity = 40;
  fxAdd.emit({ x, y: 0.5, z, size: 4.5, sizeEnd: 1, r: 3, g: 1.8, b: 0.8, life: 0.25 });
  for (let i = 0; i < 140 * n; i++) {
    const [dx, dy, dz] = randDir();
    const sp = rand(1.5, 5.5);
    fxAdd.emit({ x, y: 0.3, z, vx: dx * sp, vy: Math.abs(dy) * sp * 1.1, vz: dz * sp, size: rand(0.12, 0.35), sizeEnd: 0.03, r: 3, g: rand(0.5, 1.4), b: 0.12, life: rand(0.5, 1.2), drag: 1.6, gravity: 5 });
  }
  for (let i = 0; i < 40 * n; i++) {
    const a = Math.random() * Math.PI * 2;
    fxAdd.emit({ x: x + Math.cos(a) * 0.3, y: 0.15, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * 5, vz: Math.sin(a) * 5, size: 0.5, sizeEnd: 0.1, r: 2.6, g: 1, b: 0.2, life: 0.4, drag: 4 });
  }
  for (let i = 0; i < 30 * n; i++) {
    fxSmoke.emit({ x: x + rand(-0.6, 0.6), y: 0.3, z: z + rand(-0.6, 0.6), vx: rand(-1, 1), vy: rand(0.6, 1.6), vz: rand(-1, 1), size: 0.6, sizeEnd: 1.8, r: 0.09, g: 0.07, b: 0.06, alpha: 0.6, life: rand(1.4, 2.2), drag: 1.2 });
  }
  for (let i = 0; i < 24 * n; i++) {
    const [dx, , dz] = randDir();
    fxSmoke.emit({ x, y: 0.3, z, vx: dx * 4, vy: rand(2, 5), vz: dz * 4, size: 0.12, r: 0.2, g: 0.13, b: 0.1, alpha: 1, life: 1.0, gravity: 9 });
  }
  const wave = groundDecal(ringTex, new THREE.Color(3, 1.3, 0.4), 1, true);
  wave.position.set(x, 0.05, z);
  scene.add(wave);
  shockwaves.push({ mesh: wave, t: 0 });
  const scorch = groundDecal(radialTexture(), new THREE.Color(0, 0, 0), METEOR_RADIUS * 2.3, false);
  (scorch.material as THREE.MeshBasicMaterial).opacity = 0.75;
  scorch.position.set(x, 0.03, z);
  scene.add(scorch);
  scorches.push({ mesh: scorch, t: 0 });
}

/* --------------------------------------------------------------- events */

sim.on((e) => {
  if (e.type === 'spawn') {
    const model = creepModels![e.creep.kind];
    const view = createCreepView(model, e.creep.kind === 'brute');
    scene.add(view.root);
    creepViews.set(e.creep.id, view);
    for (let i = 0; i < 14; i++) fxAdd.emit({ x: -0.45, y: rand(0.2, 1.2), z: 2 + rand(-0.4, 0.4), vx: rand(0.5, 1.5), vy: rand(-0.2, 0.3), size: 0.12, r: 2, g: 0.8, b: 3, life: 0.5, drag: 2 });
  } else if (e.type === 'fire') {
    const tv = towerViews.get(e.shot.tower)!;
    tv.onFire();
    const p = new THREE.Vector3();
    tv.muzzle.getWorldPosition(p);
    shotStartY.set(e.shot.id, p.y);
  } else if (e.type === 'hit') {
    const p = shotWorld(e.shot);
    impact(e.shot.tower.kind, e.shot.tower.level, p.x, Math.max(0.3, p.y), p.z);
    const m = shotMeshes.get(e.shot.id);
    if (m) {
      scene.remove(m);
      shotMeshes.delete(e.shot.id);
    }
    shotStartY.delete(e.shot.id);
  } else if (e.type === 'death') {
    const view = creepViews.get(e.creep.id);
    if (view) {
      creepViews.delete(e.creep.id);
      corpses.push({ view, ttl: view.die(), c: e.creep });
    }
    kills++;
    gold += e.creep.kind === 'brute' ? 4 : 1;
    hud.setKills(kills);
    hud.setGold(gold);
    const big = e.creep.kind === 'brute' ? 1.5 : 1;
    // soul wisps rise, dust ring, gold glints
    for (let i = 0; i < 14 * big; i++) fxAdd.emit({ x: e.creep.x + rand(-0.2, 0.2), y: rand(0.2, 0.6), z: e.creep.y + rand(-0.2, 0.2), vy: rand(0.8, 1.8), vx: rand(-0.2, 0.2), vz: rand(-0.2, 0.2), size: rand(0.12, 0.22), sizeEnd: 0.02, r: 1.6, g: 1.2, b: 2.6, life: rand(0.7, 1.2), drag: 0.5 });
    for (let i = 0; i < 12 * big; i++) {
      const a = (i / 12) * Math.PI * 2;
      fxSmoke.emit({ x: e.creep.x, y: 0.1, z: e.creep.y, vx: Math.cos(a) * 1.4, vz: Math.sin(a) * 1.4, vy: 0.2, size: 0.25, sizeEnd: 0.6, r: 0.45, g: 0.38, b: 0.28, alpha: 0.45, life: 0.7, drag: 3 });
    }
    for (let i = 0; i < 5; i++) fxAdd.emit({ x: e.creep.x, y: 0.5, z: e.creep.y, vx: rand(-0.6, 0.6), vy: rand(2, 3), vz: rand(-0.6, 0.6), size: 0.1, r: 3, g: 2.3, b: 0.6, life: 0.7, gravity: 6 });
  } else if (e.type === 'leak') {
    const view = creepViews.get(e.creep.id);
    if (view) {
      scene.remove(view.root);
      view.dispose();
      creepViews.delete(e.creep.id);
    }
    for (let i = 0; i < 20; i++) fxAdd.emit({ x: 15.7, y: rand(0.3, 1.4), z: 7 + rand(-0.4, 0.4), vx: rand(0.2, 1), vy: rand(0, 0.6), size: 0.14, r: 3, g: 2.2, b: 0.6, life: 0.6 });
  } else if (e.type === 'meteor-warn') {
    startMeteor(e.x, e.y, e.delay);
  } else if (e.type === 'meteor') {
    meteorImpact(e.x, e.y);
  }
});

/* ----------------------------------------------------------------- loop */

const timer = new THREE.Timer();
timer.connect(document);
let speed = 1;
let paused = false;
let time = 0;

function frame(): void {
  timer.update();
  const realDtMs = timer.getDelta() * 1000;
  const dt = Math.min(0.05, realDtMs / 1000) * (paused || menuOpen ? 0 : 1);
  const gdt = dt * speed;
  time += gdt;
  sim.advance(gdt);

  for (const c of sim.creeps) creepViews.get(c.id)?.update(c, gdt, camera);
  for (let i = corpses.length - 1; i >= 0; i--) {
    const k = corpses[i];
    k.view.update(k.c, gdt, camera);
    k.ttl -= gdt;
    if (k.ttl <= 0) {
      scene.remove(k.view.root);
      k.view.dispose();
      corpses.splice(i, 1);
    }
  }
  for (const s of sim.shots) updateShotVisual(s, gdt);
  for (const v of towerViews.values()) v.update(time, gdt);
  // burning creeps trail flames
  for (const c of sim.creeps) {
    if (c.burn > 0 && Math.random() < gdt * 30) fxAdd.emit({ x: c.x + rand(-0.15, 0.15), y: rand(0.2, 0.5), z: c.y + rand(-0.15, 0.15), vy: 0.9, size: 0.18, sizeEnd: 0.02, r: 3, g: 1, b: 0.15, life: 0.4 });
    if (c.chill > 0 && Math.random() < gdt * 10) fxAdd.emit({ x: c.x + rand(-0.2, 0.2), y: rand(0.2, 0.6), z: c.y + rand(-0.2, 0.2), vy: -0.2, size: 0.07, r: 1.5, g: 2.2, b: 3, life: 0.6 });
  }

  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.t += gdt;
    const k = Math.min(1, m.t / m.dur);
    m.mesh.position.lerpVectors(m.from, m.to, k * k);
    m.mesh.rotation.x += gdt * 6;
    m.mesh.rotation.z += gdt * 4;
    const ringMat = m.ring.material as THREE.MeshBasicMaterial;
    ringMat.opacity = 0.4 + Math.sin(m.t * 25) * 0.25 + k * 0.4;
    m.ring.scale.setScalar(1.2 - k * 0.2);
    const p = m.mesh.position;
    for (let j = 0; j < Math.max(2, Math.round(6 * PS())); j++) {
      fxAdd.emit({ x: p.x + rand(-0.12, 0.12), y: p.y + rand(-0.12, 0.12), z: p.z + rand(-0.12, 0.12), size: rand(0.35, 0.6), sizeEnd: 0.05, r: 3, g: rand(0.8, 1.5), b: 0.2, life: rand(0.25, 0.45) });
    }
    if (Math.random() < PS()) fxSmoke.emit({ x: p.x, y: p.y, z: p.z, size: 0.4, sizeEnd: 1.0, r: 0.1, g: 0.08, b: 0.07, alpha: 0.5, life: 0.9 });
    if (k >= 1) {
      scene.remove(m.mesh, m.ring);
      meteors.splice(i, 1);
    }
  }
  flashLight.intensity *= Math.exp(-gdt * 7);
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.t += gdt;
    s.mesh.scale.setScalar(0.5 + s.t * 9);
    (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - s.t * 2.2);
    if (s.t > 0.5) {
      scene.remove(s.mesh);
      shockwaves.splice(i, 1);
    }
  }
  for (let i = scorches.length - 1; i >= 0; i--) {
    const s = scorches[i];
    s.t += gdt;
    (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * Math.min(1, Math.max(0, (5 - s.t) / 1.5));
    if (s.t > 5) {
      scene.remove(s.mesh);
      scorches.splice(i, 1);
    }
  }
  gates?.update(time, gdt);
  fxAdd.update(gdt);
  fxSmoke.update(gdt);
  shake.t = Math.max(0, shake.t - dt * 2.5);
  placeCamera();
  if (!menuOpen && document.visibilityState === 'visible') graphics.sampleFrame(realDtMs);
  gr.render(dt);
  requestAnimationFrame(frame);
}

(window as unknown as Record<string, unknown>).__slice = {
  sim,
  setSpeed: (s: number) => (speed = s),
  setPaused: (p: boolean) => (paused = p),
  stats: () => ({ particles: fxAdd.count + fxSmoke.count, creeps: sim.creeps.length, calls: gr.renderer.info.render.calls, triangles: gr.renderer.info.render.triangles, graphics: graphics.settings }),
  ready: false,
};

Promise.all([buildProps(scene, true), loadCreepModels()]).then(async ([, models]) => {
  creepModels = models;
  gates = buildGates(false);
  scene.add(gates.group);
  // compile every shader up front: a first meteor or ice shard must not hitch
  const warm = new THREE.Group();
  warm.add(new THREE.Mesh(meteorGeo, meteorMat), new THREE.Mesh(shardGeo, shardMat));
  warm.add(groundDecal(ringTex, new THREE.Color(1, 1, 1), 1, true), groundDecal(radialTexture(), new THREE.Color(0, 0, 0), 1, false));
  const warmCreeps = [createCreepView(models.grunt, false), createCreepView(models.brute, true)];
  for (const v of warmCreeps) warm.add(v.root);
  scene.add(warm);
  await gr.warmUp();
  scene.remove(warm);
  for (const v of warmCreeps) v.dispose();
  (window as unknown as { __perf: { reset(): void } }).__perf.reset();
  (window as unknown as { __slice: { ready: boolean } }).__slice.ready = true;
  requestAnimationFrame(frame);
});
