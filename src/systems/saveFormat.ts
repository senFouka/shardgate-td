/**
 * Save formats and the pure rules around them: parsing, defaults, migration,
 * and reconciling the platform store with the local fallback store.
 *
 * Runtime imports only from import-free data files (with an explicit `.ts`
 * extension), so the unit tests can load this file directly in Node.
 *
 * Copied from Element Warden (see PROGRESS.md for the commit). The reconcile
 * rules are unchanged; only the progress counter and the fields differ.
 */
import { isDifficulty, type DifficultyId } from '../data/difficulty.ts';
import { defaultGraphics, normalizeGraphics, type GraphicsSettings } from '../data/graphics.ts';

/** Game speed the player can pick; always free (CLAUDE.md "Player agency"). */
export type GameSpeed = 1 | 1.5;

export const RUN_VERSION = 1;
export const PROFILE_VERSION = 1;

/** One placed tower. `id` is the tower kind (bolt, mortar, ember...). */
export interface SavedTower {
  id: string;
  col: number;
  row: number;
  level: number;
  /** gold put into it (refunds) and its kill count */
  spent?: number;
  kills?: number;
}

/** The rest of a game's state at a wave start (elements, picks, ad helps, dice). */
export interface SavedGameState {
  elements: Record<string, number>;
  offer: string[] | null;
  picksOwed: number;
  picksMade: number;
  offerRerolled: boolean;
  livesRefilled: boolean;
  continued: boolean;
  adGoldWave: number;
  rng: number;
  /** element bosses that were on the road: summoned again when play resumes */
  guardians: string[];
}

/**
 * Everything needed to put the player back into an unfinished game: a
 * checkpoint taken as a wave starts. Resuming replays that wave from its start.
 */
export interface RunSave {
  v: number;
  difficulty: DifficultyId;
  /** the wave to resume at (it starts again when the player presses Start) */
  wave: number;
  gold: number;
  lives: number;
  towers: SavedTower[];
  /** missing in very old saves: then a fresh element state */
  state?: SavedGameState;
  savedAt: number;
}

/** The permanent profile. Fields added by later steps must get defaults in `normalizeProfile`. */
export interface ProfileSave {
  v: number;
  /** best wave reached, per difficulty */
  bests: Partial<Record<DifficultyId, number>>;
  /**
   * Every wave ever cleared, in any game. Only increases. It measures how
   * much progress a profile holds, so it decides which copy wins when two
   * stores disagree.
   */
  lifetimeWavesCleared: number;
  settings: {
    muted: boolean;
    /** the player's chosen game speed */
    speed: GameSpeed;
    graphics: GraphicsSettings;
    /** 0..1 */
    musicVolume: number;
    /** 0..1 */
    sfxVolume: number;
    /** difficulty of the next game (the last one the player chose) */
    difficulty: DifficultyId;
  };
  /** first-time hints already shown (each appears once per profile) */
  hints: string[];
  updatedAt: number;
}

export function emptyProfile(): ProfileSave {
  return {
    v: PROFILE_VERSION,
    bests: {},
    lifetimeWavesCleared: 0,
    settings: { muted: false, speed: 1, graphics: defaultGraphics(), musicVolume: 0.5, sfxVolume: 0.5, difficulty: 'medium' },
    hints: [],
    updatedAt: 0,
  };
}

