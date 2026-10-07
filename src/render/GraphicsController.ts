import {
  AUTO_CHECK,
  PRESETS,
  detectTier,
  presetOf,
  stepDown,
  type GraphicsDetails,
  type GraphicsSettings,
  type Preset,
} from '../data/graphics';
import { gameEvents } from '../core/EventBus';
import type { GameRenderer } from './GameRenderer';

/** Where the settings are kept (the profile in the game, memory in the slices). */
export interface GraphicsStore {
  graphics: GraphicsSettings;
  setGraphics(g: GraphicsSettings): void;
}

/**
 * Decides which graphics settings are in effect and keeps the renderer in
 * step with them:
 *
 * - automatic (default): a preset from the hardware at boot, then one or two
 *   steps down if the first seconds of play run slowly
 * - manual: whatever the player picked (a preset or single details);
 *   automatic changes never override it
 */
export class GraphicsController {
  private checking = false;
  private samples: number[] = [];
  private elapsed = 0;

  constructor(
    private readonly renderer: GameRenderer,
    private readonly store: GraphicsStore,
  ) {
    const g = { ...store.graphics, details: { ...store.graphics.details } };
    const gpu = renderer.gpuName();
    if (g.auto && (g.detectedTier === null || g.gpu !== gpu)) {
      const tier = detectTier({
        gpu,
        mobile: isMobileDevice(),
        memoryGB: (navigator as unknown as { deviceMemory?: number }).deviceMemory,
        cores: navigator.hardwareConcurrency,
      });
      g.detectedTier = tier;
      g.gpu = gpu;
      g.preset = tier;
      g.details = { ...PRESETS[tier] };
      console.info(`[graphics] auto-detected "${tier}" for GPU "${gpu || 'hidden'}"`);
    }
    this.store.setGraphics(g);
    renderer.apply(g.details);
    this.checking = g.auto;
  }

  get settings(): GraphicsSettings {
    return this.store.graphics;
  }

  /** The player picked a whole preset. */
  setPreset(p: Preset): void {
    this.commit({ ...this.settings, auto: false, preset: p, details: { ...PRESETS[p] } });
  }

  /** The player changed one detail; the preset becomes whatever matches (usually Custom). */
  setDetail<K extends keyof GraphicsDetails>(key: K, value: GraphicsDetails[K]): void {
    const details = { ...this.settings.details, [key]: value };
    this.commit({ ...this.settings, auto: false, preset: presetOf(details), details });
  }

  /** Back to automatic: re-detect now and run the frame-rate check again. */
  resetToAuto(): void {
    const tier = this.settings.detectedTier ?? 'medium';
    this.commit({ ...this.settings, auto: true, preset: tier, details: { ...PRESETS[tier] } });
    this.samples = [];
    this.elapsed = 0;
    this.checking = true;
  }

  private commit(g: GraphicsSettings, reason: 'player' | 'auto' = 'player'): void {
    this.store.setGraphics(g);
    this.renderer.apply(g.details);
    gameEvents.emit('graphics:changed', { preset: g.preset, reason });
  }

  /**
   * Call every frame with the real frame time while the game is actually
   * running (not paused, tab visible). Lowers an automatic preset once the
   * sample window shows a median below the target.
   */
  sampleFrame(realDtMs: number): void {
    if (!this.checking || !this.settings.auto) return;
    this.elapsed += realDtMs;
    if (this.elapsed < AUTO_CHECK.warmupMs) return;
    this.samples.push(realDtMs);
    if (this.elapsed < AUTO_CHECK.warmupMs + AUTO_CHECK.sampleMs) return;

    const sorted = [...this.samples].sort((a, b) => a - b);
    const medianFps = 1000 / sorted[Math.floor(sorted.length / 2)];
    this.samples = [];
    this.elapsed = 0;
    const current = this.settings.preset === 'custom' ? 'medium' : this.settings.preset;
    const lower = medianFps < AUTO_CHECK.minFps ? stepDown(current) : null;
    if (!lower) {
      console.info(`[graphics] frame-rate check passed: median ${medianFps.toFixed(0)} fps on "${current}"`);
      this.checking = false; // fast enough (or already Low): done for this session
      return;
    }
    console.info(`[graphics] median ${medianFps.toFixed(0)} fps on "${current}": stepping down to "${lower}"`);
    this.commit({ ...this.settings, preset: lower, details: { ...PRESETS[lower] }, detectedTier: lower }, 'auto');
  }
}

export function isMobileDevice(): boolean {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS reports a desktop Safari user agent
  return navigator.maxTouchPoints > 1 && /Macintosh/.test(ua);
}
