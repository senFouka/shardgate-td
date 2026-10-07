/**
 * Third-party models used by the slices (all logged in ASSETS.md).
 * Paths are relative to the page (slices/public is served at the root).
 */
export interface CreepAsset {
  url: string;
  /** height in cells */
  height: number;
  /** yaw so the model faces +x at heading 0 (glTF models face +z) */
  yaw: number;
  /** props attached to bones, e.g. a weapon in a hand slot */
  attach?: Array<{ url: string; bone: string }>;
}

export const CREEP_ASSETS: { grunt: CreepAsset | null; brute: CreepAsset | null } = {
  grunt: {
    url: '../models/kaykit-skeletons/Skeleton_Minion.glb',
    height: 0.85,
    yaw: Math.PI / 2,
    attach: [{ url: '../models/kaykit-skeletons/Skeleton_Blade.glb', bone: 'handslot.r' }],
  },
  brute: { url: '../models/quaternius/Yeti.glb', height: 1.25, yaw: Math.PI / 2 },
};

const N = '../models/kenney-nature/';
export const PROP_ASSETS: Record<'rock' | 'tree' | 'bush' | 'grass', string[]> = {
  rock: [`${N}rock_largeA.glb`, `${N}rock_largeB.glb`, `${N}rock_largeC.glb`, `${N}rock_tallA.glb`],
  tree: [`${N}tree_oak.glb`, `${N}tree_detailed.glb`, `${N}tree_default.glb`],
  bush: [`${N}plant_bushLarge.glb`, `${N}plant_bushDetailed.glb`],
  grass: [`${N}grass_large.glb`, `${N}grass_leafsLarge.glb`],
};
