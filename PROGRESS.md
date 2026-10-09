# PROGRESS — Shardgate TD

Read `CLAUDE.md` first, then this file.

## Reused core: origin
Copied from Element Warden (`git@github.com:senFouka/element-warden.git`)
at commit **`c16bbf793e41e7403cfc1087544f43192e6a096f`** (2026-10-04,
"Submitted to CrazyGames Basic Launch"). To port a later fix:
`git log c16bbf7..HEAD -- <path>` in Element Warden, then apply by hand.

| Shardgate file | From Element Warden | Changes |
|---|---|---|
| `src/services/platform/*` | same paths | localStorage prefix `shardgate-td:` |
| `src/systems/SaveSystem.ts` | same | comments only |
| `src/systems/saveFormat.ts` | same | counter `lifetimeEssenceEarned` → `lifetimeWavesCleared`; Essence/Sanctum/offline/daily/discoveries removed; speed 1/2/3; RunSave fields for a maze game. Reconcile rules unchanged. |
| `src/systems/ProfileStore.ts` | same | trimmed to mute, speed, hints, bests, `addWaveCleared()` |
| `src/systems/Sfx.ts` | same | same API and rules; Phaser sound manager replaced by Web Audio |
| `src/core/EventBus.ts` | same | same API; own emitter instead of Phaser's; event map emptied |
| `src/core/viewport.ts` | same | same idea (fixed play area, scenery instead of bars), now a perspective-camera fit |
| `src/art/draw.ts` | same | unchanged |
| `src/art/palette.ts` | same | own colours |
| `src/ui/ui.css`, `src/ui/*.ts` | `ui/theme.ts`, UIScene | HUD and menus are HTML/CSS over the canvas |
| `src/ui/FocusPause.ts` | `UIScene.buildFocusPause/pauseForFocus` | own class, same behaviour, HTML overlay |
| `tests/saveFormat.test.ts`, `tests/sounds.test.ts` | same | adapted to the new fields |
| `.gitignore`, `.env.basic`, `tsconfig.json`, `vite.config.ts`, `index.html` | same | names/colours |

Not copied (Element Warden-specific): its art (`spireArt`, `enemyArt`,
`icons`, `textures`), gameplay systems, Kenney sounds (sounds will be chosen
by the user in Milestone 6).

### Playtest harness
Lives outside the repo in `%TEMP%\sg-driver` (`playwright-core` 1.63, copied
from Element Warden's `%TEMP%\ew-driver`; drives the system Chrome with
`channel: 'chrome'` and SwiftShader WebGL). Element Warden's method: bots run
in real headless Chrome and step GameScene's own simulation at a fixed
1/60 s, faster than real time. Scripts so far: `smoke.mjs` (game), `measure.mjs`, `gif.mjs`, `graphics.mjs`, `gfx2.mjs` (slice). Use `--use-angle=d3d11` for the real GPU.

## Step 0: Visual direction (done: the user chose A, 3D Three.js, 2026-10-06)
Slices merged into main; direction B (Phaser + baked sprites) removed.
- [x] Assets sourced, licences checked, logged in `ASSETS.md` (+ `slices/ASSET_SOURCES.txt`).
- [x] Slice A, 3D (`slices/3d`, Three.js 0.186 added as a dependency for the slice).
- [x] Slice B, 2.5D Phaser (`slices/iso`) with sprites baked from the same 3D content (`slices/bake`, written to `slices/public/iso` by `%TEMP%/sg-driver/bake.mjs`).
- [x] Measured in headless Chrome on the real GPU (`%TEMP%/sg-driver/measure.mjs`, `gif.mjs`; output in `%TEMP%/sg-driver/step0`).
- [x] Report: https://claude.ai/artifact/F69beBtzR7hrvr9fBqhat1 (recommends A).
- [x] User picked **A**. Phaser removed from the game; core ported to Three.js + HTML UI (see the table above).
- [x] Graphics settings: Low / Medium / High / Custom with per-detail controls, auto-detection from the GPU (`src/data/graphics.ts`, unit-tested) plus a frame-rate check that steps an automatic preset down (verified: High -> Medium -> Low on a throttled run, toast shown). The slice uses the same renderer and panel.
- Run: `npm run slices` -> http://localhost:5180/3d/index.html (`?gfx=low|medium|high`, `?fps=1`).
- Measurement notes: headless Chrome caps rAF at ~75 Hz; uncapped mode is unreliable for multi-pass rendering; "laptop proxy" = GTX 1650 at 2560x1440; 1440p numbers vary a lot between runs.
- User feedback (2026-10-06): wants a bigger map with a longer path, with spawn and exit ending next to each other and space between them. Must be our own layout (originality rule); proposal goes into 1b.

