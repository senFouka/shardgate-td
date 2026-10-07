/**
 * Difficulty levels. Chosen before the first wave, locked for the game.
 * The numbers live in `BALANCE.difficulty` (balance.ts).
 */
export type DifficultyId = 'easy' | 'medium' | 'hard' | 'extreme';

export const DIFFICULTY_ORDER: readonly DifficultyId[] = ['easy', 'medium', 'hard', 'extreme'];

export const DIFFICULTY_NAMES: Record<DifficultyId, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  extreme: 'Extreme',
};

export function isDifficulty(v: unknown): v is DifficultyId {
  return typeof v === 'string' && (DIFFICULTY_ORDER as readonly string[]).includes(v);
}
