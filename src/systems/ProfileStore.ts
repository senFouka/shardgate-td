import type { DifficultyId } from '../data/difficulty';
import { emptyProfile, profileSave, type ProfileSave } from './SaveSystem';
import { gameEvents } from '../core/EventBus';
import type { GameSpeed } from './saveFormat';
import type { GraphicsSettings } from '../data/graphics';

/**
 * The permanent profile in memory. Survives game over and restarts; every
 * change is written to ProfileSave immediately.
 *
 * Copied from Element Warden and trimmed: Essence, Sanctum, offline earnings
 * and the daily reward do not exist here. Stats, achievements and skins are
 * added in Milestone 5.
 */
export class ProfileStore {
  private data: ProfileSave = emptyProfile();

  /** Called once at boot with whatever was on disk (or null for a new player). */
  load(saved: ProfileSave | null): void {
    this.data = saved ?? emptyProfile();
    if (!saved) this.persist();
  }

  get muted(): boolean {
    return this.data.settings.muted;
  }

  setMuted(muted: boolean): void {
    if (this.data.settings.muted === muted) return;
    this.data.settings.muted = muted;
    this.persist();
  }

  hasSeenHint(id: string): boolean {
    return this.data.hints.includes(id);
  }

  /** Marks a first-time hint as shown, so it never comes back. */
  markHintSeen(id: string): void {
    if (this.data.hints.includes(id)) return;
    this.data.hints.push(id);
    this.persist();
  }

  get musicVolume(): number {
    return this.data.settings.musicVolume;
  }

  get sfxVolume(): number {
    return this.data.settings.sfxVolume;
  }

  setVolumes(music: number, sfx: number): void {
    this.data.settings.musicVolume = music;
    this.data.settings.sfxVolume = sfx;
    this.persist();
  }

  get difficulty(): DifficultyId {
    return this.data.settings.difficulty;
  }

  setDifficulty(d: DifficultyId): void {
    this.data.settings.difficulty = d;
    this.persist();
  }

  get speed(): GameSpeed {
    return this.data.settings.speed;
  }

  setSpeed(speed: GameSpeed): void {
    if (this.data.settings.speed === speed) return;
    this.data.settings.speed = speed;
    this.persist();
  }

  get graphics(): GraphicsSettings {
    return this.data.settings.graphics;
  }

  setGraphics(graphics: GraphicsSettings): void {
    this.data.settings.graphics = graphics;
    this.persist();
  }

  bestWave(difficulty: DifficultyId): number {
    return this.data.bests[difficulty] ?? 0;
  }

  /** Records that `wave` was reached on `difficulty`, if it is a new best. */
  noteWave(difficulty: DifficultyId, wave: number): void {
    if (wave <= this.bestWave(difficulty)) return;
    this.data.bests[difficulty] = wave;
    this.persist();
  }

  /**
   * Every cleared wave goes through here, so lifetimeWavesCleared (which only
   * grows, and decides which save copy wins) can never be missed.
   */
  addWaveCleared(): void {
    this.data.lifetimeWavesCleared += 1;
    this.persist();
    gameEvents.emit('profile:changed', {});
  }

  get lifetimeWavesCleared(): number {
    return this.data.lifetimeWavesCleared;
  }

  /** A copy, for tests and debugging. */
  snapshot(): ProfileSave {
    return JSON.parse(JSON.stringify(this.data)) as ProfileSave;
  }

  private persist(): void {
    profileSave.write(this.data);
  }
}

export const profile = new ProfileStore();
