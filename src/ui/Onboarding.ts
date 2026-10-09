import * as THREE from 'three';
import { BALANCE } from '../data/balance';
import { MAP, buildGrid } from '../data/map';
import { cellX, cellZ } from '../render/coords';
import type { Game } from '../game/Game';
import { el, uiRoot } from './dom';

/**
 * The first game's tutorial, inside gameplay and skippable at any moment:
 * 1. choose an element (the pick panel glows)
 * 2. pick a tower (the build bar glows) and build it on the marked spot: a
 *    golden ring and a bouncing arrow on the best grass cell near the gates
 * 3. start the wave (the Start button glows)
 * 4. a small card with the controls (mouse and keyboard, or touch)
 * Shown once per profile; "Skip" ends it.
 */
export interface OnboardingHooks {
  done(): void;
}

type Step = 'element' | 'tower' | 'place' | 'start' | 'controls' | 'over';

/** The grass cell that covers the most road within a Bolt's reach, in the top half. */
function bestSpot(): { col: number; row: number } {
  const g = buildGrid();
  const lane = (c: number, r: number) => c >= 0 && r >= 0 && c < MAP.cols && r < MAP.rows && g[r * MAP.cols + c] === 'lane';
  const reach = BALANCE.towers.bolt[0].range;
  let best = { col: 0, row: 0, n: -1 };
  for (let r = 2; r < MAP.rows / 2; r++) {
    for (let c = 2; c < MAP.cols - 2; c++) {
      if (g[r * MAP.cols + c] !== 'grass') continue;
      let n = 0;
      for (let y = Math.floor(r - reach); y <= r + reach; y++) for (let x = Math.floor(c - reach); x <= c + reach; x++) if (lane(x, y) && Math.hypot(x - c, y - r) <= reach) n++;
      // prefer the middle of the map a little, where the player looks first
      const score = n - Math.abs(c - MAP.cols / 2) * 0.15;
      if (score > best.n) best = { col: c, row: r, n: score };
    }
  }
  return best;
}

export class Onboarding {
  private step: Step = 'element';
  private readonly card = el('div', { class: 'tut-card', role: 'status' });
  private readonly arrow = el('div', { class: 'tut-arrow', 'aria-hidden': 'true' });
  private readonly marker = new THREE.Group();
  private readonly spot = bestSpot();
  private glowing: Element | null = null;
  private time = 0;
  private readonly touch = matchMedia('(pointer: coarse)').matches;
  private controlsTimer = 0;

