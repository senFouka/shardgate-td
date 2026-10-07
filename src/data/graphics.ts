/**
 * Graphics presets, the per-detail options, and the hardware rules that pick
 * the automatic preset. Pure data and functions (no Three.js), so the unit
 * tests load this file directly.
 */
export type Preset = 'low' | 'medium' | 'high';
export const PRESET_ORDER: readonly Preset[] = ['low', 'medium', 'high'];

export interface GraphicsDetails {
  /** highest device pixel ratio we render at (1 = CSS pixels) */
  resolution: 1 | 1.5 | 2;
  shadows: 'off' | 'low' | 'high';
  /** glow around fire, crystals and spells */
  bloom: boolean;
  antialias: boolean;
  particles: 'low' | 'medium' | 'high';
  /** colour grading and vignette */
  post: boolean;
}

export const PRESETS: Record<Preset, GraphicsDetails> = {
  low: { resolution: 1, shadows: 'off', bloom: false, antialias: false, particles: 'low', post: false },
  medium: { resolution: 1.5, shadows: 'low', bloom: true, antialias: true, particles: 'medium', post: false },
  high: { resolution: 2, shadows: 'high', bloom: true, antialias: true, particles: 'high', post: true },
};

/** Particle counts are multiplied by this. */
export const PARTICLE_SCALE: Record<GraphicsDetails['particles'], number> = { low: 0.4, medium: 0.7, high: 1 };
/** Shadow map size per shadow setting. */
export const SHADOW_MAP_SIZE: Record<Exclude<GraphicsDetails['shadows'], 'off'>, number> = { low: 1024, high: 2048 };

/** The frame-rate check that may lower an automatic preset during the first seconds of play. */
export const AUTO_CHECK = {
  /** ignore the first frames (shader warm-up, loading) */
  warmupMs: 2500,
  /** measure this long */
  sampleMs: 5000,
  /** step down when the median frame rate is below this */
  minFps: 45,
} as const;

export interface GraphicsSettings {
  /** true while the game picks the preset; false once the player chose anything */
  auto: boolean;
  preset: Preset | 'custom';
  details: GraphicsDetails;
  /** what auto-detection decided last (null = never ran) */
  detectedTier: Preset | null;
  /** the GPU it decided for; a different GPU re-runs detection */
  gpu: string;
}

export function defaultGraphics(): GraphicsSettings {
  return { auto: true, preset: 'high', details: { ...PRESETS.high }, detectedTier: null, gpu: '' };
}

/** The preset whose details equal these, or 'custom'. */
export function presetOf(d: GraphicsDetails): Preset | 'custom' {
  for (const p of PRESET_ORDER) {
    const q = PRESETS[p];
    if (
      q.resolution === d.resolution && q.shadows === d.shadows && q.bloom === d.bloom &&
      q.antialias === d.antialias && q.particles === d.particles && q.post === d.post
    ) return p;
  }
  return 'custom';
}

export function stepDown(p: Preset): Preset | null {
  const i = PRESET_ORDER.indexOf(p);
  return i > 0 ? PRESET_ORDER[i - 1] : null;
}

const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** Fills missing or invalid fields, so old or corrupt saves still load. */
export function normalizeGraphics(raw: unknown): GraphicsSettings {
  const base = defaultGraphics();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<GraphicsSettings>;
  const d = (r.details ?? {}) as Partial<GraphicsDetails>;
  const details: GraphicsDetails = {
    resolution: pick(d.resolution, [1, 1.5, 2] as const, base.details.resolution),
    shadows: pick(d.shadows, ['off', 'low', 'high'] as const, base.details.shadows),
    bloom: typeof d.bloom === 'boolean' ? d.bloom : base.details.bloom,
    antialias: typeof d.antialias === 'boolean' ? d.antialias : base.details.antialias,
    particles: pick(d.particles, ['low', 'medium', 'high'] as const, base.details.particles),
    post: typeof d.post === 'boolean' ? d.post : base.details.post,
  };
  return {
    auto: typeof r.auto === 'boolean' ? r.auto : true,
    preset: presetOf(details),
    details,
    detectedTier: pick(r.detectedTier, [...PRESET_ORDER, null] as const, null),
    gpu: typeof r.gpu === 'string' ? r.gpu : '',
  };
}

/* ------------------------------------------------------------- detection */

export interface DeviceInfo {
  /** WebGL unmasked renderer string ('' when the browser hides it) */
  gpu: string;
  /** phone or tablet (touch-first, small screen) */
  mobile: boolean;
  /** navigator.deviceMemory in GB, when the browser reports it */
  memoryGB?: number;
  /** navigator.hardwareConcurrency */
  cores?: number;
}

/**
 * Picks the starting preset from what the browser tells us about the
 * hardware. It only has to be roughly right: the frame-rate check in the
 * first seconds of play steps it down if the game runs slowly.
 *
 * - software rendering (no real GPU): Low
 * - desktop/laptop with a dedicated GPU or Apple M-series: High
 * - recent integrated GPUs (Intel Iris Xe / Arc, AMD Radeon Graphics): Medium
 * - older Intel HD/UHD: Medium with 8+ CPU threads, otherwise Low
 * - phones and tablets: Medium for recent chips, Low for older or low-memory ones
 *   (never High automatically: heat and battery; the player can still pick it)
 */
export function detectTier(info: DeviceInfo): Preset {
  const g = info.gpu.toLowerCase();
  const mem = info.memoryGB;
  const cores = info.cores ?? 4;

  if (/swiftshader|llvmpipe|software|basic render|microsoft basic/.test(g)) return 'low';
  if (mem !== undefined && mem <= 2) return 'low';

  if (info.mobile) {
    const adreno = /adreno[^0-9]*(\d{3})/.exec(g);
    if (adreno) return Number(adreno[1]) >= 640 ? 'medium' : 'low';
    if (/immortalis|mali-g7\d|mali-g6[1-9]\d|mali-g7\d\d/.test(g)) return 'medium';
    if (/mali|powervr|videocore/.test(g)) return 'low';
    // Apple GPU (iPhone/iPad) and unknown chips
    return mem !== undefined && mem < 4 ? 'low' : 'medium';
  }

  let tier: Preset;
  if (/nvidia|geforce|quadro|rtx|gtx|radeon rx|radeon pro|radeon \d{3,4}m?\b|apple m\d/.test(g)) tier = 'high';
  else if (/iris|arc|radeon(\(tm\))? graphics|radeon vega|780m|680m/.test(g)) tier = 'medium';
  else if (/intel/.test(g)) tier = cores >= 8 ? 'medium' : 'low';
  else if (g === '' || /apple gpu/.test(g)) tier = 'medium'; // hidden GPU (Safari, Firefox privacy): play safe
  else tier = 'medium';

  if (tier === 'high' && mem !== undefined && mem <= 4) tier = 'medium';
  return tier;
}
