import { MUSIC, MUSIC_FADE_SECONDS, type MusicTrack } from '../data/music';
import { platform } from '../services/platform';
import { profile } from './ProfileStore';
import { mp3Of } from './Sfx';

/**
 * Background music with a cross-fade between the menu and battle themes.
 * Streams through <audio> elements (a 3-minute track decoded into memory
 * would take tens of MB). Follows the same rules as the sound effects: the
 * player's mute, the platform's mute and ads silence it.
 */
class Music {
  private readonly els = new Map<MusicTrack, HTMLAudioElement>();
  private readonly level = new Map<MusicTrack, number>();
  private want: MusicTrack | null = null;
  private unlocked = false;

  init(): void {
    const probe = document.createElement('audio');
    const ogg = probe.canPlayType('audio/ogg; codecs="vorbis"') !== '';
    for (const [track, def] of Object.entries(MUSIC) as Array<[MusicTrack, (typeof MUSIC)[MusicTrack]]>) {
      const el = new Audio(ogg ? def.file : mp3Of(def.file));
      el.loop = true;
      el.preload = track === 'menu' ? 'auto' : 'metadata';
      el.volume = 0;
      el.addEventListener('error', () => this.els.delete(track)); // a missing track must never break the game
      this.els.set(track, el);
      this.level.set(track, 0);
    }
    // browsers only allow audio after a user gesture
    const unlock = () => {
      this.unlocked = true;
      this.apply();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    platform.onAudioSuppressedChange(() => this.apply());
  }

  /** Which theme should play (null = silence). */
  play(track: MusicTrack | null): void {
    this.want = track;
  }

  /** Call every frame with real (not game) time. */
  update(realDt: number): void {
    const step = realDt / MUSIC_FADE_SECONDS;
    for (const track of this.els.keys()) {
      const target = track === this.want ? 1 : 0;
      const cur = this.level.get(track) ?? 0;
      this.level.set(track, cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step));
    }
    this.apply();
  }

  private apply(): void {
    const silent = !this.unlocked || profile.muted || platform.isAudioSuppressed();
    for (const [track, el] of this.els) {
      const level = this.level.get(track) ?? 0;
      const vol = silent ? 0 : level * profile.musicVolume * MUSIC[track].gain;
      el.volume = Math.min(1, Math.max(0, vol));
      if (vol > 0.001 && el.paused) void el.play().catch(() => undefined);
      else if (vol <= 0.001 && !el.paused && level === 0) el.pause();
    }
  }
}

export const music = new Music();
