import { SOUNDS, type SoundDef, type SoundId } from '../data/sounds';
import { gameEvents } from '../core/EventBus';
import { platform } from '../services/platform';
import { profile } from './ProfileStore';

/**
 * One place that plays sound effects. It throttles sounds that would
 * otherwise fire dozens of times a second, and owns the mute switch.
 *
 * Ported from Element Warden: same API and rules (mute persisted in the
 * profile, the platform's mute and ads override it, per-sound minimum gap
 * and random detune). Phaser's sound manager is replaced by Web Audio.
 */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundId, AudioBuffer>();
  private readonly lastPlayed = new Map<SoundId, number>();
  private readonly playing = new Set<AudioBufferSourceNode>();

  /** Creates the audio context and starts loading every sound. Call once at boot. */
  init(): void {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return; // no Web Audio: the game stays silent
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    // browsers start audio suspended until the first user gesture; iOS also suspends it
    // after a call or an app switch and only lets a gesture wake it, so every tap checks
    const unlock = () => {
      if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('touchend', unlock);
    window.addEventListener('keydown', unlock);
    // looking away puts the whole sound engine to sleep (as Phaser does); coming back wakes it
    const sleep = () => void this.ctx?.suspend();
    const wake = () => {
      if (document.visibilityState === 'visible') unlock();
    };
    window.addEventListener('blur', sleep);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? sleep() : wake()));
    // ads and the platform's own mute setting silence everything at once
    platform.onAudioSuppressedChange((suppressed) => {
      if (suppressed) this.stopAll();
    });
    for (const [id, def] of Object.entries(SOUNDS) as Array<[SoundId, SoundDef]>) void this.load(id, def);
  }

  /**
   * Each sound ships as `.ogg` and `.mp3`; Safari on older iPhones cannot
   * decode Ogg, so it gets the mp3.
   */
  private async load(id: SoundId, def: SoundDef): Promise<void> {
    if (!this.ctx) return;
    for (const file of [def.file, mp3Of(def.file)]) {
      try {
        const res = await fetch(file);
        if (!res.ok) continue;
        this.buffers.set(id, await this.ctx.decodeAudioData(await res.arrayBuffer()));
        return;
      } catch {
        /* try the next format; a missing sound must never break gameplay */
      }
    }
  }

  get muted(): boolean {
    return profile.muted;
  }

  setMuted(muted: boolean): void {
    profile.setMuted(muted);
    if (muted) this.stopAll();
    gameEvents.emit('audio:muted', { muted });
  }

  toggleMuted(): void {
    this.setMuted(!profile.muted);
  }

  play(id: SoundId): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || profile.muted || ctx.state !== 'running' || platform.isAudioSuppressed()) return;
    const buffer = this.buffers.get(id);
    if (!buffer) return;

    const def: SoundDef = SOUNDS[id];
    const now = performance.now();
    if (now - (this.lastPlayed.get(id) ?? -Infinity) < def.minGapMs) return;
    this.lastPlayed.set(id, now);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.detune.value = def.detune ? (Math.random() * 2 - 1) * def.detune : 0;
    const gain = ctx.createGain();
    gain.gain.value = def.volume * profile.sfxVolume;
    src.connect(gain).connect(this.master);
    src.onended = () => this.playing.delete(src);
    this.playing.add(src);
    src.start();
  }

  private stopAll(): void {
    for (const s of this.playing) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.playing.clear();
  }
}

export const sfx = new Sfx();

/** The mp3 twin of an ogg file (both live in public/audio). */
export function mp3Of(file: string): string {
  return file.replace(/\.ogg$/, '.mp3');
}
