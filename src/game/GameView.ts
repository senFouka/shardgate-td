import * as THREE from 'three';
import { towerStats } from '../data/balance';
import { cellX, cellZ } from '../render/coords';
import { Particles, rand, randDir } from '../render/particles';
import { createTower, rangeRing, type TowerView } from '../render/towers';
import { createCreepView, type CreepView } from '../render/creeps';
import { DamageNumbers } from '../render/damageNumbers';
import type { CreepRoster } from '../render/creepModels';
import { sfx } from '../systems/Sfx';
import type { Creep, Game, Shot, Tower, TowerId } from './Game';
import { ELEMENTS, type ElementId } from '../data/elements';
import { ELEMENT_BOSS_CREEPS } from '../data/creeps';

/**
 * Everything the player sees of a running game: towers, creeps with health
 * bars, shots, impacts and deaths. Listens to the Game's events and reads its
 * state every frame; never changes the rules.
 */
export class GameView {
  readonly fxAdd: Particles;
  readonly fxSmoke: Particles;
  readonly range = rangeRing();
  private readonly towers = new Map<number, TowerView>();
  private readonly creeps = new Map<number, CreepView>();
  /** creeps shown with the stand-in model because theirs had not loaded yet */
  private readonly standIns = new Set<number>();
  private readonly corpses: Array<{ view: CreepView; ttl: number; c: ReturnType<GameView['look']> }> = [];
  private readonly shells = new Map<number, THREE.Mesh>();
  private readonly shellGeo = new THREE.DodecahedronGeometry(0.11, 0);
  private readonly shellMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, emissive: new THREE.Color(1, 0.45, 0.1), emissiveIntensity: 0.9, flatShading: true });
  /** projectile meshes of the element towers that throw something solid */
  private readonly missiles: Partial<Record<TowerId, { geo: THREE.BufferGeometry; mat: THREE.Material }>> = {
    frost: {
      geo: new THREE.OctahedronGeometry(0.07, 0).scale(1, 1, 3.2),
      mat: new THREE.MeshStandardMaterial({ color: 0xcff0ff, emissive: new THREE.Color(0.6, 1.4, 2.4), emissiveIntensity: 1.3, roughness: 0.1, flatShading: true }),
    },
    stone: {
      geo: new THREE.DodecahedronGeometry(0.13, 0),
      mat: new THREE.MeshStandardMaterial({ color: 0x6f655a, roughness: 0.95, flatShading: true, emissive: new THREE.Color(0.5, 0.25, 0.05), emissiveIntensity: 0.6 }),
    },
    tide: {
      geo: new THREE.IcosahedronGeometry(0.15, 1),
      mat: new THREE.MeshStandardMaterial({ color: 0x2aa8d8, emissive: new THREE.Color(0.2, 1.1, 1.6), emissiveIntensity: 1.1, roughness: 0.05, transparent: true, opacity: 0.85 }),
    },
  };
  private readonly waves: Array<{ mesh: THREE.Mesh; t: number; splash: number; life: number }> = [];
  private readonly ringTex = makeRingTexture();
  readonly root = new THREE.Group();
  /** floating damage numbers over hit creeps */
  private readonly numbers: DamageNumbers;
  /** progress bars over towers that are being built, upgraded or converted */
  private readonly bars = new Map<number, { root: THREE.Group; fill: THREE.Mesh; top: number }>();
  private shake = 0;
  private time = 0;

  constructor(
    private readonly game: Game,
    private readonly roster: CreepRoster,
    private readonly particleScale: () => number,
  ) {
    this.fxAdd = new Particles(5000, true);
    this.fxSmoke = new Particles(1500, false, 1.2);
    this.numbers = new DamageNumbers(particleScale);
    this.root.add(this.fxAdd.points, this.fxSmoke.points, this.range, this.numbers.mesh);
    game.on((e) => {
      // sounds for what happens on the battlefield
      // tower shots and hits are silent (the user's choice)
      if (e.type === 'death') sfx.play(e.creep.boss ? 'bossDeath' : 'creepDeath');
      else if (e.type === 'leak') sfx.play('leak');
      else if (e.type === 'build') sfx.play('build');
      else if (e.type === 'upgrade' || e.type === 'convert' || e.type === 'element') sfx.play('upgrade');
      else if (e.type === 'summon') sfx.play('bossWave');
      else if (e.type === 'sell') sfx.play('sell');
      else if (e.type === 'wave-start') sfx.play(e.boss ? 'bossWave' : 'waveStart');
      else if (e.type === 'over') sfx.play(e.won ? 'victory' : 'gameOver');

      if (e.type === 'build') this.addTower(e.tower);
      else if (e.type === 'built') this.built(e.tower);
      else if (e.type === 'sell') this.removeTower(e.tower, true);
      else if (e.type === 'upgrade') this.upgradeTower(e.tower);
      else if (e.type === 'convert') this.upgradeTower(e.tower, e.tower.kind as ElementId);
      else if (e.type === 'offer') this.prefetchOffer();
      else if (e.type === 'summon') this.summon(e.creep, e.element);
      else if (e.type === 'spawn') this.addCreep(e.creep);
      else if (e.type === 'wave-start') for (let k = 1; k <= 3; k++) void this.roster.prefetch(e.wave + k);
      else if (e.type === 'fire') {
        this.towers.get(e.shot.tower.id)?.onFire();
        if (e.shot.chain) this.lightning(e.shot.chain, e.shot.stats.damage);
      }
      else if (e.type === 'hit') this.impact(e.shot, e.col, e.row);
      else if (e.type === 'death') this.death(e.creep);
      else if (e.type === 'damage') {
        const c = e.creep;
        const top = (c.boss ? 2.7 : 1.2) + (c.flying ? 0.55 : 0);
        this.numbers.add(cellX(c.col), top, cellZ(c.row), e.amount, e.crit);
      }
      else if (e.type === 'leak') this.leak(e.creep);
    });
  }

  /** Starts loading the bosses of the elements on offer, so a summon shows its real model. */
  prefetchOffer(): void {
    for (const el of this.game.offer ?? []) void this.roster.prefetchLook(ELEMENT_BOSS_CREEPS[el]);
  }

  /** Resize hook: particles are sized in screen pixels. */
  setScale(bufferHeight: number, fov: number): void {
    this.fxAdd.setScale(bufferHeight, fov);
    this.fxSmoke.setScale(bufferHeight, fov);
  }

  /** Camera shake offset for this frame (world units). */
  get shakeAmount(): number {
    return this.shake;
  }

  /** Clears everything (new game). */
  reset(): void {
    for (const t of this.towers.values()) this.root.remove(t.group);
    for (const c of this.creeps.values()) {
      this.root.remove(c.root);
      c.dispose();
    }
    for (const k of this.corpses) this.root.remove(k.view.root);
    for (const s of this.shells.values()) this.root.remove(s);
    this.numbers.clear();
    for (const b of this.bars.values()) this.root.remove(b.root);
    this.bars.clear();
    this.towers.clear();
    this.creeps.clear();
    this.corpses.length = 0;
    this.shells.clear();
  }

  showRange(tower: Tower | null, kind?: TowerId, col?: number, row?: number): void {
    const k = tower?.kind ?? kind;
    if (!k) {
      this.range.visible = false;
      return;
    }
    const r = towerStats(k, tower?.level ?? 1).range;
    this.range.visible = true;
    this.range.scale.set(r, r, 1);
    this.range.position.set(cellX(tower?.col ?? col!), 0.05, cellZ(tower?.row ?? row!));
  }

  /* ------------------------------------------------------------- objects */

  private upgradeTower(t: Tower, element?: ElementId): void {
    const old = this.towers.get(t.id);
    const yaw = old?.head.rotation.y ?? 0;
    if (old) this.root.remove(old.group);
    this.towers.delete(t.id);
    this.addTower(t, true);
    const v = this.towers.get(t.id);
    if (v) v.head.rotation.y = yaw;
    // a burst of light rising through the tower: gold, or the new element colour
    const x = cellX(t.col);
    const z = cellZ(t.row);
    const [r, gg, b] = element ? hdr(element, 3) : [3, 2.3, 0.7];
    for (let i = 0; i < (element ? 70 : 40) * this.particleScale(); i++) {
      const a = Math.random() * Math.PI * 2;
      this.fxAdd.emit({ x: x + Math.cos(a) * 0.45, y: rand(0.1, 0.4), z: z + Math.sin(a) * 0.45, vx: -Math.cos(a) * 0.3, vy: rand(1.5, 3.2), vz: -Math.sin(a) * 0.3, size: rand(0.08, 0.16), sizeEnd: 0.02, r, g: gg, b, life: rand(0.6, 1.0), drag: 1 });
    }
    this.fxAdd.emit({ x, y: 1.2, z, size: element ? 3 : 2.2, sizeEnd: 0.3, r: r * 0.8, g: gg * 0.8, b: b * 0.8, life: 0.3 });
  }

  private addTower(t: Tower, quiet = false): void {
    const v = createTower(t.kind, this.fxAdd, t.level);
    v.group.position.set(cellX(t.col), 0, cellZ(t.row));
    v.group.scale.setScalar(1.45);
    this.root.add(v.group);
    this.towers.set(t.id, v);
    // a puff of dust as it lands
    for (let i = 0; i < (quiet ? 0 : 12) * this.particleScale(); i++) {
      const a = (i / 12) * Math.PI * 2;
      this.fxSmoke.emit({ x: cellX(t.col), y: 0.1, z: cellZ(t.row), vx: Math.cos(a) * 1.2, vz: Math.sin(a) * 1.2, vy: 0.3, size: 0.25, sizeEnd: 0.6, r: 0.55, g: 0.5, b: 0.42, alpha: 0.5, life: 0.6, drag: 3 });
    }
  }

  private removeTower(t: Tower, sold: boolean): void {
    this.dropBar(t.id);
    const v = this.towers.get(t.id);
    if (!v) return;
    this.root.remove(v.group);
    this.towers.delete(t.id);
    if (sold) {
      for (let i = 0; i < 10; i++) this.fxAdd.emit({ x: cellX(t.col), y: rand(0.3, 1), z: cellZ(t.row), vx: rand(-0.4, 0.4), vy: rand(1.5, 2.5), vz: rand(-0.4, 0.4), size: 0.1, r: 3, g: 2.3, b: 0.6, life: 0.7, gravity: 5 });
    }
  }

  /* -------------------------------------------------------- construction */

  /**
   * A tower at work: a progress bar over it; while being built it rises out
   * of the ground in a cloud of dust, while upgrading or converting it is
   * wrapped in a swirl of sparks (gold, or the new element's colour).
   */
  private workVisual(t: Tower, v: TowerView, camera: THREE.Camera): void {
    const w = t.work!;
    const p = Math.min(1, Math.max(0, 1 - w.left / w.total));
    let bar = this.bars.get(t.id);
    if (!bar) {
      v.group.position.y = 0;
      const top = new THREE.Box3().setFromObject(v.group).max.y;
      bar = makeWorkBar(top);
      bar.root.position.set(cellX(t.col), top + 0.35, cellZ(t.row));
      this.root.add(bar.root);
      this.bars.set(t.id, bar);
    }
    bar.fill.scale.x = Math.max(0.001, p) * WORK_BAR_W;
    bar.fill.position.x = (-WORK_BAR_W * (1 - p)) / 2;
    bar.root.quaternion.copy(camera.quaternion);
    const x = cellX(t.col);
    const z = cellZ(t.row);
    const n = this.particleScale();
    if (w.type === 'build') {
      // rises from below the grass to its full height
      const ease = 1 - Math.pow(1 - p, 2);
      v.group.position.y = -(1 - ease) * bar.top * 0.92;
      bar.root.position.y = bar.top + 0.35;
      if (Math.random() < 0.5 * n) {
        const a = Math.random() * Math.PI * 2;
        this.fxSmoke.emit({ x: x + Math.cos(a) * 0.55, y: 0.1, z: z + Math.sin(a) * 0.55, vx: Math.cos(a) * 0.5, vz: Math.sin(a) * 0.5, vy: 0.35, size: 0.3, sizeEnd: 0.7, r: 0.5, g: 0.45, b: 0.36, alpha: 0.45, life: 0.8, drag: 2 });
      }
      if (Math.random() < 0.25 * n) this.fxAdd.emit({ x: x + rand(-0.4, 0.4), y: 0.15, z: z + rand(-0.4, 0.4), vy: rand(1.5, 2.5), vx: rand(-0.5, 0.5), vz: rand(-0.5, 0.5), size: 0.07, r: 3, g: 2, b: 0.6, life: 0.4, gravity: 6 });
      return;
    }
    v.group.position.y = 0;
    const [r, g, b] = w.to ? hdr(w.to, 2.6) : [2.6, 2, 0.6];
    // two sparks per frame spiralling up around the tower
    for (let k = 0; k < 2; k++) {
      if (Math.random() > n) continue;
      const a = this.time * 6 + k * Math.PI + Math.random() * 0.4;
      const y = (this.time * 0.8 + k * 0.5) % 1;
      this.fxAdd.emit({ x: x + Math.cos(a) * 0.65, y: 0.1 + y * bar.top, z: z + Math.sin(a) * 0.65, vy: 0.8, size: rand(0.12, 0.2), sizeEnd: 0.03, r, g, b, life: 0.7, drag: 1 });
    }
    if (Math.random() < 0.15 * n) this.fxAdd.emit({ x, y: bar.top * 0.6, z, size: 1.4, sizeEnd: 0.4, r: r * 0.4, g: g * 0.4, b: b * 0.4, life: 0.3 });
  }

  private dropBar(id: number): void {
    const bar = this.bars.get(id);
    if (!bar) return;
    this.root.remove(bar.root);
    this.bars.delete(id);
  }

  /** Construction finished: a ring of dust and a flash of gold. */
  private built(t: Tower): void {
    this.dropBar(t.id);
    const v = this.towers.get(t.id);
    if (v) v.group.position.y = 0;
    const x = cellX(t.col);
    const z = cellZ(t.row);
    for (let i = 0; i < 16 * this.particleScale(); i++) {
      const a = (i / 16) * Math.PI * 2;
      this.fxSmoke.emit({ x, y: 0.1, z, vx: Math.cos(a) * 1.6, vz: Math.sin(a) * 1.6, vy: 0.3, size: 0.3, sizeEnd: 0.7, r: 0.55, g: 0.5, b: 0.42, alpha: 0.5, life: 0.6, drag: 3 });
    }
    this.fxAdd.emit({ x, y: 1, z, size: 1.8, sizeEnd: 0.2, r: 2.2, g: 1.8, b: 0.8, life: 0.25 });
  }

  /** The fields the creep view reads, in world units. */
  private look(c: Creep) {
    return {
      x: cellX(c.col), y: cellZ(c.row), heading: c.heading, hp: c.hp, maxHp: c.maxHp, hitAge: c.hitAge,
      chill: c.slowLeft > 0 ? 1 : 0, burn: c.burnLeft > 0 ? 1 : 0, poison: c.poisonLeft > 0 ? c.poisonStacks : 0, stun: c.stunLeft > 0 ? 1 : 0,
    };
  }

  private addCreep(c: Creep): void {
    const v = createCreepView(this.roster.getLook(c.look, c.boss), c.boss);
    if (!this.roster.isLookReady(c.look)) this.standIns.add(c.id);
    this.root.add(v.root);
    this.creeps.set(c.id, v);
    const p = this.look(c);
    for (let i = 0; i < 14 * this.particleScale(); i++) {
      this.fxAdd.emit({ x: p.x + rand(-0.4, 0.4), y: rand(0.2, 1.2), z: p.y + rand(-0.3, 0.3), vy: rand(-0.2, 0.6), vz: rand(0.3, 1.2), size: 0.12, r: 0.6, g: 1.5, b: 3, life: 0.5, drag: 2 });
    }
  }

  private death(c: Creep): void {
    const v = this.creeps.get(c.id);
    const p = this.look(c);
    if (v) {
      this.creeps.delete(c.id);
      this.corpses.push({ view: v, ttl: v.die(), c: p });
    }
    const n = this.particleScale();
    if (c.elementBoss) this.elementColumn(p.x, p.y, c.elementBoss);
    for (let i = 0; i < 14 * n; i++) this.fxAdd.emit({ x: p.x + rand(-0.2, 0.2), y: rand(0.2, 0.6), z: p.y + rand(-0.2, 0.2), vy: rand(0.8, 1.8), vx: rand(-0.2, 0.2), vz: rand(-0.2, 0.2), size: rand(0.12, 0.22), sizeEnd: 0.02, r: 1.6, g: 1.2, b: 2.6, life: rand(0.7, 1.2), drag: 0.5 });
    for (let i = 0; i < 12 * n; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.fxSmoke.emit({ x: p.x, y: 0.1, z: p.y, vx: Math.cos(a) * 1.4, vz: Math.sin(a) * 1.4, vy: 0.2, size: 0.25, sizeEnd: 0.6, r: 0.45, g: 0.38, b: 0.28, alpha: 0.45, life: 0.7, drag: 3 });
    }
    // gold glints jump out
    for (let i = 0; i < 5; i++) this.fxAdd.emit({ x: p.x, y: 0.5, z: p.y, vx: rand(-0.6, 0.6), vy: rand(2, 3), vz: rand(-0.6, 0.6), size: 0.1, r: 3, g: 2.3, b: 0.6, life: 0.7, gravity: 6 });
  }

  private leak(c: Creep): void {
    const v = this.creeps.get(c.id);
    if (v) {
      this.root.remove(v.root);
      v.dispose();
      this.creeps.delete(c.id);
    }
    const p = this.look(c);
    for (let i = 0; i < 20; i++) this.fxAdd.emit({ x: p.x + rand(-0.5, 0.5), y: rand(0.3, 1.6), z: p.y, vz: rand(-1.4, -0.4), vy: rand(0, 0.6), size: 0.14, r: 3, g: 0.6, b: 0.4, life: 0.6 });
  }

  /** An element boss steps out of the portal in a burst of its element colour. */
  private summon(c: Creep, el: ElementId): void {
    const x = cellX(c.col);
    const z = cellZ(c.row);
    const [r, g, b] = hdr(el, 3);
    for (let i = 0; i < 60 * this.particleScale(); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(1, 3);
      this.fxAdd.emit({ x, y: rand(0.3, 2), z, vx: Math.cos(a) * sp, vy: rand(0, 1.5), vz: Math.sin(a) * sp, size: rand(0.12, 0.25), sizeEnd: 0.02, r, g, b, life: rand(0.6, 1.1), drag: 1.5 });
    }
    this.fxAdd.emit({ x, y: 1.2, z, size: 4, sizeEnd: 0.5, r, g, b, life: 0.4 });
    this.shake = Math.max(this.shake, 0.08);
  }

  /** A pillar of element light where an element boss fell: the element is yours. */
  private elementColumn(x: number, z: number, el: ElementId): void {
    const [r, g, b] = hdr(el, 3);
    const n = this.particleScale();
    for (let i = 0; i < 90 * n; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = rand(0, 0.5);
      this.fxAdd.emit({ x: x + Math.cos(a) * rr, y: rand(0, 0.5), z: z + Math.sin(a) * rr, vy: rand(3, 7), vx: Math.cos(a) * 0.3, vz: Math.sin(a) * 0.3, size: rand(0.15, 0.3), sizeEnd: 0.02, r, g, b, life: rand(0.8, 1.4), drag: 0.6 });
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.fxAdd.emit({ x, y: 0.2, z, vx: Math.cos(a) * 4, vz: Math.sin(a) * 4, size: 0.3, sizeEnd: 0.05, r, g, b, life: 0.5, drag: 3 });
    }
    this.fxAdd.emit({ x, y: 1, z, size: 5, sizeEnd: 0.5, r: r * 0.7, g: g * 0.7, b: b * 0.7, life: 0.5 });
    this.shake = Math.max(this.shake, 0.12);
  }

  /** Gale: a jagged glowing arc through every creep the lightning struck. */
  private lightning(chain: Array<{ col: number; row: number }>, damage: number): void {
    const n = this.particleScale();
    const thick = Math.min(0.2, 0.09 + damage * 0.002);
    for (let i = 1; i < chain.length; i++) {
      const a = { x: cellX(chain[i - 1].col), y: i === 1 ? 2.2 : 0.7, z: cellZ(chain[i - 1].row) };
      const b = { x: cellX(chain[i].col), y: 0.7, z: cellZ(chain[i].row) };
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const steps = Math.max(4, Math.round(len * 6 * Math.max(0.5, n)));
      let px = a.x;
      let py = a.y;
      let pz = a.z;
      for (let k = 1; k <= steps; k++) {
        const f = k / steps;
        const j = k === steps ? 0 : 0.18;
        const nx = a.x + (b.x - a.x) * f + rand(-j, j);
        const ny = a.y + (b.y - a.y) * f + rand(-j, j);
        const nz = a.z + (b.z - a.z) * f + rand(-j, j);
        // fill the segment with sprites so it reads as a line
        const seg = Math.hypot(nx - px, ny - py, nz - pz);
        const dots = Math.max(1, Math.ceil(seg / 0.07));
        for (let d = 0; d < dots; d++) {
          const t = d / dots;
          this.fxAdd.emit({ x: px + (nx - px) * t, y: py + (ny - py) * t, z: pz + (nz - pz) * t, size: thick, sizeEnd: thick * 0.3, r: 1.6, g: 1.9, b: 3.6, life: 0.14 });
        }
        px = nx;
        py = ny;
        pz = nz;
      }
      // a crackle where it lands
      this.fxAdd.emit({ x: b.x, y: b.y, z: b.z, size: 0.6, sizeEnd: 0.1, r: 2, g: 2.2, b: 3.8, life: 0.12 });
      for (let s = 0; s < 5 * n; s++) {
        const [dx, dy, dz] = randDir();
        this.fxAdd.emit({ x: b.x, y: b.y, z: b.z, vx: dx * 2.5, vy: Math.abs(dy) * 2.5, vz: dz * 2.5, size: 0.06, r: 2, g: 2.2, b: 3.8, life: 0.2, drag: 4 });
      }
    }
  }

  /** Burning, chilled, poisoned and stunned creeps show it. */
  private statusFx(c: Creep, dt: number): void {
    const n = this.particleScale();
    const x = cellX(c.col);
    const z = cellZ(c.row);
    const top = (c.boss ? 2 : 1) + (c.flying ? 0.55 : 0);
    if (c.burnLeft > 0 && Math.random() < dt * 22 * n) {
      this.fxAdd.emit({ x: x + rand(-0.2, 0.2), y: rand(0.2, top), z: z + rand(-0.2, 0.2), vy: rand(0.8, 1.6), size: rand(0.1, 0.2), sizeEnd: 0.02, r: 3, g: rand(0.7, 1.3), b: 0.15, life: rand(0.3, 0.5) });
    }
    if (c.slowLeft > 0 && Math.random() < dt * 10 * n) {
      this.fxAdd.emit({ x: x + rand(-0.3, 0.3), y: rand(0.2, top), z: z + rand(-0.3, 0.3), vy: -0.2, size: rand(0.05, 0.1), r: 1.4, g: 2.2, b: 3, life: 0.6 });
    }
    if (c.poisonLeft > 0 && Math.random() < dt * (4 + c.poisonStacks * 3) * n) {
      this.fxSmoke.emit({ x: x + rand(-0.2, 0.2), y: rand(0.3, top), z: z + rand(-0.2, 0.2), vy: 0.4, size: 0.15, sizeEnd: 0.4, r: 0.35, g: 0.8, b: 0.15, alpha: 0.6, life: 0.7 });
    }
    if (c.stunLeft > 0 && Math.random() < dt * 30) {
      const a = this.time * 8 + Math.random() * 0.4;
      this.fxAdd.emit({ x: x + Math.cos(a) * 0.3, y: top + 0.25, z: z + Math.sin(a) * 0.3, size: 0.1, r: 3, g: 2.6, b: 0.8, life: 0.12 });
    }
  }

  /* --------------------------------------------------------------- shots */

  private impact(s: Shot, col: number, row: number): void {
    const x = cellX(col);
    const z = cellZ(row);
    const n = this.particleScale();
    this.shells.get(s.id) && this.root.remove(this.shells.get(s.id)!);
    this.shells.delete(s.id);
    const kind = s.tower.kind;
    if (kind === 'gale') return; // drawn with the lightning
    if (kind === 'ember') {
      this.fxAdd.emit({ x, y: 0.6, z, size: 1, sizeEnd: 0.2, r: 3, g: 1.3, b: 0.3, life: 0.16 });
      for (let i = 0; i < 16 * n; i++) {
        const [dx, dy, dz] = randDir();
        this.fxAdd.emit({ x, y: 0.6, z, vx: dx * 2.2, vy: Math.abs(dy) * 2.6, vz: dz * 2.2, size: rand(0.08, 0.16), sizeEnd: 0.02, r: 3, g: rand(0.7, 1.4), b: 0.15, life: rand(0.3, 0.55), drag: 2, gravity: 2 });
      }
      for (let i = 0; i < 3 * n; i++) this.fxSmoke.emit({ x, y: 0.6, z, vy: 0.8, vx: rand(-0.3, 0.3), size: 0.3, sizeEnd: 0.7, r: 0.15, g: 0.12, b: 0.1, alpha: 0.45, life: 0.9 });
      return;
    }
    if (kind === 'frost') {
      this.fxAdd.emit({ x, y: 0.6, z, size: 0.9, sizeEnd: 0.2, r: 1.6, g: 2.4, b: 3.4, life: 0.14 });
      for (let i = 0; i < 14 * n; i++) {
        const [dx, dy, dz] = randDir();
        this.fxAdd.emit({ x, y: 0.6, z, vx: dx * 2.4, vy: Math.abs(dy) * 2.4, vz: dz * 2.4, size: rand(0.06, 0.12), sizeEnd: 0.02, r: 1.6, g: 2.4, b: 3.4, life: rand(0.3, 0.6), drag: 2, gravity: 4 });
      }
      this.groundRing(x, z, s.stats.splash || 0.6, [1.2, 2.2, 3.2], 0.3);
      return;
    }
    if (kind === 'stone') {
      for (let i = 0; i < 12 * n; i++) {
        const [dx, dy, dz] = randDir();
        this.fxSmoke.emit({ x, y: 0.4, z, vx: dx * 2.2, vy: Math.abs(dy) * 2.8, vz: dz * 2.2, size: rand(0.08, 0.14), r: 0.42, g: 0.38, b: 0.32, alpha: 1, life: rand(0.4, 0.7), gravity: 7, drag: 1 });
      }
      for (let i = 0; i < 8 * n; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.fxSmoke.emit({ x, y: 0.15, z, vx: Math.cos(a) * 1.6, vz: Math.sin(a) * 1.6, vy: 0.2, size: 0.3, sizeEnd: 0.7, r: 0.5, g: 0.43, b: 0.33, alpha: 0.55, life: 0.6, drag: 3 });
      }
      this.fxAdd.emit({ x, y: 0.5, z, size: 0.7, sizeEnd: 0.1, r: 2.4, g: 1.6, b: 0.6, life: 0.12 });
      this.shake = Math.max(this.shake, 0.03);
      return;
    }
    if (kind === 'venom') {
      this.fxAdd.emit({ x, y: 0.6, z, size: 0.7, sizeEnd: 0.15, r: 1, g: 2.8, b: 0.4, life: 0.14 });
      for (let i = 0; i < 10 * n; i++) {
        const [dx, dy, dz] = randDir();
        this.fxAdd.emit({ x, y: 0.6, z, vx: dx * 1.8, vy: Math.abs(dy) * 2, vz: dz * 1.8, size: rand(0.06, 0.12), r: 0.8, g: 2.6, b: 0.3, life: rand(0.3, 0.6), gravity: 5, drag: 1 });
      }
      for (let i = 0; i < 3 * n; i++) this.fxSmoke.emit({ x: x + rand(-0.2, 0.2), y: 0.4, z: z + rand(-0.2, 0.2), vy: 0.3, size: 0.35, sizeEnd: 0.9, r: 0.3, g: 0.7, b: 0.12, alpha: 0.5, life: 1.1 });
      return;
    }
    if (kind === 'tide') {
      const splash = s.stats.splash;
      this.fxAdd.emit({ x, y: 0.3, z, size: splash * 1.8, sizeEnd: 0.3, r: 0.8, g: 2.2, b: 3, life: 0.18 });
      for (let i = 0; i < 34 * n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(1, 3.2);
        this.fxAdd.emit({ x, y: 0.2, z, vx: Math.cos(a) * sp, vy: rand(1.5, 3.5), vz: Math.sin(a) * sp, size: rand(0.06, 0.13), sizeEnd: 0.03, r: 0.7, g: 2, b: 3, life: rand(0.4, 0.8), gravity: 8, drag: 1 });
      }
      this.groundRing(x, z, splash, [0.6, 2, 2.8], 0.5);
      this.shake = Math.max(this.shake, 0.04);
      return;
    }
    if (kind === 'bolt') {
      this.fxAdd.emit({ x, y: 0.55, z, size: 0.5, sizeEnd: 0.1, r: 1.4, g: 2, b: 3, life: 0.12 });
      for (let i = 0; i < 10 * n; i++) {
        const [dx, dy, dz] = randDir();
        this.fxAdd.emit({ x, y: 0.55, z, vx: dx * 2.5, vy: Math.abs(dy) * 2.5, vz: dz * 2.5, size: 0.08, sizeEnd: 0.01, r: 1.6, g: 2.4, b: 3.4, life: 0.25, drag: 4, gravity: 3 });
      }
      return;
    }
    // mortar shell: blast, sparks, dust ring, smoke, a shockwave on the ground
    const splash = s.stats.splash;
    this.fxAdd.emit({ x, y: 0.4, z, size: splash * 2.2, sizeEnd: 0.4, r: 3, g: 1.7, b: 0.6, life: 0.18 });
    for (let i = 0; i < 30 * n; i++) {
      const [dx, dy, dz] = randDir();
      const sp = rand(1.5, 4);
      this.fxAdd.emit({ x, y: 0.3, z, vx: dx * sp, vy: Math.abs(dy) * sp, vz: dz * sp, size: rand(0.08, 0.2), sizeEnd: 0.02, r: 3, g: rand(0.8, 1.5), b: 0.2, life: rand(0.35, 0.7), drag: 2, gravity: 5 });
    }
    for (let i = 0; i < 10 * n; i++) {
      this.fxSmoke.emit({ x: x + rand(-0.3, 0.3), y: 0.25, z: z + rand(-0.3, 0.3), vx: rand(-0.8, 0.8), vy: rand(0.4, 1.1), vz: rand(-0.8, 0.8), size: 0.4, sizeEnd: 1.2, r: 0.16, g: 0.14, b: 0.12, alpha: 0.55, life: rand(0.9, 1.4), drag: 1.5 });
    }
    this.groundRing(x, z, splash, [2.5, 1.3, 0.5], 0.45);
    this.shake = Math.max(this.shake, 0.06);
  }

  /** An expanding ring of light on the ground (splash reach). */
  private groundRing(x: number, z: number, splash: number, rgb: [number, number, number], life: number): void {
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.ringTex, color: new THREE.Color(...rgb), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.06, z);
    ring.renderOrder = 6;
    this.root.add(ring);
    this.waves.push({ mesh: ring, t: 0, splash, life });
  }

  private shotVisual(s: Shot, dt: number): void {
    const n = this.particleScale();
    const x = cellX(s.col);
    const z = cellZ(s.row);
    const kind = s.tower.kind;
    if (!s.lob && kind !== 'bolt') {
      // element missiles home in from the tower head down to the creep
      const total = Math.hypot(s.toCol - s.startCol, s.toRow - s.startRow) || 1;
      const done = Math.min(1, Math.hypot(s.col - s.startCol, s.row - s.startRow) / total);
      const y = 2.1 * (1 - done) + 0.6 * done + Math.sin(done * Math.PI) * (kind === 'stone' ? 0.6 : 0.15);
      const mis = this.missiles[kind];
      if (mis) {
        let m = this.shells.get(s.id);
        if (!m) {
          m = new THREE.Mesh(mis.geo, mis.mat);
          m.castShadow = true;
          this.root.add(m);
          this.shells.set(s.id, m);
        }
        m.position.set(x, y, z);
        if (kind === 'frost') m.lookAt(cellX(s.toCol), 0.6, cellZ(s.toRow));
        else m.rotation.x += dt * 9;
      }
      if (kind === 'ember') {
        this.fxAdd.emit({ x, y, z, size: 0.4, sizeEnd: 0.1, r: 3, g: 1.3, b: 0.3, life: 0.08 });
        if (Math.random() < n) this.fxAdd.emit({ x: x + rand(-0.05, 0.05), y, z: z + rand(-0.05, 0.05), vy: 0.6, size: rand(0.12, 0.22), sizeEnd: 0.02, r: 3, g: rand(0.6, 1.2), b: 0.12, life: 0.35 });
        if (Math.random() < 0.3 * n) this.fxSmoke.emit({ x, y, z, vy: 0.5, size: 0.15, sizeEnd: 0.4, r: 0.15, g: 0.12, b: 0.1, alpha: 0.35, life: 0.6 });
      } else if (kind === 'frost') {
        if (Math.random() < n) this.fxAdd.emit({ x, y, z, size: 0.12, sizeEnd: 0.02, r: 1.4, g: 2.2, b: 3.2, life: 0.35, vy: -0.3 });
      } else if (kind === 'stone') {
        if (Math.random() < 0.6 * n) this.fxSmoke.emit({ x, y, z, size: 0.12, sizeEnd: 0.3, r: 0.45, g: 0.4, b: 0.33, alpha: 0.5, life: 0.4 });
      } else if (kind === 'venom') {
        this.fxAdd.emit({ x, y, z, size: 0.3, sizeEnd: 0.08, r: 0.9, g: 2.6, b: 0.3, life: 0.08 });
        if (Math.random() < n) this.fxAdd.emit({ x, y, z, vy: -0.8, size: 0.08, r: 0.7, g: 2.2, b: 0.25, life: 0.4, gravity: 3 });
      }
      return;
    }
    if (kind === 'bolt') {
      const total = Math.hypot(s.toCol - s.startCol, s.toRow - s.startRow) || 1;
      const done = Math.hypot(s.col - s.startCol, s.row - s.startRow) / total;
      const y = 1.25 - Math.min(1, done) * 0.7;
      this.fxAdd.emit({ x, y, z, size: 0.22, sizeEnd: 0.05, r: 1.8, g: 2.6, b: 3.6, life: 0.1 });
      if (Math.random() < n) this.fxAdd.emit({ x: x + rand(-0.03, 0.03), y, z: z + rand(-0.03, 0.03), size: 0.08, r: 1, g: 1.7, b: 3, life: 0.28 });
      return;
    }
    const tide = kind === 'tide';
    let shell = this.shells.get(s.id);
    if (!shell) {
      shell = tide ? new THREE.Mesh(this.missiles.tide!.geo, this.missiles.tide!.mat) : new THREE.Mesh(this.shellGeo, this.shellMat);
      shell.castShadow = true;
      this.root.add(shell);
      this.shells.set(s.id, shell);
    }
    const t = Math.min(1, s.t);
    const peak = 1.2 + Math.hypot(s.toCol - s.startCol, s.toRow - s.startRow) * 0.35;
    const y = 1.1 * (1 - t) + 0.2 * t + Math.sin(t * Math.PI) * peak;
    shell.position.set(x, y, z);
    shell.rotation.x += dt * 8;
    if (tide) {
      if (Math.random() < n) this.fxAdd.emit({ x: x + rand(-0.06, 0.06), y, z: z + rand(-0.06, 0.06), size: rand(0.06, 0.12), r: 0.6, g: 1.9, b: 2.8, life: 0.4, gravity: 4 });
      return;
    }
    if (Math.random() < 0.8 * n) this.fxAdd.emit({ x, y, z, size: rand(0.15, 0.25), sizeEnd: 0.03, r: 3, g: rand(0.8, 1.3), b: 0.2, life: 0.3 });
    if (Math.random() < 0.5 * n) this.fxSmoke.emit({ x, y, z, size: 0.18, sizeEnd: 0.45, r: 0.15, g: 0.13, b: 0.12, alpha: 0.4, life: 0.7 });
  }

  /* --------------------------------------------------------------- frame */

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    const g = this.game;
    // swap stand-ins for the real model as soon as it has streamed in
    for (const id of this.standIns) {
      const c = g.creeps.find((k) => k.id === id);
      if (!c) {
        this.standIns.delete(id);
        continue;
      }
      if (!this.roster.isLookReady(c.look)) continue;
      const old = this.creeps.get(id);
      if (old) {
        this.root.remove(old.root);
        old.dispose();
      }
      const v = createCreepView(this.roster.getLook(c.look, c.boss), c.boss);
      this.root.add(v.root);
      this.creeps.set(id, v);
      this.standIns.delete(id);
    }
    for (const c of g.creeps) {
      this.creeps.get(c.id)?.update(this.look(c), dt, camera);
      this.statusFx(c, dt);
    }
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const k = this.corpses[i];
      k.view.update(k.c, dt, camera);
      k.ttl -= dt;
      if (k.ttl <= 0) {
        this.root.remove(k.view.root);
        k.view.dispose();
        this.corpses.splice(i, 1);
      }
    }
    for (const t of g.towers) {
      const v = this.towers.get(t.id);
      if (!v) continue;
      if (t.work) this.workVisual(t, v, camera);
      else {
        if (this.bars.has(t.id)) this.dropBar(t.id);
        v.group.position.y = 0;
        // face the creep it would shoot, like the rules do
        const best = g.targetFor(t);
        if (best) v.aim(cellX(best.col), cellZ(best.row));
      }
      v.update(this.time, dt);
    }
    for (const s of g.shots) this.shotVisual(s, dt);
    // missiles whose target died before they arrived
    if (this.shells.size > g.shots.length) {
      const live = new Set(g.shots.map((s) => s.id));
      for (const [id, m] of this.shells) {
        if (!live.has(id)) {
          this.root.remove(m);
          this.shells.delete(id);
        }
      }
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt;
      const r = w.splash * 2.4 * Math.min(1, w.t / (w.life * 0.78));
      w.mesh.scale.set(r, r, 1);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - w.t / w.life);
      if (w.t > w.life) {
        this.root.remove(w.mesh);
        (w.mesh.material as THREE.Material).dispose();
        this.waves.splice(i, 1);
      }
    }
    this.fxAdd.update(dt);
    this.fxSmoke.update(dt);
    this.numbers.update(dt);
    this.shake = Math.max(0, this.shake - dt * 0.3);
  }
}

