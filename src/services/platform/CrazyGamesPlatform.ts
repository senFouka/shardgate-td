import type { AdOutcome, PlatformService } from './PlatformService';
import { readLocal } from './localStore';

/**
 * Adapter for the CrazyGames HTML5 SDK v3, written against
 * https://docs.crazygames.com/sdk/intro/, /video-ads/, /game/ and /data/.
 *
 * The SDK script is loaded from index.html. On localhost the SDK runs in its
 * "local" environment and shows demo ads, so this adapter is exercised in
 * development too; on other hosts it reports "disabled" and init() throws,
 * letting the router fall back to the mock.
 */

interface CrazySdk {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  ad: {
    requestAd(
      type: 'midgame' | 'rewarded',
      callbacks: {
        adStarted?: () => void;
        adFinished?: () => void;
        adError?: (error: { code?: string; message?: string }) => void;
      },
    ): void;
  };
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart(): void;
    loadingStop(): void;
    settings: { muteAudio?: boolean };
    addSettingsChangeListener(listener: (settings: { muteAudio?: boolean }) => void): void;
  };
  data: {
    setItem(key: string, value: string): void;
    getItem(key: string): string | null;
    removeItem(key: string): void;
  };
}

/** If an ad has not even started after this long, treat it as unavailable. */
const START_TIMEOUT_MS = 12000;
/** Hard cap so a lost callback can never leave the game paused forever. */
const TOTAL_TIMEOUT_MS = 120000;

export class CrazyGamesPlatform implements PlatformService {
  name = 'crazygames';
  private sdk!: CrazySdk;
  private adPlaying = false;
  private platformMute = false;
  private readonly audioListeners: Array<(suppressed: boolean) => void> = [];

  static isPresent(): boolean {
    return typeof window !== 'undefined' && !!(window as unknown as { CrazyGames?: { SDK?: unknown } }).CrazyGames?.SDK;
  }

  async init(): Promise<void> {
    this.sdk = (window as unknown as { CrazyGames: { SDK: CrazySdk } }).CrazyGames.SDK;
    await this.sdk.init();
    if (this.sdk.environment === 'disabled') throw new Error('CrazyGames SDK disabled on this host');
    this.name = this.sdk.environment === 'local' ? 'crazygames-local' : 'crazygames';

    // the platform's mute setting wins over the in-game toggle
    this.platformMute = !!this.sdk.game.settings?.muteAudio;
    this.sdk.game.addSettingsChangeListener((settings) => {
      this.platformMute = !!settings.muteAudio;
      this.emitAudio();
    });
  }

  loadingStart(): void {
    this.sdk.game.loadingStart();
  }

  loadingStop(): void {
    this.sdk.game.loadingStop();
  }

  gameplayStart(): void {
    this.sdk.game.gameplayStart();
  }

  gameplayStop(): void {
    this.sdk.game.gameplayStop();
  }

  showRewardedAd(): Promise<AdOutcome> {
    return this.requestAd('rewarded');
  }

  showMidgameAd(): Promise<AdOutcome> {
    return this.requestAd('midgame');
  }

  /**
   * Wraps the callback API in a promise. Only `adFinished` counts as watched;
   * `adError` (no fill, ad blocker, cooldown...) and time-outs never reward.
   */
  private requestAd(type: 'midgame' | 'rewarded'): Promise<AdOutcome> {
    return new Promise<AdOutcome>((resolve) => {
      let settled = false;
      let started = false;

      const finish = (outcome: AdOutcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(startTimer);
        clearTimeout(totalTimer);
        this.adPlaying = false;
        this.emitAudio();
        resolve(outcome);
      };

      const startTimer = setTimeout(() => {
        if (!started) finish('unavailable');
      }, START_TIMEOUT_MS);
      const totalTimer = setTimeout(() => finish('error'), TOTAL_TIMEOUT_MS);

      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => {
            started = true;
            this.adPlaying = true;
            this.emitAudio(); // mute while the ad plays, as the SDK requires
          },
          adFinished: () => finish('rewarded'),
          adError: (error) => {
            const code = error?.code ?? '';
            finish(
              code === 'adblock'
                ? 'adblock'
                : code === 'unfilled'
                  ? 'unavailable'
                  : code === 'adsDisabledBasicLaunch'
                    ? 'disabled'
                    : 'error',
            );
          },
        });
      } catch {
        finish('error');
      }
    });
  }

  isAudioSuppressed(): boolean {
    return this.adPlaying || this.platformMute;
  }

  onAudioSuppressedChange(listener: (suppressed: boolean) => void): void {
    this.audioListeners.push(listener);
  }

  private emitAudio(): void {
    const suppressed = this.isAudioSuppressed();
    for (const listener of this.audioListeners) listener(suppressed);
  }

  async save(key: string, value: string): Promise<void> {
    try {
      if (value === '') this.sdk.data.removeItem(key);
      else this.sdk.data.setItem(key, value);
    } catch {
      /* a failed save must never break gameplay */
    }
  }

  async load(key: string): Promise<string | null> {
    try {
      return this.sdk.data.getItem(key);
    } catch {
      return null;
    }
  }

  /** What the mock saved on visits where this SDK failed to load. */
  async readFallback(key: string): Promise<string | null> {
    return readLocal(key);
  }
}
