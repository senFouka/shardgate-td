import { CrazyGamesPlatform } from './CrazyGamesPlatform';
import { MockPlatform } from './MockPlatform';
import type { AdOutcome, PlatformService } from './PlatformService';

/**
 * The one platform object the game talks to. It picks its backend during
 * init(): the CrazyGames SDK when it loaded and is enabled on this host
 * (including its "local" mode on localhost), otherwise the mock.
 */
class PlatformRouter implements PlatformService {
  private impl: PlatformService = new MockPlatform();
  /**
   * Whether ad offers should be shown at all. Off in a build made with
   * VITE_ADS=off (the CrazyGames Basic Launch build, where ads are disabled),
   * and switched off at runtime if the SDK says ads are disabled.
   */
  private adsOn = import.meta.env.VITE_ADS !== 'off';
  private readonly adsListeners: Array<(on: boolean) => void> = [];

  adsEnabled(): boolean {
    return this.adsOn;
  }

  onAdsEnabledChange(listener: (on: boolean) => void): void {
    this.adsListeners.push(listener);
  }

  private noteOutcome(outcome: AdOutcome): AdOutcome {
    if (outcome === 'disabled' && this.adsOn) {
      this.adsOn = false;
      console.info('[platform] ads are disabled on this platform: hiding every ad offer');
      for (const l of this.adsListeners) l(false);
    }
    return outcome;
  }

  get name(): string {
    return this.impl.name;
  }

  async init(): Promise<void> {
    if (CrazyGamesPlatform.isPresent()) {
      const crazy = new CrazyGamesPlatform();
      try {
        await crazy.init();
        this.impl = crazy;
        console.info(`[platform] using ${crazy.name}`);
        return;
      } catch (e) {
        console.info('[platform] CrazyGames SDK unavailable, using mock:', e);
      }
    }
    this.impl = new MockPlatform();
    await this.impl.init();
  }

  loadingStart(): void {
    this.impl.loadingStart();
  }
  loadingStop(): void {
    this.impl.loadingStop();
  }
  gameplayStart(): void {
    this.impl.gameplayStart();
  }
  gameplayStop(): void {
    this.impl.gameplayStop();
  }
  async showRewardedAd(): Promise<AdOutcome> {
    if (!this.adsOn) return 'disabled';
    return this.noteOutcome(await this.impl.showRewardedAd());
  }
  async showMidgameAd(): Promise<AdOutcome> {
    if (!this.adsOn) return 'disabled';
    return this.noteOutcome(await this.impl.showMidgameAd());
  }
  isAudioSuppressed(): boolean {
    return this.impl.isAudioSuppressed();
  }
  onAudioSuppressedChange(listener: (suppressed: boolean) => void): void {
    // registered on the live backend, which is chosen before any scene runs
    this.impl.onAudioSuppressedChange(listener);
  }
  save(key: string, value: string): Promise<void> {
    return this.impl.save(key, value);
  }
  load(key: string): Promise<string | null> {
    return this.impl.load(key);
  }
  readFallback(key: string): Promise<string | null> {
    return this.impl.readFallback(key);
  }
}

export const platform = new PlatformRouter();

export type { AdOutcome, PlatformService };