const WORK_BAR_W = 1.3;
const workBarGeo = new THREE.PlaneGeometry(1, 1);
const workFrame = new THREE.MeshBasicMaterial({ color: 0xd8a94c, depthTest: false });
const workBack = new THREE.MeshBasicMaterial({ color: 0x120c08, depthTest: false });
const workFill = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.4, 0.45), depthTest: false });

/** A billboard progress bar (dark frame, gold fill). */
function makeWorkBar(top: number): { root: THREE.Group; fill: THREE.Mesh; top: number } {
  const root = new THREE.Group();
  const frame = new THREE.Mesh(workBarGeo, workFrame);
  frame.scale.set(WORK_BAR_W + 0.1, 0.26, 1);
  const back = new THREE.Mesh(workBarGeo, workBack);
  back.scale.set(WORK_BAR_W + 0.04, 0.2, 1);
  const fill = new THREE.Mesh(workBarGeo, workFill);
  fill.scale.set(0.001, 0.15, 1);
  frame.renderOrder = 20;
  back.renderOrder = 21;
  fill.renderOrder = 22;
  root.add(frame, back, fill);
  return { root, fill, top };
}

/** An element UI colour as HDR particle RGB. */
function hdr(el: ElementId, k: number): [number, number, number] {
  const c = new THREE.Color(ELEMENTS[el].color);
  return [c.r * k + 0.2, c.g * k + 0.2, c.b * k + 0.2];
}

function makeRingTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.75, 'rgba(255,255,255,0.15)');
  grd.addColorStop(0.92, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
