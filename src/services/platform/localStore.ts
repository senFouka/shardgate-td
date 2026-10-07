/**
 * The browser-local save store used by MockPlatform (keys prefixed with
 * `shardgate-td:`). CrazyGamesPlatform reads it too, so saves made on a
 * visit where the SDK failed to load can be reconciled once it works again.
 */
const PREFIX = 'shardgate-td:';

export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null; // storage may be unavailable (private mode)
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    if (value === '') localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, value);
  } catch {
    /* storage may be unavailable */
  }
}