## Milestone 1: Core copy + map
- [x] **1a** git repo, remote, Vite/Phaser/TS scaffold, reused core copied,
      build + tests green. Smoke test (headless Chrome): boots in ~3 s,
      CrazyGames SDK in `local` mode, mute persists to the profile, blur
      pauses / tap resumes, phone viewport letterboxes, no JS errors.
- [x] **1b** Map: after 36x22 (too small), 72x44 and 54x33 (too big), the user sent an Element TD 2 screenshot and asked for that route. Built "Shardgate Spiral" 34x30: blue portal in / red portal out side by side at the top, fixed spiral of 2-cell cobblestone lanes with 2-cell grass strips between (double-pass), route 219 cells, 525 grass cells. Own art (cobblestone, kerbs, portals, forest). Originality exception recorded in CLAUDE.md.
- [x] **1b-2** The user approved (2026-10-06): ETD-style mechanics (element boss unlocks each element after the first, duals, triples later, interest every 15 s), fixed route for the whole game (no mazing), build anytime + wave countdown. Recorded in CLAUDE.md.
- [x] 1c fixed route + grid (lanes / grass), tests prove lanes never touch off-route
- [x] 1d place / sell on grass: ghost (green/red) + range ring, tap to build, tap tower to select, Sell with 100%/75% refund
- [x] 1e `src/game/Game.ts` (pure TS, 10 tests): skeleton creeps, 40 waves by formula (draft numbers in balance.ts), countdown + early-call bonus, interest 2%/15 s, leaks, game over / victory, Play again. Views: Bolt (aims, recoils) and Mortar (lobbed shells, blast, shockwave), health bars, death effects. HUD: lives, gold + interest timer, wave, Start / Next wave button; build bar (keys 1/2); tower panel; end screen.
- [ ] 1f bots: planner vs spammer, balance report (numbers in balance.ts are a first draft), load time, FPS
- Open: the user asked to copy Element TD's tower looks; told them we make our own designs in that spirit (originality rule, CrazyGames risk) and asked for reference screenshots of the qualities they like.

## Done after M1 at the user's request (out of milestone order)
- Wave pacing (60 s route, 80 s max, 10 s rest, Start now), 40 creep looks + 8 bosses, Bolt/Mortar 3 levels, sounds + music system, balance via bots (start gold 100, +1 gold / 3 s, bosses 8x HP).
- Mortar is ground-only: never targets or splashes flying creeps (user rule, 2026-10-07).

