import { BALANCE, MAX_TOWER_LEVEL, towerStats, type TowerStats } from '../data/balance';
import { ELEMENTS, ELEMENT_ORDER, counterOf, elementMultiplier, type ElementId } from '../data/elements';
import { Game, isElement, type Tower, type TowerId } from '../game/Game';
import { el, uiRoot } from './dom';
import { DIFFICULTY_NAMES, DIFFICULTY_ORDER, type DifficultyId } from '../data/difficulty';

/**
 * The in-game HUD (HTML over the canvas):
 * - top bar: lives, gold, wave (with its armor element) and the next-wave button
 * - element pick: the three elements on offer, or a random pick for gold
 * - bottom build bar: Bolt, Mortar and one button per owned element
 * - tower panel: stats, Upgrade, Convert (basic towers) and Sell
 * - end screen: won / lost, with Play again
 */
const svg = (body: string, color = 'currentColor') =>
  `<svg viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ELEMENT_ICONS: Record<ElementId, string> = {
  ember: '<path d="M20 35c-7 0-11-5-11-11 0-6 5-9 6-15 3 3 4 6 4 9 2-2 3-5 3-8 5 4 9 9 9 15s-4 10-11 10z"/><path d="M20 35c-3 0-5-2-5-5 0-3 3-5 4-8 2 2 6 4 6 8 0 3-2 5-5 5z"/>',
  frost: '<path d="M20 4v32M6 12l28 16M6 28l28-16"/><path d="M16 7l4 4 4-4M16 33l4-4 4 4M5 17l6 0 -2 -5M35 23l-6 0 2 5"/>',
  gale: '<path d="M23 4 10 22h9l-3 14 14-19h-9z"/>',
  stone: '<path d="M5 33l7-15 6 4 6-12 11 23z"/><path d="M12 18l3 7M24 10l-2 9"/>',
  venom: '<path d="M20 5c5 8 10 13 10 19a10 10 0 0 1-20 0c0-6 5-11 10-19z"/><circle cx="17" cy="24" r="2"/><circle cx="23" cy="28" r="1.5"/>',
  tide: '<path d="M4 16c4-5 8-5 12 0s8 5 12 0 6-4 8-2"/><path d="M4 24c4-5 8-5 12 0s8 5 12 0 6-4 8-2"/><path d="M4 32c4-5 8-5 12 0s8 5 12 0 6-4 8-2"/>',
};

const TOWER_INFO: Record<TowerId, { name: string; blurb: string; icon: string }> = {
  bolt: {
    name: 'Bolt',
    blurb: 'Fast shots at one enemy, ground or air',
    icon: svg('<path d="M8 32 32 8"/><path d="M26 8h6v6"/><path d="M6 20c6-1 13 6 14 14"/><path d="M20 6c1 6 8 13 14 14"/>'),
  },
  mortar: {
    name: 'Mortar',
    blurb: 'Slow shells that hit a group on the ground (cannot hit flying enemies)',
    icon: svg('<path d="M9 33h22"/><path d="M12 33l3-8h10l3 8"/><path d="M17 25l5-13 7 3-5 10"/><circle cx="28" cy="8" r="2.5"/>'),
  },
  ...(Object.fromEntries(
    ELEMENT_ORDER.map((e) => [e, { name: ELEMENTS[e].tower, blurb: ELEMENTS[e].blurb, icon: svg(ELEMENT_ICONS[e], ELEMENTS[e].color) }]),
  ) as Record<ElementId, { name: string; blurb: string; icon: string }>),
};

/** "Watch an ad" badge: a small play button. */
const AD_ICON = '<svg class="hud-ad-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3" fill="#f2c14b"/><path d="M10 9v6l5-3z" fill="#1b150f"/></svg>';

export function elementIcon(e: ElementId): string {
  return svg(ELEMENT_ICONS[e], ELEMENTS[e].color);
}

export interface HudHooks {
  /** display name of a wave's creeps (or its boss) */
  waveName(wave: number, boss: boolean): string;
  onPickTower(kind: TowerId | null): void;
  onSell(tower: Tower): void;
  onUpgrade(tower: Tower): void;
  onConvert(tower: Tower, element: ElementId): void;
  onPickElement(choice: ElementId | 'random'): void;
  /** a new game on this difficulty (only offered before the first wave and on the end screen) */
  onDifficulty(d: DifficultyId): void;
  onCloseTower(): void;
  /** rewarded ads (the player's choice; hidden when ads are off) */
  onAdReroll(): void;
  onAdRefill(): void;
  onAdContinue(): void;
  /** gold for the upgrade of this tower, then the upgrade */
  onAdUpgrade(tower: Tower): void;
  /** gold for one tower of this kind, then build mode for it */
  onAdBuild(kind: TowerId): void;
  onRestart(): void;
}

export class GameHud {
  private game!: Game;
  private readonly lives = el('span', { class: 'hud-num' });
  private readonly gold = el('span', { class: 'hud-num' });
  private readonly wave = el('span', { class: 'hud-num' });
  private readonly waveName = el('span', { class: 'hud-sub' });
  private readonly armor = el('span', { class: 'hud-armor' });
  private readonly waveBtn = el('button', { class: 'ui-btn hud-wave-btn', type: 'button' });
  private readonly refillBtn = el('button', { class: 'ui-btn hud-ad-btn hud-refill', type: 'button', hidden: '', title: 'Watch an ad to refill your lives (once per game)' });
  /** false when the platform has ads switched off: every ad offer is hidden */
  private adsOn = true;
  private readonly diffTag = el('span', { class: 'hud-diff-tag' });
  private readonly diffRow = el('div', { class: 'hud-diff', role: 'group', 'aria-label': 'Difficulty' });
  private readonly bar = el('div', { class: 'hud-build' });
  private readonly buildBtns = new Map<TowerId, HTMLButtonElement>();
  private readonly picker = el('div', { class: 'hud-pick', hidden: '' });
  private readonly panel = el('div', { class: 'hud-panel', hidden: '' });
  /** "not enough gold: watch an ad" offer for a build the player tapped */
  private readonly goldOffer = el('div', { class: 'hud-gold-offer', role: 'dialog', hidden: '' });
  private goldOfferTimer = 0;
  private readonly end = el('div', { class: 'ui-modal', hidden: '' });
  private picked: TowerId | null = null;
  private shown: Tower | null = null;
  private barKey = '-';
  private offerKey = '-';

  constructor(private readonly hooks: HudHooks) {
    const chip = (icon: string, value: HTMLElement, ...extra: HTMLElement[]) =>
      el('div', { class: 'hud-chip' }, [el('span', { class: 'hud-icon', html: icon }), el('div', { class: 'hud-stack' }, [value, ...extra])]);
    const top = el('div', { class: 'hud-top' }, [
      chip('<svg viewBox="0 0 24 24"><path fill="#e2475b" d="M12 21s-7.5-4.6-9.4-9.4C1.2 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.8 3.5 4.4 7.1C19.5 16.4 12 21 12 21z"/></svg>', this.lives),
      chip('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="#f2c14b" stroke="#a8761c" stroke-width="1.5"/><path d="M9 12h6M12 9v6" stroke="#a8761c" stroke-width="1.6"/></svg>', this.gold),
      chip('<svg viewBox="0 0 24 24" fill="none" stroke="#9fc8ff" stroke-width="1.8"><path d="M3 12c3-4 6-4 9 0s6 4 9 0"/><path d="M3 17c3-4 6-4 9 0s6 4 9 0" opacity=".5"/></svg>', el('div', { class: 'hud-wave-line' }, [this.wave, this.diffTag]), this.waveName, this.armor),
      this.refillBtn,
      this.waveBtn,
    ]);
    this.refillBtn.innerHTML = `${AD_ICON}<span>Refill lives</span>`;
    this.refillBtn.addEventListener('click', () => this.hooks.onAdRefill());
    this.waveBtn.addEventListener('click', () => this.game.callWave());
    uiRoot().append(top, this.diffRow, this.bar, this.picker, this.panel, this.goldOffer, this.end);
    window.addEventListener('keydown', (e) => {
      // keys by physical position (works on AZERTY too); no Escape: it belongs to the browser
      if (e.code === 'KeyX') {
        this.pick(null);
        this.hooks.onCloseTower();
      }
      if (e.code === 'KeyU' && this.shown) this.hooks.onUpgrade(this.shown);
      const digit = /^(?:Digit|Numpad)([1-8])$/.exec(e.code);
      if (digit) {
        const kind = [...this.buildBtns.keys()][Number(digit[1]) - 1];
        if (kind) this.pressTower(kind);
      }
      if (e.code === 'Space' && this.end.hidden) {
        e.preventDefault();
        this.game.callWave();
      }
    });
  }

  bind(game: Game): void {
    this.game = game;
    this.diffTag.textContent = DIFFICULTY_NAMES[game.difficulty];
    this.diffTag.dataset.d = game.difficulty;
    this.diffRow.replaceChildren(el('span', { class: 'hud-diff-label', text: 'Difficulty' }), ...this.difficultyButtons(game.difficulty));
    this.end.hidden = true;
    this.barKey = '-';
    this.offerKey = '-';
    this.showTower(null);
    this.pick(null);
    this.update();
  }

  setAdsEnabled(on: boolean): void {
    this.adsOn = on;
    this.offerKey = '-';
    if (!this.end.hidden) this.end.querySelector<HTMLElement>('.hud-continue')?.toggleAttribute('hidden', !on);
  }

  get pickedTower(): TowerId | null {
    return this.picked;
  }

  pick(kind: TowerId | null): void {
    this.picked = kind;
    for (const [k, b] of this.buildBtns) b.setAttribute('aria-pressed', String(k === kind));
    this.hooks.onPickTower(kind);
  }

  /**
   * A build button was pressed: pick the tower, or, when its gold is missing
   * and the wave's gold ad is still there, go straight to the ad.
   */
  private pressTower(kind: TowerId): void {
    if (this.buildBtns.get(kind)?.classList.contains('ad')) {
      this.hooks.onAdBuild(kind);
      return;
    }
    this.pick(this.picked === kind ? null : kind);
  }

  /** Bolt, Mortar, then every owned element (rebuilt when an element arrives). */
  private refreshBar(): void {
    const g = this.game;
    const owned = ELEMENT_ORDER.filter((e) => g.elements[e] > 0);
    const key = owned.map((e) => e + g.elements[e]).join(',');
    if (key === this.barKey) return;
    this.barKey = key;
    this.buildBtns.clear();
    const kinds: TowerId[] = ['bolt', 'mortar', ...owned];
    this.bar.replaceChildren(
      ...kinds.map((kind, i) => {
        const info = TOWER_INFO[kind];
        const lvl = isElement(kind) && g.elements[kind] > 1 ? el('span', { class: 'hud-elv', text: `Lv ${g.elements[kind]}` }) : null;
        const b = el('button', { class: `ui-btn hud-tower${isElement(kind) ? ' el' : ''}`, type: 'button', 'aria-pressed': String(this.picked === kind), title: `${info.name} (${i + 1}): ${info.blurb}` }, [
          el('span', { class: 'hud-tower-icon', html: info.icon }),
          el('span', { class: 'hud-tower-name', text: isElement(kind) ? ELEMENTS[kind].name : info.name }),
          el('span', { class: 'hud-tower-cost' }, [el('span', { class: 'hud-cost-ad', html: AD_ICON }), String(towerStats(kind, 1).cost)]),
          ...(lvl ? [lvl] : []),
        ]);
        if (isElement(kind)) b.style.setProperty('--el', ELEMENTS[kind].color);
        b.dataset.title = b.title;
        b.addEventListener('click', () => this.pressTower(kind));
        this.buildBtns.set(kind, b);
        return b;
      }),
    );
  }

  /** The element offer: three cards and a random pick. Never blocks the game. */
  private refreshPicker(): void {
    const g = this.game;
    const offer = g.offer;
    const key = offer ? offer.join(',') + g.pickIsFree + g.canRerollOffer : '';
    if (key === this.offerKey) return;
    this.offerKey = key;
    this.picker.hidden = !offer;
    if (!offer) return;
    const cards = offer.map((e) => {
      const info = ELEMENTS[e];
      const lv = g.elements[e];
      const b = el('button', { class: 'ui-btn hud-pick-card', type: 'button' }, [
        el('span', { class: 'hud-pick-icon', html: elementIcon(e) }),
        el('span', { class: 'hud-pick-text' }, [
          el('b', { text: lv > 0 ? `${info.name} → Lv ${lv + 1}` : info.name }),
          el('small', { text: lv > 0 ? `All ${info.name} towers +${Math.round(BALANCE.elements.levelBonus * 100)}% damage` : `${info.tower}: ${info.blurb}` }),
        ]),
      ]);
      b.style.setProperty('--el', info.color);
      b.addEventListener('click', () => this.hooks.onPickElement(e));
      return b;
    });
    const random = el('button', { class: 'ui-btn hud-pick-random', type: 'button', text: `Random element  +${BALANCE.elements.randomGold} gold` });
    random.addEventListener('click', () => this.hooks.onPickElement('random'));
    const reroll = el('button', { class: 'ui-btn hud-ad-btn hud-pick-reroll', type: 'button', title: 'Watch an ad for three other elements (once per pick)' });
    reroll.innerHTML = `${AD_ICON}<span>Other elements</span>`;
    reroll.addEventListener('click', () => this.hooks.onAdReroll());
    reroll.hidden = !this.adsOn || !g.canRerollOffer;
    this.picker.replaceChildren(
      el('div', { class: 'hud-pick-title', text: 'Choose an element' }),
      el('p', {
        class: 'hud-pick-note',
        text: g.pickIsFree ? 'It unlocks at once.' : 'Its guardian walks the road. Defeat it (or let it pass) and the element is yours.',
      }),
      ...cards,
      random,
      reroll,
    );
  }

  showTower(t: Tower | null): void {
    this.shown = t;
    this.panel.hidden = !t;
    if (!t) return;
    const upgrade = el('button', { class: 'ui-btn hud-upgrade', type: 'button' });
    upgrade.addEventListener('click', () => (upgrade.classList.contains('ad') ? this.hooks.onAdUpgrade(t) : this.hooks.onUpgrade(t)));
    const sell = el('button', { class: 'ui-btn hud-sell', type: 'button' });
    sell.addEventListener('click', () => this.hooks.onSell(t));
    const close = el('button', { class: 'ui-btn hud-close', type: 'button', 'aria-label': 'Close', text: '✕' });
    close.addEventListener('click', () => this.hooks.onCloseTower());
    this.panel.replaceChildren(
      el('div', { class: 'hud-panel-head' }, [
        el('span', { class: 'hud-tower-icon', html: TOWER_INFO[t.kind].icon }),
        el('strong', { text: TOWER_INFO[t.kind].name }),
        el('span', { class: 'hud-level' }),
        close,
      ]),
      el('div', { class: 'hud-stats' }),
      el('div', { class: 'hud-effect' }),
      el('div', { class: 'hud-convert' }),
      el('div', { class: 'hud-actions' }, [upgrade, sell]),
    );
    this.panelKey = '';
    this.refreshPanel(true);
  }

  private panelKey = '';
  private refreshPanel(force = false): void {
    const t = this.shown;
    if (!t) return;
    const g = this.game;
    const cost = g.upgradeCost(t);
    const owned = ELEMENT_ORDER.filter((e) => g.elements[e] > 0);
    const key = `${t.id}:${t.kind}:${t.level}:${t.kills}:${g.gold}:${g.refundFor(t)}:${owned.join()}:${g.wave}:${t.work ? Math.ceil(t.work.left) : '-'}:${this.canOfferGold()}`;
    if (!force && key === this.panelKey) return;
    this.panelKey = key;
    const s = towerStats(t.kind, t.level);
    const next = cost === null ? null : towerStats(t.kind, t.level + 1);
    const stat = (label: string, value: string, up?: string) =>
      el('div', { class: 'hud-stat' }, [el('span', { text: label }), el('b', { text: value }, up ? [el('i', { text: ` → ${up}` })] : [])]);
    const bonus = g.levelBonus(t.kind);
    const dmg = (x: TowerStats) => String(Math.round(x.damage * bonus));
    this.panel.querySelector('.hud-level')!.textContent = `Lv ${t.level}/${MAX_TOWER_LEVEL}`;
    this.panel.querySelector('.hud-stats')!.replaceChildren(
      stat('Damage', dmg(s) + (s.splash && !isElement(t.kind) ? ' (area)' : ''), next ? dmg(next) : undefined),
      stat('DPS', (Game.dps(t.kind, t.level) * bonus).toFixed(1), next ? (Game.dps(t.kind, t.level + 1) * bonus).toFixed(1) : undefined),
      stat('Range', String(s.range), next ? String(next.range) : undefined),
      stat('Kills', String(t.kills)),
    );
    // what the tower does besides damage, and how it fares against this wave
    const lines: string[] = [];
    if (s.groundOnly) lines.push('Ground only: cannot hit flying enemies.');
    if (s.burnDps) lines.push(`Burns for ${Math.round(s.burnDps * bonus)}/s over ${s.burnTime}s.`);
    if (s.slow !== undefined) lines.push(`Slows to ${Math.round(s.slow * 100)}% speed for ${s.slowTime}s; shards splash nearby enemies.`);
    if (s.chain) lines.push(`Lightning jumps to ${s.chain} more enemies.`);
    if (s.stunChance) lines.push(`${Math.round(s.stunChance * 100)}% chance to stun for ${s.stunTime}s.`);
    if (s.poisonDps) lines.push(`Poison stacks up to ${s.poisonStacks}× (${Math.round(s.poisonDps * bonus)}/s each); each stack makes the enemy take +${Math.round((s.shred ?? 0) * 100)}% damage.`);
    if (s.knockback) lines.push(`Splash wave pushes enemies back.`);
    const armor = Game.waveArmor(Math.max(1, g.wave));
    if (isElement(t.kind) && armor) {
      const m = elementMultiplier(t.kind, armor);
      if (m !== 1) lines.push(`${m > 1 ? 'Strong' : 'Weak'} against this wave (${ELEMENTS[armor].name} armor): ×${m}.`);
    }
    this.panel.querySelector('.hud-effect')!.replaceChildren(...lines.map((l) => el('p', { text: l })));
    // basic towers turn into any owned element tower of the same level
    const conv = this.panel.querySelector('.hud-convert')!;
    const options = isElement(t.kind) ? [] : owned;
    conv.replaceChildren(
      ...(options.length ? [el('span', { class: 'hud-convert-title', text: 'Convert to' })] : []),
      ...options.map((e) => {
        const price = g.convertCost(t, e)!;
        const b = el('button', { class: 'ui-btn hud-convert-btn', type: 'button', title: `${ELEMENTS[e].tower}, level ${t.level}` }, [
          el('span', { class: 'hud-tower-icon', html: elementIcon(e) }),
          el('span', { class: 'hud-tower-cost', text: String(price) }),
        ]);
        b.disabled = g.gold < price || !!t.work;
        b.addEventListener('click', () => this.hooks.onConvert(t, e));
        return b;
      }),
    );
    const up = this.panel.querySelector<HTMLButtonElement>('.hud-upgrade')!;
    if (t.work) {
      const what = t.work.type === 'build' ? 'Building' : t.work.type === 'upgrade' ? `To Lv ${t.level + 1}` : `To ${ELEMENTS[t.work.to!].name}`;
      up.textContent = `${what}… ${Math.ceil(t.work.left)}s`;
      up.disabled = true;
    } else if (cost === null) {
      up.textContent = 'Max level';
      up.disabled = true;
    } else if (g.gold < cost && this.canOfferGold()) {
      // short of gold: the button pays for the upgrade with an ad
      up.innerHTML = `${AD_ICON}<span>Upgrade ${cost} · ${Game.upgradeTime(t.level)}s</span>`;
      up.disabled = false;
    } else {
      up.textContent = `Upgrade ● ${cost} · ${Game.upgradeTime(t.level)}s`;
      up.disabled = g.gold < cost;
    }
    up.classList.toggle('ad', !t.work && cost !== null && g.gold < cost && this.canOfferGold());
    this.panel.querySelector('.hud-sell')!.textContent = `Sell +${g.refundFor(t)}`;
  }

  /** True when an ad-for-gold offer can be made now. */
  canOfferGold(): boolean {
    return this.adsOn && this.game.canAdGold;
  }

  /**
   * Offers gold for something the player could not afford ("Not enough gold
   * for X"): a rewarded ad grants its price. Goes away by itself after a while.
   */
  offerGold(what: string, price: number, onWatch: () => void): void {
    const watch = el('button', { class: 'ui-btn hud-ad-btn', type: 'button' });
    watch.innerHTML = `${AD_ICON}<span>Watch an ad: +${price} gold</span>`;
    const close = el('button', { class: 'ui-btn hud-close', type: 'button', 'aria-label': 'No thanks', text: '✕' });
    const hide = () => {
      this.goldOffer.hidden = true;
      clearTimeout(this.goldOfferTimer);
    };
    watch.addEventListener('click', () => {
      hide();
      onWatch();
    });
    close.addEventListener('click', hide);
    this.goldOffer.replaceChildren(
      el('div', { class: 'hud-gold-offer-text' }, [el('b', { text: 'Not enough gold' }), el('span', { text: `${what} costs ${price}. Once per wave.` })]),
      watch,
      close,
    );
    this.goldOffer.hidden = false;
    clearTimeout(this.goldOfferTimer);
    this.goldOfferTimer = window.setTimeout(hide, 7000);
  }

  /** One button per difficulty; the current one is pressed. */
  private difficultyButtons(current: DifficultyId): HTMLButtonElement[] {
    return DIFFICULTY_ORDER.map((d) => {
      const b = el('button', { class: 'ui-btn hud-diff-btn', type: 'button', 'aria-pressed': String(d === current), 'data-d': d, text: DIFFICULTY_NAMES[d] });
      b.addEventListener('click', () => {
        if (d !== this.game.difficulty || this.game.phase !== 'ready') this.hooks.onDifficulty(d);
      });
      return b;
    });
  }

  hideEnd(): void {
    this.end.hidden = true;
  }

  showEnd(won: boolean, wave: number): void {
    const cont = el('button', { class: 'ui-btn hud-ad-btn hud-continue', type: 'button' });
    cont.innerHTML = `${AD_ICON}<span>Continue with ${Math.ceil(this.game.maxLives / 2)} lives</span>`;
    cont.addEventListener('click', () => this.hooks.onAdContinue());
    cont.hidden = won || !this.adsOn || !this.game.canContinue;
    const again = el('button', { class: 'ui-btn hud-again', type: 'button', text: `Play again (${DIFFICULTY_NAMES[this.game.difficulty]})` });
    again.addEventListener('click', () => this.hooks.onRestart());
    const other = el('div', { class: 'hud-end-diff' }, [el('span', { class: 'ui-note', text: 'or start a new game on' }), ...this.difficultyButtons(this.game.difficulty)]);
    const kills = this.game.towers.reduce((s, t) => s + t.kills, 0);
    this.end.replaceChildren(
      el('div', { class: 'ui-panel hud-end' }, [
        el('h2', { text: won ? 'The Shardgate holds!' : 'The Shardgate has fallen' }),
        el('p', { class: 'ui-note', text: won ? `All ${wave} waves defeated on ${DIFFICULTY_NAMES[this.game.difficulty]}.` : `You reached wave ${wave} of ${BALANCE.waves.count} on ${DIFFICULTY_NAMES[this.game.difficulty]}.` }),
        el('p', { class: 'ui-note', text: `Enemies defeated by your towers still standing: ${kills}` }),
        cont,
        again,
        other,
      ]),
    );
    this.end.hidden = false;
  }

  private armorKey = '';
  /** Called every frame. */
  update(): void {
    const g = this.game;
    this.lives.textContent = String(g.lives);
    this.gold.textContent = String(g.gold);
    // during the rest (and before the start) preview the coming wave
    const preview = g.phase === 'ready' || g.countdown > 0;
    const shownWave = Math.min(BALANCE.waves.count, Math.max(1, preview ? g.wave + 1 : g.wave));
    const boss = Game.isBossWave(shownWave);
    const name = this.hooks.waveName(shownWave, false) + (boss ? ` + boss ${this.hooks.waveName(shownWave, true)}` : '');
    this.wave.textContent = `Wave ${g.wave} / ${BALANCE.waves.count}`;
    this.waveName.textContent = preview ? `Next: ${name}` : name;
    const armor = Game.waveArmor(shownWave);
    const ak = `${armor}`;
    if (ak !== this.armorKey) {
      this.armorKey = ak;
      if (armor) {
        const weak = counterOf(armor);
        this.armor.innerHTML = `<i style="--el:${ELEMENTS[armor].color}"></i>${ELEMENTS[armor].name} armor · weak to <b style="color:${ELEMENTS[weak].color}">${ELEMENTS[weak].name}</b>`;
      } else this.armor.textContent = 'No armor';
    }
    // difficulty is chosen before the first wave, then locked for the game
    this.diffRow.hidden = g.phase !== 'ready';
    if (g.phase === 'ready') {
      this.waveBtn.hidden = false;
      this.waveBtn.textContent = 'Start';
      this.waveBtn.classList.add('glow');
    } else if (g.canCallWave) {
      this.waveBtn.hidden = false;
      const nw = g.wave + 1;
      const label = Game.isBossWave(nw) ? `Boss wave ${nw}` : `Wave ${nw}`;
      this.waveBtn.classList.toggle('glow', g.countdown > 0);
      this.waveBtn.textContent = g.countdown > 0 ? `${label} in ${Math.ceil(g.countdown)}s · Start now +${g.earlyBonus}` : `Start now +${g.earlyBonus}`;
    } else {
      this.waveBtn.hidden = true;
    }
    // offered once a life is lost, never pushed: the player decides
    this.refillBtn.hidden = !this.adsOn || !g.canRefillLives;
    this.refreshBar();
    this.refreshPicker();
    // a tower you cannot afford shows the ad badge instead of the coin, while the wave's gold ad is there
    const adGold = this.canOfferGold();
    for (const [k, b] of this.buildBtns) {
      const poor = g.gold < towerStats(k, 1).cost;
      b.classList.toggle('ad', poor && adGold);
      b.classList.toggle('poor', poor && !adGold);
      b.title = poor && adGold ? 'Watch an ad to get the gold for this tower (once per wave)' : (b.dataset.title ?? '');
    }
    this.refreshPanel();
  }
}
