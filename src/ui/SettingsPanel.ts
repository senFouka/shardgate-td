import type { GraphicsController } from '../render/GraphicsController';
import type { GraphicsDetails, Preset } from '../data/graphics';
import { gameEvents } from '../core/EventBus';
import { sfx } from '../systems/Sfx';
import { profile } from '../systems/ProfileStore';
import { el, segmented, uiRoot } from './dom';
import { ICONS } from './icons';

const PRESET_LABEL: Record<Preset | 'custom', string> = { low: 'Low', medium: 'Medium', high: 'High', custom: 'Custom' };

/**
 * Settings: sound, and graphics as a quality preset plus each detail on its
 * own. Every change applies immediately; touching a detail turns the preset
 * into Custom. "Use automatic" hands the choice back to the game.
 */
export class SettingsPanel {
  private readonly modal: HTMLElement;
  private readonly refreshers: Array<() => void> = [];
  private readonly autoNote: HTMLElement;
  private readonly autoBtn: HTMLButtonElement;

  constructor(
    private readonly graphics: GraphicsController,
    private readonly hooks: { onOpen(): void; onClose(): void },
  ) {
    const close = el('button', { class: 'ui-btn', type: 'button', 'aria-label': 'Close settings', html: ICONS.close });
    close.addEventListener('click', () => this.close());

    const sound = segmented([{ value: true, label: 'On' }, { value: false, label: 'Off' }], (on) => sfx.setMuted(!on), true);
    this.refreshers.push(() => sound.set(!sfx.muted));

    const slider = (id: string, label: string, get: () => number, set: (v: number) => void) => {
      const input = el('input', { type: 'range', min: '0', max: '100', step: '5', id, class: 'ui-range', 'aria-label': label }) as HTMLInputElement;
      const value = el('span', { class: 'ui-range-value' });
      const show = () => {
        input.value = String(Math.round(get() * 100));
        value.textContent = `${input.value}%`;
      };
      input.addEventListener('input', () => {
        set(Number(input.value) / 100);
        value.textContent = `${input.value}%`;
      });
      this.refreshers.push(show);
      return el('div', { class: 'ui-row' }, [el('span', { text: label }), el('div', { class: 'ui-range-row' }, [input, value])]);
    };
    const musicRow = slider('music-volume', 'Music', () => profile.musicVolume, (v) => profile.setVolumes(v, profile.sfxVolume));
    const sfxRow = slider('sfx-volume', 'Effects', () => profile.sfxVolume, (v) => profile.setVolumes(profile.musicVolume, v));

    const preset = segmented(
      (['low', 'medium', 'high'] as const).map((p) => ({ value: p as Preset | 'custom', label: PRESET_LABEL[p] })).concat([{ value: 'custom', label: 'Custom' }]),
      (p) => {
        if (p !== 'custom') this.graphics.setPreset(p);
      },
      true,
    );
    this.refreshers.push(() => preset.set(this.graphics.settings.preset));

    this.autoNote = el('p', { class: 'ui-note' });
    this.autoBtn = el('button', { class: 'ui-btn', type: 'button', text: 'Use automatic' });
    this.autoBtn.addEventListener('click', () => this.graphics.resetToAuto());

    const rows: HTMLElement[] = [];
    const detail = <K extends keyof GraphicsDetails>(label: string, key: K, options: Array<{ value: GraphicsDetails[K]; label: string }>) => {
      const seg = segmented(options, (v) => this.graphics.setDetail(key, v));
      this.refreshers.push(() => seg.set(this.graphics.settings.details[key]));
      rows.push(el('div', { class: 'ui-row' }, [el('span', { text: label }), seg.node]));
    };
    detail('Resolution', 'resolution', [{ value: 1, label: 'Normal' }, { value: 1.5, label: 'Sharp' }, { value: 2, label: 'Max' }]);
    detail('Shadows', 'shadows', [{ value: 'off', label: 'Off' }, { value: 'low', label: 'Soft' }, { value: 'high', label: 'Detailed' }]);
    detail('Glow', 'bloom', [{ value: false, label: 'Off' }, { value: true, label: 'On' }]);
    detail('Smooth edges', 'antialias', [{ value: false, label: 'Off' }, { value: true, label: 'On' }]);
    detail('Particles', 'particles', [{ value: 'low', label: 'Fewer' }, { value: 'medium', label: 'Normal' }, { value: 'high', label: 'Lots' }]);
    detail('Screen effects', 'post', [{ value: false, label: 'Off' }, { value: true, label: 'On' }]);

    const panel = el('div', { class: 'ui-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'settings-title' }, [
      el('div', { class: 'ui-head' }, [el('h2', { id: 'settings-title', text: 'Settings' }), close]),
      el('section', { class: 'ui-section' }, [el('h3', { text: 'Sound' }), sound.node, musicRow, sfxRow]),
      el('section', { class: 'ui-section' }, [
        el('h3', { text: 'Graphics quality' }),
        preset.node,
        el('div', { class: 'ui-head' }, [this.autoNote, this.autoBtn]),
      ]),
      el('section', { class: 'ui-section' }, [el('h3', { text: 'Details' }), ...rows]),
    ]);
    this.modal = el('div', { class: 'ui-modal', hidden: '' }, [panel]);
    this.modal.addEventListener('pointerdown', (e) => {
      if (e.target === this.modal) this.close();
    });
    // closes with its button or a click outside; Escape is left to the browser (CrazyGames guideline)
    uiRoot().append(this.modal);

    gameEvents.on('graphics:changed', () => this.refresh(), this);
    gameEvents.on('audio:muted', () => this.refresh(), this);
  }

  get isOpen(): boolean {
    return !this.modal.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    this.refresh();
    this.modal.hidden = false;
    this.hooks.onOpen();
  }

  close(): void {
    if (!this.isOpen) return;
    this.modal.hidden = true;
    this.hooks.onClose();
  }

  private refresh(): void {
    for (const r of this.refreshers) r();
    const g = this.graphics.settings;
    if (g.auto) {
      this.autoNote.textContent = `Automatic: ${PRESET_LABEL[g.preset]} was picked for this device.`;
      this.autoBtn.hidden = true;
    } else {
      this.autoNote.textContent = 'Chosen by you.';
      this.autoBtn.hidden = false;
    }
  }
}
