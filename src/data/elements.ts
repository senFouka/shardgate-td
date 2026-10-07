/**
 * The six elements, their counter cycle, and how each element's tower plays.
 * Pure data (Node tests load it).
 *
 * Cycle: Ember -> Frost -> Gale -> Stone -> Venom -> Tide -> Ember.
 * An element deals x1.5 to the next element's armor and x0.5 to the
 * previous one's; everything else (and basic towers) deals x1.
 */
export type ElementId = 'ember' | 'frost' | 'gale' | 'stone' | 'venom' | 'tide';

export const ELEMENT_ORDER: readonly ElementId[] = ['ember', 'frost', 'gale', 'stone', 'venom', 'tide'];

export interface ElementInfo {
  name: string;
  /** the tower's name */
  tower: string;
  /** one line for the build bar / pick screen */
  blurb: string;
  /** UI colour */
  color: string;
}

export const ELEMENTS: Record<ElementId, ElementInfo> = {
  ember: { name: 'Ember', tower: 'Ember Brazier', blurb: 'Sets one enemy on fire: burn damage over time', color: '#ff7a2a' },
  frost: { name: 'Frost', tower: 'Frost Spire', blurb: 'Slows the enemies it hits', color: '#7fd4ff' },
  gale: { name: 'Gale', tower: 'Gale Orb', blurb: 'Fast lightning that jumps between enemies', color: '#9fb4ff' },
  stone: { name: 'Stone', tower: 'Stone Monolith', blurb: 'Heavy hits that can stun', color: '#c9a77a' },
  venom: { name: 'Venom', tower: 'Venom Font', blurb: 'Stacking poison that eats armor', color: '#8ee05a' },
  tide: { name: 'Tide', tower: 'Tide Well', blurb: 'Splash waves that push enemies back', color: '#3fb6d8' },
};

export const STRONG = 1.5;
export const WEAK = 0.5;

/** Damage multiplier of an attacking element against an armor element. */
export function elementMultiplier(attack: ElementId | null, armor: ElementId | null): number {
  if (!attack || !armor) return 1;
  const i = ELEMENT_ORDER.indexOf(attack);
  const n = ELEMENT_ORDER.length;
  if (ELEMENT_ORDER[(i + 1) % n] === armor) return STRONG;
  if (ELEMENT_ORDER[(i - 1 + n) % n] === armor) return WEAK;
  return 1;
}

/** The element that is strong against `armor` (for hints). */
export function counterOf(armor: ElementId): ElementId {
  const i = ELEMENT_ORDER.indexOf(armor);
  return ELEMENT_ORDER[(i - 1 + ELEMENT_ORDER.length) % ELEMENT_ORDER.length];
}

/**
 * Armor element of each wave (40). No armor on the first waves so a new
 * player is never punished before the first element pick matters; then a
 * shuffled cycle so every element is good sometimes and weak sometimes.
 */
export const WAVE_ARMOR: ReadonlyArray<ElementId | null> = [
  null, null, null, null, 'ember',
  'frost', 'stone', 'gale', 'tide', 'venom',
  'ember', 'gale', 'frost', 'venom', 'stone',
  'tide', 'frost', 'ember', 'stone', 'gale',
  'venom', 'tide', 'gale', 'ember', 'frost',
  'stone', 'venom', 'tide', 'ember', 'gale',
  'frost', 'stone', 'tide', 'venom', 'ember',
  'gale', 'stone', 'frost', 'venom', 'tide',
];
