import { gameEvents } from '../core/EventBus';
import { sfx } from '../systems/Sfx';
import { el, uiRoot } from './dom';
import { ICONS } from './icons';

/** The always-visible corner buttons: settings and mute (64 px touch targets). */
export function mountCornerButtons(onSettings: () => void): void {
  const settings = el('button', { class: 'ui-btn', type: 'button', 'aria-label': 'Settings', html: ICONS.settings });
  settings.addEventListener('click', onSettings);
  const mute = el('button', { class: 'ui-btn', type: 'button' });
  const refresh = () => {
    mute.innerHTML = sfx.muted ? ICONS.soundOff : ICONS.soundOn;
    mute.setAttribute('aria-label', sfx.muted ? 'Sound off' : 'Sound on');
  };
  mute.addEventListener('click', () => sfx.toggleMuted());
  gameEvents.on('audio:muted', refresh);
  refresh();
  uiRoot().append(el('div', { class: 'hud-corner' }, [settings, mute]));
}
