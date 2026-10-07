import type { AdOutcome, PlatformService } from './PlatformService';
import { readLocal, writeLocal } from './localStore';

/**
 * Fallback used when the CrazyGames SDK is missing (offline, blocked, or on a
 * host where it is disabled). Saves to localStorage.
 *
 * Ads are honest by default: there is no ad network here, so a rewarded ad is
 * reported as unavailable and grants nothing. Add `?mockAds=1` to the URL to
 * simulate a watched ad (2 s) while developing.
 */
export class MockPlatform implements PlatformService {
  readonly name = 'mock';
  private readonly simulateAds =
    typeof location !== 'undefined' && new URLSearchParams(location.search).has('mockAds');
  private adPlaying = false;
  private readonly audioListeners: Array<(suppressed: boolean) => void> = [];

  async init(): Promise<void> {
    console.info('[platform] mock init', this.simulateAds ? '(simulated ads ON)' : '(no ads)');
  }

  loadingStart(): void {
    console.info('[platform] loadingStart');
  }

  loadingStop(): void {
    console.info('[platform] loadingStop');
  }

  gameplayStart(): void {
    console.info('[platform] gameplayStart');
  }

  gameplayStop(): void {
    console.info('[platform] gameplayStop');
  }

  async showRewardedAd(): Promise<AdOutcome> {
    if (!this.simulateAds) {
      console.info('[platform] rewarded ad requested -> unavailable (mock has no ads)');
      return 'unavailable';
    }
    console.info('[platform] rewarded ad requested (simulated 2s)');
    this.setAdPlaying(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    this.setAdPlaying(false);
    console.info('[platform] rewarded ad finished -> reward granted');
    return 'rewarded';
  }

  async showMidgameAd(): Promise<AdOutcome> {
    if (!this.simulateAds) {
      console.info('[platform] midgame ad requested -> none (mock has no ads)');
      return 'unavailable';
    }
    console.info('[platform] midgame ad requested (simulated 2s)');
    this.setAdPlaying(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    this.setAdPlaying(false);
    return 'rewarded';
  }

  private setAdPlaying(playing: boolean): void {
    this.adPlaying = playing;
    for (const listener of this.audioListeners) listener(playing);
  }

  isAudioSuppressed(): boolean {
    return this.adPlaying;
  }

  onAudioSuppressedChange(listener: (suppressed: boolean) => void): void {
    this.audioListeners.push(listener);
  }

  async save(key: string, value: string): Promise<void> {
    writeLocal(key, value);
  }

  async load(key: string): Promise<string | null> {
    return readLocal(key);
  }

  /** The mock is the fallback store itself; there is nothing else to read. */
  async readFallback(): Promise<string | null> {
    return null;
  }
}
