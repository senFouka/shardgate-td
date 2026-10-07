/**
 * Background music: a calm theme for the menu (before Start, end screen) and
 * a battle theme that plays quietly under the waves. Files in public/audio
 * (ogg + mp3 twin). Picked by the user (2026-10-08) and turned down 60%
 * at their request; the player's Music slider (default 50%) scales them.
 */
export type MusicTrack = 'menu' | 'battle';

export const MUSIC: Record<MusicTrack, { file: string; gain: number }> = {
  menu: { file: 'audio/music_menu.ogg', gain: 0.32 },
  battle: { file: 'audio/music_battle.ogg', gain: 0.18 },
};

/** Seconds for one track to fade into the other. */
export const MUSIC_FADE_SECONDS = 2.5;
