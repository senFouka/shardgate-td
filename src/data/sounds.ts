/**
 * Every sound effect in the game. Files live in `public/audio/`, each as an
 * `.ogg` plus an `.mp3` twin, all CC0 (see ASSETS.md). Picked by the user on
 * the audition page (2026-10-08). Tower shots and hits have no sound by the
 * user's choice; creep deaths still use the first Kenney set.
 */
export interface SoundDef {
  file: string;
  volume: number;
  /**
   * Minimum ms between two plays of this sound. Frequent sounds (every shot,
   * every hit) would turn into noise without it.
   */
  minGapMs: number;
  /** random pitch spread in cents, so repeats do not sound robotic */
  detune: number;
}

const s = (name: string, volume: number, minGapMs: number, detune: number): SoundDef => ({ file: `audio/${name}.ogg`, volume, minGapMs, detune });

export const SOUNDS = {
  creepDeath: s('creepDeath', 0.3, 45, 250),
  build: s('build', 0.5, 0, 80),
  upgrade: s('upgrade', 0.5, 0, 0),
  sell: s('sell', 0.5, 0, 0),
  waveStart: s('waveStart', 0.5, 0, 0),
  bossWave: s('bossWave', 0.6, 0, 0),
  bossDeath: s('bossDeath', 0.7, 0, 0),
  leak: s('leak', 0.45, 150, 100),
  gameOver: s('gameOver', 0.6, 0, 0),
  victory: s('victory', 0.6, 0, 0),
  click: s('click', 0.35, 30, 0),
  denied: s('denied', 0.4, 120, 0),
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;
