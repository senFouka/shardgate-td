/**
 * How a rewarded ad ended. Only `'rewarded'` may grant anything: it means the
 * platform confirmed the ad was watched to the end.
 */
/** 'disabled': the platform has ads switched off (CrazyGames Basic Launch). */
export type AdOutcome = 'rewarded' | 'unavailable' | 'adblock' | 'error' | 'disabled';

/**
 * Everything the game needs from the host platform.
 * Game code depends on this interface only, never on a vendor SDK.
 */
export interface PlatformService {
  /** Short name for logs: 'crazygames', 'local', 'mock'. */
  readonly name: string;

  /** Called once before the first scene runs. */
  init(): Promise<void>;

  /** Loading screen boundaries (platforms use these for their own UI). */
  loadingStart(): void;
  loadingStop(): void;

  /** The player is actively playing / has stopped (menus, popups, run over). */
  gameplayStart(): void;
  gameplayStop(): void;

  /** Resolves once the ad is over; grant the reward only on `'rewarded'`. */
  showRewardedAd(): Promise<AdOutcome>;
  /** Only at natural breaks, never during a wave. */
  showMidgameAd(): Promise<AdOutcome>;

  /**
   * True while game audio must stay silent: an ad is playing, or the platform
   * itself asked for mute. This overrides the player's in-game sound toggle.
   */
  isAudioSuppressed(): boolean;
  /** Called whenever `isAudioSuppressed()` may have changed. */
  onAudioSuppressedChange(listener: (suppressed: boolean) => void): void;

  save(key: string, value: string): Promise<void>;
  load(key: string): Promise<string | null>;

  /**
   * The browser-local store used when the platform SDK is unavailable, read
   * so the save system can reconcile it with the platform's own store.
   * Null when this platform *is* that local store (the mock).
   */
  readFallback(key: string): Promise<string | null>;
}
