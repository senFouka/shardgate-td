/**
 * Which creep walks in which wave, and the 8 bosses (one every 5 waves).
 * Ids refer to public/models/monsters/catalog.json (CC0 models, see
 * ASSETS.md). Names are our own.
 */
export interface CreepLook {
  /** shown in the HUD and wave preview */
  name: string;
  /** height in cells (a lane is 2 cells wide) */
  height: number;
  /** catalog model id, when it differs from the look's own id (variants) */
  model?: string;
  /** optional colour multiplier (variants, bosses) */
  tint?: number;
  /** props on bones (skeleton weapons), files in models/kaykit-skeletons/ */
  attach?: Array<{ file: string; bone: string }>;
}

const BLADE = { file: 'Skeleton_Blade.glb', bone: 'handslot.r' };
const AXE = { file: 'Skeleton_Axe.glb', bone: 'handslot.r' };

export const CREEP_LOOKS: Record<string, CreepLook> = {
  // waves 1-10: small blobs and critters
  blob_pinkblob: { name: 'Gloop', height: 0.75 },
  blob_greenblob: { name: 'Moss Gloop', height: 0.78 },
  blob_mushnub: { name: 'Sporeling', height: 0.85 },
  blob_chicken: { name: 'Clucker', height: 0.85 },
  blob_pigeon: { name: 'Pebble Pigeon', height: 0.8 },
  blob_cat: { name: 'Whiskerpaw', height: 0.85 },
  blob_birb: { name: 'Puffbeak', height: 0.88 },
  blob_fish: { name: 'Mudfin', height: 0.9 },
  fly_armabee: { name: 'Stingbuzz', height: 0.85 },
  blob_yeti: { name: 'Snowcub', height: 0.92 },
  // waves 11-20
  blob_cactoro: { name: 'Prickle', height: 0.95 },
  blob_wizard: { name: 'Hedge Mage', height: 0.95 },
  blob_ninja: { name: 'Shadowpip', height: 0.95 },
  blob_alien: { name: 'Star Imp', height: 0.98 },
  fly_alpaking: { name: 'Woolwing', height: 0.95 },
  fly_glub: { name: 'Bubble Glub', height: 0.95 },
  big_bunny: { name: 'Thumper', height: 1.15 },
  big_frog: { name: 'Bogcroak', height: 1.05 },
  skel_minion: { name: 'Bone Grunt', height: 1.05, attach: [BLADE] },
  blob_greenspikyblob: { name: 'Thornblob', height: 1.05 },
  // waves 21-30
  blob_mushnub_evolved: { name: 'Toadstool Brute', height: 1.15 },
  fly_hywirl: { name: 'Gustwhirl', height: 1.05 },
  big_monkroose: { name: 'Ringtail Raider', height: 1.2 },
  fly_armabee_evolved: { name: 'Armored Hornet', height: 1.05 },
  big_cactoro: { name: 'Cactus Hulk', height: 1.3 },
  big_dino: { name: 'Rex Runt', height: 1.25 },
  fly_goleling: { name: 'Rockwing', height: 1.05 },
  fly_ghost: { name: 'Wisp Wraith', height: 1.15 },
  skel_rogue: { name: 'Bone Cutthroat', height: 1.15, attach: [BLADE] },
  big_fish: { name: 'Reefwalker', height: 1.3 },
  // waves 31-40
  big_alien: { name: 'Void Stalker', height: 1.35 },
  fly_squidle: { name: 'Sky Squid', height: 1.15 },
  fly_glub_evolved: { name: 'Bloatglub', height: 1.25 },
  fly_dragon: { name: 'Ember Whelp', height: 1.2 },
  big_ninja: { name: 'Night Blade', height: 1.35 },
  fly_alpaking_evolved: { name: 'Crowned Woolwing', height: 1.3 },
  fly_demon: { name: 'Cinder Imp', height: 1.25 },
  skel_mage: { name: 'Bone Hexer', height: 1.3 },
  fly_ghost_skull: { name: 'Skull Wraith', height: 1.35 },
  grave_archmage: { name: 'Grave Archmage', height: 1.55, model: 'skel_mage', tint: 0x8a6aff },

  // bosses
  boss_gorehorn: { name: 'Gorehorn the Burning', height: 2.3, model: 'big_demon', tint: 0xff9a7a },
  boss_frostmaw: { name: 'Frostmaw', height: 2.3, model: 'big_yeti', tint: 0xb8e4ff },
  boss_stormmask: { name: 'Stormmask', height: 2.4, model: 'fly_tribal' },
  boss_ossuary: { name: 'Ossuary Knight', height: 2.3, model: 'skel_warrior', tint: 0xd8c8a8, attach: [AXE] },
  boss_rotcap: { name: 'Rotcap King', height: 2.4, model: 'big_mushroomking', tint: 0xc8ff9a },
  boss_tidebreaker: { name: 'Tidebreaker', height: 2.4, model: 'big_bluedemon' },
  boss_granite: { name: 'Granite Wyrm', height: 2.5, model: 'fly_goleling_evolved' },
  boss_shardbane: { name: 'Shardbane, the Last Dragon', height: 2.7, model: 'fly_dragon_evolved', tint: 0xffd890 },

  // element bosses (summoned by element picks)
  eboss_ember: { name: 'Cinderheart', height: 2.2, model: 'big_dino', tint: 0xff7a40 },
  eboss_frost: { name: 'Rimeback', height: 2.2, model: 'big_frog', tint: 0x9fe0ff },
  eboss_gale: { name: 'Thunderwing', height: 2.2, model: 'fly_armabee_evolved', tint: 0xb8c4ff },
  eboss_stone: { name: 'Bouldermaw', height: 2.3, model: 'big_cactoro', tint: 0xc9a77a },
  eboss_venom: { name: 'Blightbloom', height: 2.2, model: 'big_monkroose', tint: 0x9aff6a },
  eboss_tide: { name: 'Deepcaller', height: 2.3, model: 'big_fish', tint: 0x5ad0ff },
};