  constructor(
    private readonly game: Game,
    scene: THREE.Object3D,
    private readonly hooks: OnboardingHooks,
  ) {
    // the marker: a golden ring on the cell and a bouncing arrow above it
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.48, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.45), transparent: true, opacity: 0.9, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(0.36, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.0, 0.4), transparent: true, opacity: 0.25, depthWrite: false }),
    );
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.035;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.15, 0.35) }));
    tip.rotation.x = Math.PI;
    tip.position.y = 1.1;
    tip.name = 'tip';
    this.marker.add(ring, fill, tip);
    this.marker.position.set(cellX(this.spot.col), 0, cellZ(this.spot.row));
    this.marker.visible = false;
    this.marker.renderOrder = 7;
    scene.add(this.marker);
    uiRoot().append(this.card, this.arrow);

    game.on((e) => {
      if (e.type === 'element' && this.step === 'element') this.go('tower');
      if (e.type === 'build' && (this.step === 'tower' || this.step === 'place')) this.go('start');
      if (e.type === 'wave-start' && this.step !== 'controls' && this.step !== 'over') this.go('controls');
    });
    this.go(game.offer && game.pickIsFree ? 'element' : 'tower');
  }

  /** The player picked a tower in the build bar. */
  towerPicked(on: boolean): void {
    if (this.step === 'tower' && on) this.go('place');
    else if (this.step === 'place' && !on) this.go('tower');
  }

  private go(step: Step): void {
    this.step = step;
    this.glow(null);
    this.marker.visible = step === 'place' || step === 'tower';
    const skip = el('button', { class: 'ui-btn tut-skip', type: 'button', text: 'Skip' });
    skip.addEventListener('click', () => this.finish());
    const line = (title: string, text: string) => this.card.replaceChildren(el('div', { class: 'tut-text' }, [el('b', { text: title }), el('span', { text })]), skip);
    this.card.hidden = false;
    this.card.classList.remove('tut-controls');
    if (step === 'element') {
      line('Choose your first element', 'Each element gives a tower with its own power.');
      this.glow('.hud-pick');
    } else if (step === 'tower') {
      line('Pick a tower', `${this.touch ? 'Tap' : 'Click'} a tower in the bar below.`);
      this.glow('.hud-build .hud-tower');
    } else if (step === 'place') {
      line('Build it beside the road', `${this.touch ? 'Tap' : 'Click'} the glowing spot. Towers between two roads hit enemies twice.`);
    } else if (step === 'start') {
      line('Start the wave', `${this.touch ? 'Tap' : 'Click'} Start when you are ready. Enemies walk from the blue gate to the red one.`);
      this.glow('.hud-wave-btn');
    } else if (step === 'controls') {
      this.showControls();
    } else {
      this.card.hidden = true;
      this.arrow.hidden = true;
    }
  }

  private showControls(): void {
    const ok = el('button', { class: 'ui-btn tut-skip', type: 'button', text: 'Got it' });
    ok.addEventListener('click', () => this.finish());
    const row = (keys: string[], text: string) =>
      el('div', { class: 'tut-row' }, [el('span', { class: 'tut-keys' }, keys.map((k) => el('kbd', { text: k }))), el('span', { text })]);
    const rows = this.touch
      ? [row(['Drag'], 'move the map'), row(['Pinch'], 'zoom'), row(['Tap tower'], 'upgrade or sell'), row(['Tap ▸▸'], 'game speed')]
      : [
          row(['Drag', '← ↑ → ↓'], 'move the map'),
          row(['Wheel'], 'zoom'),
          row(['1', '–', '8'], 'pick a tower'),
          row(['Right-click', 'X'], 'stop building'),
          row(['Click tower', 'U'], 'upgrade or sell'),
          row(['Space'], 'next wave'),
          row(['F'], 'game speed'),
        ];
    this.card.classList.add('tut-controls');
    this.card.replaceChildren(el('div', { class: 'tut-text' }, [el('b', { text: 'Controls' })]), ...rows, ok);
    this.arrow.hidden = true;
    this.controlsTimer = 14;
  }

  /** Ends the tutorial at once (the game was reset). */
  skip(): void {
    this.finish();
  }

  private finish(): void {
    if (this.step === 'over') return;
    this.go('over');
    this.marker.parent?.remove(this.marker);
    this.card.remove();
    this.arrow.remove();
    this.hooks.done();
  }

  /** Puts the glow on a HUD element and points the arrow at it. */
  private glow(selector: string | null): void {
    this.glowing?.classList.remove('tut-glow');
    this.glowing = selector ? document.querySelector(selector) : null;
    this.glowing?.classList.add('tut-glow');
    this.arrow.hidden = !this.glowing;
  }

  /**
   * Keeps the card clear of every button: just above the tower bar, or above
   * the element panel when that sits in the middle at the bottom (phones).
   */
  private placeCard(): void {
    if (this.card.hidden || this.step === 'controls') {
      this.card.style.top = '';
      this.card.style.bottom = '';
      return;
    }
    let anchor = window.innerHeight;
    const bar = document.querySelector('.hud-build') as HTMLElement | null;
    const br = bar?.getBoundingClientRect();
    if (br && br.height > 0) anchor = Math.min(anchor, br.top);
    const pick = document.querySelector('.hud-pick') as HTMLElement | null;
    if (pick && !pick.hidden) {
      const r = pick.getBoundingClientRect();
      if (Math.abs(r.left + r.width / 2 - window.innerWidth / 2) < 120) anchor = Math.min(anchor, r.top);
    }
    this.card.style.top = 'auto';
    this.card.style.bottom = `${Math.round(window.innerHeight - anchor + 10)}px`;
  }

  /** Called every frame (real time). */
  update(dt: number): void {
    if (this.step === 'over') return;
    this.time += dt;
    this.placeCard();
    // the element panel glows on its own; an arrow there would cover the card
    if (this.step === 'element') this.arrow.hidden = true;
    // the marker breathes and its arrow bounces
    if (this.marker.visible) {
      const tip = this.marker.getObjectByName('tip')!;
      tip.position.y = 1.0 + Math.abs(Math.sin(this.time * 3.2)) * 0.35;
      tip.rotation.y = this.time * 1.5;
      this.marker.scale.setScalar(1.6 + Math.sin(this.time * 4) * 0.1);
      // the cell may be taken (a tower or a reload): stop marking it
      if (this.game.towerAt(this.spot.col, this.spot.row)) this.marker.visible = false;
    }
    // the HUD element may have been rebuilt: find it again
    if (this.glowing && !this.glowing.isConnected) {
      const sel = this.step === 'element' ? '.hud-pick' : this.step === 'tower' ? '.hud-build .hud-tower' : this.step === 'start' ? '.hud-wave-btn' : null;
      this.glow(sel);
    }
    if (this.glowing && !this.arrow.hidden) {
      const r = (this.glowing as HTMLElement).getBoundingClientRect();
      const bounce = Math.abs(Math.sin(this.time * 4)) * 10;
      const below = r.top < window.innerHeight / 2;
      this.arrow.classList.toggle('up', below);
      this.arrow.style.left = `${r.left + r.width / 2}px`;
      this.arrow.style.top = below ? `${r.bottom + 6 + bounce}px` : `${r.top - 42 - bounce}px`;
      this.arrow.style.visibility = r.height > 0 ? 'visible' : 'hidden';
    }
    if (this.step === 'controls' && (this.controlsTimer -= dt) <= 0) this.finish();
    if (this.game.phase === 'won' || this.game.phase === 'lost') this.finish();
  }
}