/** A 0..1 volume, or the default when missing/invalid. */
function unit(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

function normalizeSpeed(speed: unknown): GameSpeed {
  // 1.5x is the only faster speed (user, 2026-10-09); old 2x/3x saves become 1.5x
  return speed === 1.5 || speed === 2 || speed === 3 ? 1.5 : 1;
}

/** Fills any missing field with its default, so old or partial saves still load. */
export function normalizeProfile(data: Partial<ProfileSave>): ProfileSave {
  const base = emptyProfile();
  const lifetime = typeof data.lifetimeWavesCleared === 'number' ? Math.floor(data.lifetimeWavesCleared) : 0;
  return {
    v: PROFILE_VERSION,
    bests: typeof data.bests === 'object' && data.bests ? { ...data.bests } : base.bests,
    lifetimeWavesCleared: Math.max(0, lifetime),
    settings: {
      muted: !!data.settings?.muted,
      musicVolume: unit(data.settings?.musicVolume, 0.5),
      sfxVolume: unit(data.settings?.sfxVolume, 0.5),
      difficulty: isDifficulty(data.settings?.difficulty) ? data.settings.difficulty : 'medium',
      speed: normalizeSpeed(data.settings?.speed),
      graphics: normalizeGraphics(data.settings?.graphics),
    },
    hints: Array.isArray(data.hints) ? [...new Set(data.hints.filter((h): h is string => typeof h === 'string'))] : [],
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  };
}

export function parseProfile(raw: string | null): ProfileSave | null {
  if (!raw) return null;
  try {
    return normalizeProfile(JSON.parse(raw) as Partial<ProfileSave>);
  } catch {
    return null; // a corrupt save must never block the game from starting
  }
}

export function parseRun(raw: string | null): RunSave | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as RunSave;
    if (data.v !== RUN_VERSION || typeof data.wave !== 'number' || data.wave < 1) return null;
    if (!Array.isArray(data.towers)) return null;
    return data;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ reconcile */

/** Raw contents of one store. */
export interface StoreContents {
  profile: string | null;
  run: string | null;
}

export type StoreName = 'primary' | 'fallback';

export interface Reconciled {
  profile: ProfileSave | null;
  run: RunSave | null;
  profileFrom: StoreName | 'none';
  runFrom: StoreName | 'none';
  /** writes to apply to the primary (platform) store, in order */
  writes: Array<{ key: string; value: string }>;
}

export const BACKUP_PROFILE_KEY = 'profile_backup';
export const BACKUP_RUN_KEY = 'run_backup';

/**
 * Decides which saves to use when the platform store (`primary`, e.g. the
 * CrazyGames data module) and the local fallback store (written on visits
 * where the SDK failed to load) both exist.
 *
 * Profile: the copy with more `lifetimeWavesCleared` wins; a tie keeps the
 * primary. Timestamps are deliberately NOT used: an empty profile created
 * during a failed visit is newer, but must never replace real progress.
 * A winning fallback profile is written to the primary store, after the
 * primary's copy is kept under a backup key.
 *
 * Run: only runs whose store holds the winning profile (the winner itself,
 * or a copy with the same lifetime total) are eligible; the newest eligible
 * run wins. A primary run that belongs to a losing profile is backed up and
 * removed, so it cannot be offered against the wrong profile later.
 */
export function reconcileSaves(primary: StoreContents, fallback: StoreContents | null): Reconciled {
  const pProfile = parseProfile(primary.profile);
  const pRun = parseRun(primary.run);

  if (!fallback) {
    return {
      profile: pProfile,
      run: pRun,
      profileFrom: pProfile ? 'primary' : 'none',
      runFrom: pRun ? 'primary' : 'none',
      writes: [],
    };
  }

  const fProfile = parseProfile(fallback.profile);
  const fRun = parseRun(fallback.run);
  const writes: Reconciled['writes'] = [];

  let winner: StoreName | 'none';
  if (!pProfile && !fProfile) winner = 'none';
  else if (!fProfile) winner = 'primary';
  else if (!pProfile) winner = 'fallback';
  else winner = fProfile.lifetimeWavesCleared > pProfile.lifetimeWavesCleared ? 'fallback' : 'primary';

  const winnerProfile = winner === 'primary' ? pProfile : winner === 'fallback' ? fProfile : null;
  if (winner === 'fallback' && fProfile) {
    if (primary.profile) writes.push({ key: BACKUP_PROFILE_KEY, value: primary.profile });
    writes.push({ key: 'profile', value: JSON.stringify(fProfile) });
  }

  // a store's run belongs to the winning profile if that store won, or holds
  // an identical-progress copy of it
  const ownsWinner = (store: StoreName, storeProfile: ProfileSave | null): boolean =>
    winner === 'none' ||
    store === winner ||
    (!!storeProfile && !!winnerProfile && storeProfile.lifetimeWavesCleared === winnerProfile.lifetimeWavesCleared);

  const candidates: Array<{ from: StoreName; run: RunSave; raw: string }> = [];
  if (pRun && primary.run && ownsWinner('primary', pProfile)) candidates.push({ from: 'primary', run: pRun, raw: primary.run });
  if (fRun && fallback.run && ownsWinner('fallback', fProfile)) candidates.push({ from: 'fallback', run: fRun, raw: fallback.run });
  candidates.sort((a, b) => b.run.savedAt - a.run.savedAt);
  const chosen = candidates[0] ?? null;

  if (chosen?.from === 'fallback') {
    if (primary.run && primary.run !== chosen.raw) writes.push({ key: BACKUP_RUN_KEY, value: primary.run });
    writes.push({ key: 'run', value: chosen.raw });
  } else if (!chosen && primary.run && pRun) {
    // the primary's run belongs to the profile that lost: keep it aside only
    writes.push({ key: BACKUP_RUN_KEY, value: primary.run });
    writes.push({ key: 'run', value: '' });
  }

  return {
    profile: winnerProfile,
    run: chosen?.run ?? null,
    profileFrom: winner,
    runFrom: chosen?.from ?? 'none',
    writes,
  };
}