/** 40 regular waves, weakest-looking first. */
export const WAVE_CREEPS: string[] = [
  'blob_pinkblob', 'blob_greenblob', 'blob_mushnub', 'blob_chicken', 'blob_pigeon',
  'blob_cat', 'blob_birb', 'blob_fish', 'fly_armabee', 'blob_yeti',
  'blob_cactoro', 'blob_wizard', 'blob_ninja', 'blob_alien', 'fly_alpaking',
  'fly_glub', 'big_bunny', 'big_frog', 'skel_minion', 'blob_greenspikyblob',
  'blob_mushnub_evolved', 'fly_hywirl', 'big_monkroose', 'fly_armabee_evolved', 'big_cactoro',
  'big_dino', 'fly_goleling', 'fly_ghost', 'skel_rogue', 'big_fish',
  'big_alien', 'fly_squidle', 'fly_glub_evolved', 'fly_dragon', 'big_ninja',
  'fly_alpaking_evolved', 'fly_demon', 'skel_mage', 'fly_ghost_skull', 'grave_archmage',
];

/** Bosses of waves 5, 10, ... 40. */
export const BOSS_CREEPS: string[] = [
  'boss_gorehorn', 'boss_frostmaw', 'boss_stormmask', 'boss_ossuary',
  'boss_rotcap', 'boss_tidebreaker', 'boss_granite', 'boss_shardbane',
];

/** Element bosses, one per element (index follows ELEMENT_ORDER in elements.ts). */
export const ELEMENT_BOSS_CREEPS: Record<string, string> = {
  ember: 'eboss_ember', frost: 'eboss_frost', gale: 'eboss_gale', stone: 'eboss_stone', venom: 'eboss_venom', tide: 'eboss_tide',
};

/** Look id of a wave's creeps, or of its boss. */
export function waveLook(wave: number, boss: boolean): string {
  if (boss) return BOSS_CREEPS[Math.max(0, Math.min(BOSS_CREEPS.length - 1, Math.floor(wave / 5) - 1))];
  return WAVE_CREEPS[(Math.max(1, wave) - 1) % WAVE_CREEPS.length];
}

/** Flying creeps hover and cannot be hit by ground-only towers (Mortar). */
export function isFlyingLook(id: string): boolean {
  return (CREEP_LOOKS[id]?.model ?? id).startsWith('fly_');
}
