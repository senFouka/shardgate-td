import '../../src/ui/ui.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GameRenderer } from '../../src/render/GameRenderer';
import { PRESETS } from '../../src/data/graphics';
import { Particles } from '../../src/render/particles';
import { createTower } from '../../src/render/towers';
import { buildOrnate } from '../../src/render/ornate';

/**
 * Tower look review: Bolt and Mortar as built in the game, then the ornate
 * kit at tiers 1-3 in a few element colours (cores for elements come with
 * Milestone 3).
 */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3a2a);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
const gr = new GameRenderer(document.getElementById('game')!, scene, camera);
gr.apply(PRESETS.high);
const pmrem = new THREE.PMREMGenerator(gr.renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
scene.add(new THREE.HemisphereLight(0xd8e8ff, 0x46351f, 1.15));
const sun = new THREE.DirectionalLight(0xffe2b8, 2.7);
sun.position.set(-6, 12, -4);
const sc = sun.shadow.camera;
[sc.left, sc.right, sc.top, sc.bottom] = [-10, 10, 10, -10];
scene.add(sun);
gr.addShadowLight(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ color: 0x4a7230, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const fx = new Particles(3000, true);
scene.add(fx.points);
const items: Array<{ update(t: number, dt: number): void }> = [];
const place = (o: THREE.Object3D, x: number, z: number) => {
  o.position.set(x, 0, z);
  o.scale.setScalar(1.45);
  scene.add(o);
};
// row 1: the two basic towers
const bolt = createTower('bolt', fx);
place(bolt.group, -1.4, -2.2);
const mortar = createTower('mortar', fx);
place(mortar.group, 1.4, -2.2);
items.push(bolt, mortar);
// rows 2-3: tiers 1..3 in element colours
const looks: Array<[number, THREE.Color, 'hourglass' | 'drum']> = [
  [0x9a1f1c, new THREE.Color(1.6, 0.5, 0.15), 'hourglass'],
  [0x1d5fa8, new THREE.Color(0.5, 1.2, 1.8), 'hourglass'],
  [0x5a2a8e, new THREE.Color(1.2, 0.5, 1.8), 'hourglass'],
];
looks.forEach(([panel, glow, shape], row) => {
  for (let tier = 1; tier <= 3; tier++) {
    const o = buildOrnate({ panel, glow, tier, shape });
    place(o.group, (tier - 2) * 2.4 + (row - 1) * 0.0, row * 2.4 + 0.6);
    items.push({ update: (t) => o.update(t) });
  }
});

let t = 0;
const timer = new THREE.Timer();
const resize = () => {
  camera.aspect = innerWidth / innerHeight;
  fx.setScale(gr.bufferHeight(), camera.fov);
};
gr.onResize(resize);
gr.resize();
camera.position.set(0, 13, 17);
camera.lookAt(0, 0.8, 1.6);
const frame = () => {
  timer.update();
  const dt = Math.min(0.05, timer.getDelta());
  t += dt;
  bolt.aim(Math.sin(t) * 5, 5);
  mortar.aim(Math.cos(t) * 5, 5);
  if (Math.floor(t * 1.5) !== Math.floor((t - dt) * 1.5)) bolt.onFire();
  for (const i of items) i.update(t, dt);
  fx.update(dt);
  gr.render(dt);
  requestAnimationFrame(frame);
};
(window as unknown as { __slice: unknown }).__slice = { ready: true };
requestAnimationFrame(frame);