## Milestone 3: Elements (started early: the user asked for many towers with special roles, 2026-10-07)
- [x] Rules (`Game.ts`, `data/elements.ts`, `balance.ts`): six elements in the counter cycle, wave armor (`WAVE_ARMOR`), x1.5 / x0.5 damage; first pick unlocks at once, a pick at the start of waves 5..35 summons that element's guardian boss (unlocks or levels the element when it dies or leaks); random pick +25 gold; element levels add +15% damage; convert Bolt/Mortar into any owned element tower (same level, pay the difference).
- [x] Tower mechanics: Ember burn, Frost slow + shard splash, Gale chain lightning, Stone stun chance, Venom stacking poison + armor shred, Tide lobbed splash + knockback. Bosses take half stun/knockback.
- [x] Views: six element towers on the ornate kit (`render/elementTowers.ts`), each with its own head and 3 visible levels; projectiles, impacts, lightning arcs, status effects on creeps (burn/chill/poison/stun), guardian summon burst, element-unlock light pillar. Particle counts follow the graphics preset.
- [x] HUD: element pick panel (desktop: left card list; phone: row above the build bar), build bar with owned elements (keys 1-8), armor + counter in the wave chip, next-wave preview during rest, tower panel with effect text, counter vs this wave, Convert buttons.
- [x] 9 element tests (52 total). Bots: planner with elements wins 4/4, random newbie loses at waves 38-40.
- [ ] Element-specific sounds (waiting for the user's audition picks), guardian models review, balance report for approval.
- Audio round 2 (all CC0, OpenGameArt + Freesound): 8 music tracks, 64 SFX in `slices/audition/sounds/` (manifest2.json, SOURCES2.txt); waiting for the user's numbers. Log the chosen ones in ASSETS.md when they move to `public/audio`.

## Difficulty (user request 2026-10-08)
- [x] Easy / Medium / Hard / Extreme in `BALANCE.difficulty` (start gold, lives, creep/boss hp, kill gold), eased in over waves 1-19 (`difficultyRamp`). Selector before Start (desktop: row under the top bar; phone: column on the right) and on the end screen; tag in the wave chip; remembered in the profile; best wave per difficulty.
- Bots (6 games each): Easy planner 6/6, newbie 6/6. Medium planner 6/6, newbie loses w37-40. Hard planner 3/6 (others w30-37), newbie w25-33. Extreme planner 0/6 (w10-40, median ~23), newbie w15-21. The planner bot now opens with 6 Bolts.

## Construction time, first pick at wave 5, harder levels (user, 2026-10-08)
- [x] Building takes 5 s, upgrades 5 s (to Lv 2) and 10 s (to Lv 3), converting 5 s (`BALANCE.construction`; a 15 s entry waits for a possible level 4). A working tower does not shoot; a gold progress bar floats over it; it rises out of the ground while built; sparks spiral while it upgrades. Panel shows "To Lv 2… 3s".
- [x] No element pick before wave 5; the wave-5 pick unlocks at once, later picks summon guardians.
- [x] Harder (user reached wave 30 on Extreme easily): hp Easy 0.85 / Medium 1.3 / Hard 2.0 / Extreme 2.9 (bosses 0.85/1.3/1.9/2.6), Extreme 12 lives, less kill gold on Hard/Extreme. Bots (5 games): Easy all win; Medium planner 5/5, counter-bot 2/5, newbie w33-35; Hard planner w13-26, counter-bot 1/5; Extreme bots w8-15. The bots play worse than the user, so these are relative numbers.

## Ads (user request 2026-10-08, part of Milestone 5)
- [x] Rewarded, by player choice only, each with a play-button badge: "Other elements" on the pick panel (once per pick), "Refill lives" next to the wave chip (once per game, shown at 60% lives or less), "Continue with N lives" on the defeat screen (once per game, half lives, the wave goes on). The reward is granted only on `rewarded`; ad blocker / no fill show a toast and use nothing up. The game holds still while an ad plays.
- [x] Midgame ad only between games: Play again / a difficulty on the end screen. Never during a wave or before the first wave.
- [x] Hidden when ads are off (VITE_ADS=off build, or the SDK reports Basic Launch). Tested in Chrome with the CrazyGames SDK local demo ads (about 5 s each); 3 rule tests in `tests/ads.test.ts`.

## Later small changes (2026-10-09)
- First two bosses (waves 5, 10) 30% weaker (`bosses.earlyHp`). Ad offers styled apart; lives refill offered from the first lost life. Reset game (with confirmation) in Settings. No interest countdown under gold. Graphics details fold away in Settings.
- Rewarded ad for gold, once per wave: tapping a build or Upgrade without enough gold offers the price (capped at `ads.goldMax`), then builds/upgrades. Note: a tower bought this way can be sold the same wave for a full refund, so it works like a once-per-wave gold ad.

- Damage numbers over every direct hit (one GPU draw call, glyph atlas; `render/damageNumbers.ts`): white, crits orange, 20% bigger, with "!". Cap on live numbers follows the particle density preset; crits always show. Crit: 5% chance (was 10%, user 2026-10-09), ×2 (`BALANCE.crit`, towers may override `critChance`), shown in the tower panel. Normal creeps +20% hp (`waves.normalHp`), bosses unchanged.

## CrazyGames readiness (path 1, keeping every feature; user 2026-10-09)
- [x] Performance: towers baked (still parts merged, orbiting parts as rings), still parts of all towers in one BatchedMesh per material, shared gem materials, no shadows from small moving parts, health bars in one draw. Heavy scene (40 L3 towers, a wave; CPU x4 throttle, phone viewport): Low 17-24 -> 36-39 fps, Medium 17 -> 26-30 fps. Same look.
- [x] Tower glow halved (`TOWER_GLOW`), music stops while the page is unfocused/hidden, normal creeps x1.38 hp, wave chip without "/ 40".
- [x] Game speed 1x/2x/3x (button + key F, saved in the profile).
- [x] Save/resume: checkpoint at every wave start (towers, gold, lives, elements, picks, ad helps, dice, guardians on the road); reload resumes at that wave in the ready phase; cleared on game over / new game.
- [ ] In-game onboarding with controls, creep death sound pick, mobile placement offset, AdBlock check, covers/description/PEGI, final checklist.

## Store package (2026-10-09, same layout as Element Warden / Monster Spire)
- [x] `store/`: three covers (1920x1080, 800x1200, 800x800; title only, rendered from the game by picking the busiest frame), two preview videos (16:9 and 2:3, 17 s, 30 fps, no sound, title on the first frame; each rendered with its own camera, frame by frame), `listing.md` (title, description, controls, features, tags, upload steps), `upload/` = `npm run build` output with ads on (user, 2026-10-09; 103 files, 16 MB; CrazyGames disables ads during Basic Launch, the game then hides the offers after one "disabled" answer with a short message). Checked from the exact upload files at 1216x684 and 800x450: playable in 1.4-3 s, no ad offers, no failed requests, no errors.
- [x] CrazyGames requirement pages read (gameplay, technical incl. user consent, account integration, sitelock/common fixes): added user-select none, page never scrolls, no browser context menu, sound wakes on tap after iOS suspends it. No accounts, no personal data (no privacy notice needed), no fullscreen button, English.
- [x] Damage numbers: hits close together in place and time merge into one growing number (readable crowds). Game speed 1x / 1.5x only. Music never plays while the page is hidden or unfocused.
- Open: sitelock (optional), the creep death sound pick, the ad-gold refund question.

## Visual overhaul, stage 1: environment (user: "make it amazing", 2026-10-09)
- [x] The battlefield is a plateau: a cliff of crags drops into a lake (own water shader: depth from the terrain, shallow turquoise to deep blue, ripples, glints, shore foam), shores rise into wooded hills (pines, broadleaf, autumn trees, bushes, logs, mushrooms, boulders) with ruins (columns, obelisks) around the gate plaza.
- [x] Road: cut stone setts in staggered rows with bevels and a bump map, moss and grime, grass spilling over uneven kerb stones. Grass: rich painted ground, clumps of tufts, flowers, pebbles and mushrooms in meadow patches (cleared under towers, back when sold). Build grid only while placing.
- [x] Atmosphere: sky gradient, warmer sun and bounce light, golden-hour grade, drifting cloud shadows, pollen and fireflies (count follows particle density).
- [x] Cost kept low: static scenery merged with vertex colours into a few meshes, static matrices frozen, trees cast no shadows. A/B in one page (CPU x4, phone): the new environment costs ~0-3 fps. Build 17 MB, load to playable 2.7-3.7 s.
- Next stages: 2 gates as the hero of the scene, 3 distinct tower silhouettes per element, 4 bigger effects, 5 one coherent style (outline), 6 visual onboarding.

## Notes for the proposal (1b)
A throwaway sim (not in the repo) compared, at equal tower counts, a
"gauntlet" (towers hugging the straight path) with a comb maze on the
proposed map. Fire coverage per enemy pass (sum over towers of path cells
in range, range 3):

| towers | gauntlet | comb maze |
|---|---|---|
| 15 | 80 | 52 |
| 30 | 167 | 215 |
| 60 | 317 | 490 |
| 90 | 467 | 795 |

Mazing only overtakes the gauntlet at ~25–30 towers, so cheap wall towers
and enough early gold matter for "mazing clearly beats spamming".
