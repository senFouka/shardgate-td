import { platform } from '../services/platform';
import {
  RUN_VERSION,
  parseProfile,
  parseRun,
  reconcileSaves,
  type ProfileSave,
  type RunSave,
} from './saveFormat';

/**
 * Two separate saves, both stored through the platform layer (localStorage
 * via the mock, the SDK data module on CrazyGames):
 *
 *  - RunSave     the current game. Deleted when it ends (game over, victory, restart).
 *  - ProfileSave everything permanent. Never deleted by the end of a game.
 *
 * Formats, defaults and the reconcile rules live in `saveFormat.ts`.
 */
export type { ProfileSave, RunSave } from './saveFormat';
export { emptyProfile } from './saveFormat';

const RUN_KEY = 'run';
const PROFILE_KEY = 'profile';

export const runSave = {
  async read(): Promise<RunSave | null> {
    return parseRun(await platform.load(RUN_KEY));
  },

  write(save: Omit<RunSave, 'v' | 'savedAt'>): void {
    const data: RunSave = { ...save, v: RUN_VERSION, savedAt: Date.now() };
    void platform.save(RUN_KEY, JSON.stringify(data));
  },

  /** The run is over: forget it. The profile is untouched. */
  clear(): void {
    void platform.save(RUN_KEY, '');
  },
};

export const profileSave = {
  async read(): Promise<ProfileSave | null> {
    return parseProfile(await platform.load(PROFILE_KEY));
  },

  write(profile: ProfileSave): void {
    void platform.save(PROFILE_KEY, JSON.stringify({ ...profile, updatedAt: Date.now() }));
  },
};

/**
 * Reads both saves at boot. When the platform SDK is running, the local
 * fallback store (written on visits where the SDK failed to load) is read
 * too and reconciled with it, so no progress is lost either way.
 */
export async function loadSavesAtBoot(): Promise<{ profile: ProfileSave | null; run: RunSave | null }> {
  const primary = { profile: await platform.load(PROFILE_KEY), run: await platform.load(RUN_KEY) };
  const fbProfile = await platform.readFallback(PROFILE_KEY);
  const fbRun = await platform.readFallback(RUN_KEY);
  const fallback = fbProfile || fbRun ? { profile: fbProfile, run: fbRun } : null;

  const result = reconcileSaves(primary, fallback);
  for (const write of result.writes) await platform.save(write.key, write.value);
  if (fallback) {
    console.info(
      `[save] reconciled local fallback: profile from ${result.profileFrom}, run from ${result.runFrom}` +
        (result.writes.length ? `, wrote ${result.writes.map((w) => w.key).join(', ')}` : ''),
    );
  }
  return { profile: result.profile, run: result.run };
}

/** The run save found at boot, if any. Consumed once by the UI. */
let pending: RunSave | null = null;

export function setPendingSave(save: RunSave | null): void {
  pending = save;
}

export function takePendingSave(): RunSave | null {
  const save = pending;
  pending = null;
  return save;
}
