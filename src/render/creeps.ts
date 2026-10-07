import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
/** The parts of a creep the view reads (the slice sim and the game both provide them). */
export interface CreepLike {
  x: number;
  y: number;
  heading: number;
  hp: number;
  maxHp: number;
  hitAge: number;
  chill: number;
  burn: number;
  /** poison stacks (0 = none) */
  poison?: number;
  /** stunned: frozen in place */
  stun?: number;
}

/**
 * Creep visuals: an animated glTF model (walk + death clips when present),
 * a hit flash, chill/burn tints, and a billboard health bar.
 */
export interface CreepView {
  root: THREE.Group;
  /** clip lengths in seconds (0 when the model has no such clip), used by the sprite baker */
  clips: { walk: number; death: number };
  /** the health bar, hidden by the sprite baker */
  bar: THREE.Object3D;
  update(c: CreepLike, dt: number, camera: THREE.Camera): void;
  /** plays the death and resolves when the body should be removed */
  die(): number;
  dispose(): void;
}

export interface CreepModel {
  gltf: GLTF;
  /** target height in cells */
  height: number;
  /** extra yaw so the model faces +x when heading is 0 */
  yaw: number;
  tint?: THREE.Color;
  attach?: Array<{ gltf: GLTF; bone: string }>;
  /** exact clip names, when known (otherwise guessed from the names) */
  clips?: { move?: string | null; death?: string | null };
  /** flying creeps float this high above the ground (cells) */
  hover?: number;
}

const BAR_W = 0.62;
const barGeo = new THREE.PlaneGeometry(1, 1);
const barBackMat = new THREE.MeshBasicMaterial({ color: 0x120c0c, transparent: true, opacity: 0.85, depthTest: false });
const barFrameMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.9, depthTest: false });

function pickClip(clips: THREE.AnimationClip[], ...patterns: RegExp[]): THREE.AnimationClip | null {
  for (const re of patterns) {
    const c = clips.find((a) => re.test(a.name));
    if (c) return c;
  }
  return null;
}

