import { platform } from '../services/platform';
import { el, uiRoot } from './dom';

export interface FocusPauseHooks {
  /** false when there is nothing to pause (no game yet, game over, a menu already open) */
  canPause(): boolean;
  onPause(): void;
  onResume(): void;
}

/**
 * Pauses the game when the player looks away: another window takes focus,
 * or the tab is hidden. It resumes only on a tap, so nobody comes back to a
 * wave already leaking.
 *
 * Ported from Element Warden (UIScene buildFocusPause / pauseForFocus); same
 * behaviour, now an HTML overlay listening to window and document events.
 */
export class FocusPause {
  private readonly overlay: HTMLElement;

  constructor(private readonly hooks: FocusPauseHooks) {
    this.overlay = el('div', { class: 'ui-overlay', hidden: '', role: 'dialog', 'aria-label': 'Paused' }, [
      el('strong', { text: 'PAUSED' }),
      el('span', { text: 'Tap anywhere to continue' }),
    ]);
    uiRoot().append(this.overlay);
    this.overlay.addEventListener('pointerup', () => this.resume());
    window.addEventListener('keydown', (e) => {
      if (this.visible && (e.code === 'Enter' || e.code === 'Space')) this.resume();
    });
    window.addEventListener('blur', () => this.pause());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.pause();
    });
  }

  get visible(): boolean {
    return !this.overlay.hidden;
  }

  private pause(): void {
    if (this.visible || !this.hooks.canPause()) return;
    this.overlay.hidden = false;
    this.hooks.onPause();
    platform.gameplayStop();
  }

  private resume(): void {
    if (!this.visible) return;
    this.overlay.hidden = true;
    this.hooks.onResume();
    platform.gameplayStart();
  }
}
