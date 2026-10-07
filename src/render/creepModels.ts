import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadGltf } from './props';
import type { CreepModel } from './creeps';
import { CREEP_LOOKS, waveLook, type CreepLook } from '../data/creeps';

/**
 * Creep models for every wave and boss (CC0 / see ASSETS.md), streamed:
 * the first waves load before play starts, the rest load in the background
 * a few waves ahead, so the first load stays small.
 */
const BASE = 'models/monsters/';
const SKELETON = 'models/kaykit-skeletons/';

interface CatalogEntry {
  id: string;
  file: string;
  clips: { move: string | null; death: string | null; hit?: string | null };
  height: number;
  kind: 'ground' | 'flying';
}

export class CreepRoster {
  private readonly loaded = new Map<string, CreepModel>();
  private readonly loading = new Map<string, Promise<void>>();
  private catalog = new Map<string, CatalogEntry>();
  private fallback!: CreepModel;

  /** Loads the catalog, the fallback skeleton and the first waves' models. */
  async init(): Promise<void> {
    try {
      const res = await fetch(`${BASE}catalog.json`);
      if (res.ok) for (const e of (await res.json()) as CatalogEntry[]) this.catalog.set(e.id, e);
    } catch {
      /* no catalog: every wave uses the fallback */
    }
    const [body, blade] = await Promise.all([loadGltf(`${SKELETON}Skeleton_Minion.glb`), loadGltf(`${SKELETON}Skeleton_Blade.glb`)]);
    this.fallback = body
      ? { gltf: body, height: 0.95, yaw: Math.PI / 2, attach: blade ? [{ gltf: blade, bone: 'handslot.r' }] : [] }
      : { gltf: plainFallback(), height: 0.7, yaw: 0 };
    await Promise.all([this.prefetch(1), this.prefetch(2)]);
    void this.prefetch(3);
  }

  private idFor(wave: number, boss: boolean): string | undefined {
    return waveLook(wave, boss);
  }

  /** Starts loading the models a wave needs (its creeps and its boss). */
  prefetch(wave: number): Promise<void> {
    const ids = [this.idFor(wave, false), wave % 5 === 0 ? this.idFor(wave, true) : undefined].filter((x): x is string => !!x);
    return Promise.all(ids.map((id) => this.load(id))).then(() => undefined);
  }

  /** Starts loading one look (element bosses, when their element is offered). */
  prefetchLook(id: string): Promise<void> {
    return this.load(id);
  }

  private load(id: string): Promise<void> {
    if (this.loaded.has(id)) return Promise.resolve();
    const pending = this.loading.get(id);
    if (pending) return pending;
    const look = CREEP_LOOKS[id];
    const entry = look && this.catalog.get(look.model ?? id);
    if (!entry || !look) return Promise.resolve();
    const p = Promise.all([loadGltf(BASE + entry.file), ...(look.attach ?? []).map((a) => loadGltf(SKELETON + a.file))]).then(([g, ...props]) => {
      if (!g) return;
      const attach = (look.attach ?? []).flatMap((a, i) => (props[i] ? [{ gltf: props[i]!, bone: a.bone }] : []));
      this.loaded.set(id, toModel(g, entry, look, attach));
    });
    this.loading.set(id, p);
    return p;
  }

  /** The model for a creep of `wave` (the fallback until its own model has loaded). */
  get(wave: number, boss: boolean): CreepModel {
    return this.getLook(this.idFor(wave, boss) ?? '', boss);
  }

  /** The model for a look id (the fallback until it has loaded). */
  getLook(id: string, big: boolean): CreepModel {
    const m = this.loaded.get(id);
    if (m) return m;
    if (id) void this.load(id);
    const f = this.fallback;
    return big ? { ...f, height: f.height * 1.9, tint: new THREE.Color(1.25, 0.7, 0.7) } : f;
  }

  /** True once the model for this creep has loaded (no fallback needed). */
  isReady(wave: number, boss: boolean): boolean {
    return this.isLookReady(this.idFor(wave, boss) ?? '');
  }

  isLookReady(id: string): boolean {
    return this.loaded.has(id);
  }

  /** Display name for the wave preview. */
  nameFor(wave: number, boss: boolean): string {
    const id = this.idFor(wave, boss);
    return (id && CREEP_LOOKS[id]?.name) || (boss ? 'Boss' : 'Creeps');
  }
}

function toModel(g: GLTF, e: CatalogEntry, look: CreepLook, attach: NonNullable<CreepModel['attach']>): CreepModel {
  return {
    gltf: g,
    attach,
    height: look.height,
    yaw: Math.PI / 2,
    clips: { move: e.clips.move, death: e.clips.death },
    hover: e.kind === 'flying' ? 0.55 : 0,
    tint: look.tint ? new THREE.Color(look.tint) : undefined,
  };
}

/** A plain stand-in if no model loads at all (the game must still run). */
function plainFallback(): GLTF {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: 0x7a4a8a, flatShading: true }));
  body.position.y = 0.3;
  g.add(body);
  return { scene: g, animations: [] } as unknown as GLTF;
}