export function createCreepView(model: CreepModel, isBig: boolean): CreepView {
  const root = new THREE.Group();
  const body = cloneSkinned(model.gltf.scene) as THREE.Group;
  for (const a of model.attach ?? []) body.getObjectByName(a.bone)?.add(a.gltf.scene.clone());
  // normalise size
  const box = new THREE.Box3().setFromObject(model.gltf.scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const s = model.height / Math.max(0.001, size.y);
  body.scale.setScalar(s);
  body.position.y = -box.min.y * s + (model.hover ?? 0);
  const holder = new THREE.Group();
  holder.add(body);
  root.add(holder);

  const mats: THREE.MeshStandardMaterial[] = [];
  /** each material's own glow (eyes), kept under the hit/chill/burn tints */
  const baseEmissive = new Map<THREE.Material, THREE.Color>();
  body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.frustumCulled = false; // skinned bounds are unreliable
    const src = Array.isArray(m.material) ? m.material : [m.material];
    const cloned = src.map((mat) => {
      const c = (mat as THREE.MeshStandardMaterial).clone();
      if (model.tint && c.color) c.color.multiply(model.tint);
      // creeps are matte: no strong studio reflections (they made pale skins bloom white)
      if ('roughness' in c) c.roughness = Math.max(c.roughness, 0.75);
      if ('envMapIntensity' in c) c.envMapIntensity = 0.3;
      baseEmissive.set(c, c.emissive ? c.emissive.clone() : new THREE.Color());
      mats.push(c);
      return c;
    });
    m.material = Array.isArray(m.material) ? cloned : cloned[0];
  });

  const mixer = new THREE.AnimationMixer(body);
  const clips = model.gltf.animations;
  const byName = (n?: string | null) => (n ? clips.find((c) => c.name === n) ?? null : null);
  const walk = byName(model.clips?.move) ?? pickClip(clips, /^walk$/i, /walk/i, /run/i, /fly/i, /move/i, /idle/i);
  const death = byName(model.clips?.death) ?? pickClip(clips, /^death$/i, /death/i, /die/i, /dead/i);
  const walkAction = walk ? mixer.clipAction(walk) : null;
  walkAction?.play();
  if (walkAction) walkAction.time = Math.random() * (walk!.duration || 1);

  // health bar (billboard, drawn on top)
  const bar = new THREE.Group();
  const w = BAR_W * (isBig ? 1.3 : 1);
  const frame = new THREE.Mesh(barGeo, barFrameMat);
  frame.scale.set(w + 0.05, 0.11, 1);
  const back = new THREE.Mesh(barGeo, barBackMat);
  back.scale.set(w, 0.07, 1);
  const fillMat = new THREE.MeshBasicMaterial({ color: 0x4ee06a, depthTest: false, transparent: true });
  const fill = new THREE.Mesh(barGeo, fillMat);
  fill.scale.set(w, 0.07, 1);
  for (const [i, m] of [frame, back, fill].entries()) m.renderOrder = 100 + i;
  bar.add(frame, back, fill);
  bar.position.y = model.height + 0.28 + (model.hover ?? 0);
  root.add(bar);

  const hpColor = new THREE.Color();
  let dying = false;
  let deathTime = 0;
  let sink = 0;

  return {
    root,
    clips: { walk: walk?.duration ?? 0, death: death?.duration ?? 0 },
    bar,
    update(c, dt, camera) {
      mixer.update(dt * (dying ? 1 : (c.stun ?? 0) > 0 ? 0 : c.chill > 0 ? 0.55 : 1));
      if (!dying) {
        root.position.set(c.x, 0, c.y);
        const target = -c.heading + model.yaw;
        let diff = target - holder.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        holder.rotation.y += diff * Math.min(1, dt * 10);
        const frac = Math.max(0, c.hp / c.maxHp);
        fill.scale.x = w * frac;
        fill.position.x = (-w * (1 - frac)) / 2;
        hpColor.setRGB(frac > 0.5 ? (1 - frac) * 2 * 0.9 + 0.2 : 0.95, frac > 0.5 ? 0.88 : 0.2 + frac * 1.3, 0.25);
        fillMat.color.copy(hpColor);
      } else {
        deathTime += dt;
        if (deathTime > 1.2) {
          sink += dt;
          root.position.y = -sink * 0.6;
        }
      }
      bar.quaternion.copy(camera.quaternion);
      // tints: white hit flash plus one blended status colour (orange burn, blue chill, green poison);
      // blended rather than added so a creep with several effects never washes out to white
      const flash = Math.max(0, 1 - c.hitAge * 9);
      const wB = c.burn > 0 ? 1 : 0;
      const wC = c.chill > 0 ? 1 : 0;
      const wP = (c.poison ?? 0) > 0 ? 1 : 0;
      const wSum = wB + wC + wP;
      const k = wSum ? 0.38 / wSum : 0;
      const pulse = wB ? 1 + Math.sin(performance.now() * 0.03) * 0.25 : 1;
      const tr = k * (wB * 1.0 * pulse + wC * 0.05 + wP * 0.15);
      const tg = k * (wB * 0.3 + wC * 0.35 + wP * 0.75);
      const tb = k * (wB * 0.02 + wC * 1.0 + wP * 0.05);
      for (const m of mats) {
        if (!m.emissive) continue;
        const base = baseEmissive.get(m)!;
        m.emissive.setRGB(
          base.r + flash * 0.6 + tr,
          base.g + flash * 0.6 + tg,
          base.b + flash * 0.6 + tb,
        );
      }
    },
    die() {
      dying = true;
      bar.visible = false;
      if (death) {
        walkAction?.fadeOut(0.1);
        const a = mixer.clipAction(death);
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
        a.reset().fadeIn(0.05).play();
        return Math.min(death.duration, 1.2) + 0.9;
      }
      holder.rotation.z = Math.PI / 2;
      deathTime = 1.2;
      return 1;
    },
    dispose() {
      mixer.stopAllAction();
      for (const m of mats) m.dispose();
      fillMat.dispose();
    },
  };
}
