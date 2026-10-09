import * as THREE from 'three';
import type { CameraRig } from '../render/CameraRig';
import { cellX, cellZ, worldToCell } from '../render/coords';
import { createTower, ghostOf } from '../render/towers';
import type { Particles } from '../render/particles';
import type { Game, Tower, TowerId } from './Game';
import type { GameView } from './GameView';

/**
 * Turns pointer input on the battlefield into building and selecting:
 * - with a tower picked: a ghost follows the pointer (green = can build,
 *   red = cannot); tap/click builds
 * - with nothing picked: tap a tower to select it, tap elsewhere to clear
 * A drag or pinch moves the camera instead (the rig reports it).
 */
export class BuildInput {
  private game!: Game;
  private view!: GameView;
  private picked: TowerId | null = null;
  private selected: Tower | null = null;
  private readonly ghosts = new Map<TowerId, ReturnType<typeof ghostOf>>();
  private readonly ray = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private downAt = { x: 0, y: 0 };

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLElement,
    private readonly rig: CameraRig,
    private readonly scene: THREE.Object3D,
    private readonly dummyFx: Particles,
    private readonly hooks: { onSelect(t: Tower | null): void; onBuilt(): void; onDenied(reason: string, kind: TowerId, col: number, row: number): void; onCancelBuild(): void },
  ) {
    for (const kind of ['bolt', 'mortar'] as const) this.ghostFor(kind);
    dom.addEventListener('pointermove', (e) => this.onMove(e));
    dom.addEventListener('pointerdown', (e) => (this.downAt = { x: e.clientX, y: e.clientY }));
    dom.addEventListener('pointerup', (e) => this.onUp(e));
    dom.addEventListener('pointerleave', () => this.hideGhost());
  }

  bind(game: Game, view: GameView): void {
    this.game = game;
    this.view = view;
    this.selected = null;
    this.hideGhost();
  }

  pick(kind: TowerId | null): void {
    this.picked = kind;
    if (kind) this.select(null);
    this.hideGhost();
  }

  select(t: Tower | null): void {
    this.selected = t;
    this.view?.showRange(t);
    this.hooks.onSelect(t);
  }

  private cellAt(clientX: number, clientY: number): { col: number; row: number } | null {
    const rect = this.dom.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    const p = this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
    return p ? worldToCell(p.x, p.z) : null;
  }

  /** The see-through preview of a tower kind, made the first time it is needed. */
  private ghostFor(kind: TowerId): ReturnType<typeof ghostOf> {
    let g = this.ghosts.get(kind);
    if (!g) {
      g = ghostOf(createTower(kind, this.dummyFx));
      g.group.visible = false;
      g.group.scale.setScalar(1.45);
      this.scene.add(g.group);
      this.ghosts.set(kind, g);
    }
    return g;
  }

  private hideGhost(): void {
    for (const g of this.ghosts.values()) g.group.visible = false;
    if (!this.selected) this.view?.showRange(null);
  }

  private showGhost(col: number, row: number): void {
    if (!this.picked) return;
    const g = this.ghostFor(this.picked);
    for (const [k, other] of this.ghosts) other.group.visible = k === this.picked;
    g.group.position.set(cellX(col), 0, cellZ(row));
    const err = this.game.canBuild(this.picked, col, row);
    g.setValid(!err || err === 'gold');
    this.view.showRange(null, this.picked, col, row);
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || !this.picked) return;
    const cell = this.cellAt(e.clientX, e.clientY);
    if (cell) this.showGhost(cell.col, cell.row);
  }

  private onUp(e: PointerEvent): void {
    // a drag or pinch moved the camera: not a tap
    if (this.rig.dragged && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 8) return;
    if (e.pointerType === 'mouse' && e.button === 2) {
      // right click: leave build mode / clear the selection
      if (this.picked) this.hooks.onCancelBuild();
      else this.select(null);
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const cell = this.cellAt(e.clientX, e.clientY);
    if (!cell) return;
    if (this.picked) {
      const res = this.game.build(this.picked, cell.col, cell.row);
      if (typeof res === 'object') {
        this.hooks.onBuilt();
        if (e.pointerType === 'mouse') this.showGhost(cell.col, cell.row);
        else this.hideGhost();
      } else {
        this.hooks.onDenied(res, this.picked, cell.col, cell.row);
        if (e.pointerType !== 'mouse') this.showGhost(cell.col, cell.row);
      }
      return;
    }
    this.select(this.game.towerAt(cell.col, cell.row));
  }
}
