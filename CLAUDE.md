# CLAUDE.md — Shardgate TD (working title)

A classic **elemental tower defense** web game for **CrazyGames**, in the spirit of the Warcraft III-era elemental TD custom maps (and Element TD 2, which the user named as the reference for route and mechanics): creeps walk a fixed winding route, the player builds towers beside it, earns elements by defeating elemental bosses, and combines elements into stronger dual (later triple) towers. Decided with the user on 2026-10-06: fixed route, no mazing.
Solo developer. Read this file at the start of every session, then `PROGRESS.md`.

## Originality rule (hard rule)
This is a spiritual successor to a genre, **not a copy of any existing game**. Genre mechanics (mazing, element picks, combining elements into towers, waves, interest, armor types) are fine. Everything the player sees must be our own:
- No names, tower names, creep names, map layouts, icons, art, UI or text from Element TD, Element TD 2 or any other game.
- Our elements, towers, enemies and map are designed in this file.
- If you are unsure whether something is too close to an existing game, ask the user.
- **Exception decided by the user (2026-10-06):** the first map's creep route follows the route of Element TD 2's classic map (two portals side by side at the top, a spiral that runs lanes side by side, blue in / red out), from a screenshot the user supplied. Only the route shape is taken; terrain art, props, names and UI stay our own.

## Visual direction (top priority)
Visual quality is the #1 priority. It overrides any other guidance in this file that conflicts with it; only the hard limits below beat it.
- **Target feel:** the classic Warcraft III-era elemental TD experience. A rich fantasy battlefield seen from above at an angle; glowing elemental towers that clearly look like their element; chunky, readable creeps with health bars; loud, colorful spell and projectile effects (fire trails, ice shards, chain lightning arcs, poison clouds, impact bursts, death effects). The game must look "expensive", not like a mobile prototype.
- **Towers visibly evolve** with each upgrade. **Dual-element towers look like a fusion** of both elements.
- **Budget:** a heavier game is accepted. Spend the performance and size budget on visuals first.
- **Hard limits (the only things that beat visuals):**
  - Total download < 20 MB. Initial load to gameplay < 10 s. Load the first map and basic towers first; stream the rest in the background.
  - ≥ 60 fps on a normal laptop, ≥ 30 fps on a mid-range phone, through the graphics settings below.
  - Originality (above): our own tower and creep designs. Never use ripped or recreated models, textures, icons or UI from Warcraft, Element TD or any other game. The genre's look and feel: yes. Copies: no.
- **Assets:** free assets only with licenses that allow commercial use (prefer CC0: Kenney, Quaternius, Poly Pizza, ...). Verify each license yourself and log every asset with its license in `ASSETS.md`. Ask before adding any paid asset or new dependency.
- **No "placeholder now, art later"** for anything the player sees often (towers, creeps, effects, map). Every milestone includes visual polish for what it adds.
- When a visual choice costs performance, prefer moving it to the Low graphics setting over cutting the effect for everyone.
- **Decided in Step 0 (2026-10-06): direction A, real-time 3D with Three.js.** Stylized low-poly, live lighting and shadows, bloom on emissive elements, GPU-friendly pooled particles. Our towers are built from code; creeps and nature props come from verified free packs (see `ASSETS.md`). The Step 0 slice (`slices/3d`) is the visual reference.

## Graphics settings
- **Presets: Low / Medium / High**, plus **Custom**: the player can change each detail on its own (render resolution, shadows, bloom/glow, anti-aliasing, particle density, post effects). Changing any detail switches the preset to Custom.
- **Default is automatic** from the player's hardware: strong systems get High, weaker ones Medium, very weak ones Low. Detection uses the GPU/device info at boot, then the measured frame rate in the first seconds of play steps the preset down if needed (never up, never once the player has chosen manually). Tell the player when it steps down.
- Saved in ProfileSave settings. Every setting applies live, without a reload.
- Each new effect must declare what it does per preset; prefer moving an effect to a higher preset over cutting it.

## CrazyGames quality bar (lesson from Element Warden)
Element Warden was **rejected in October 2026**: "The overall quality of the game does not yet meet the expectations of our platform." Treat their quality guidelines (https://docs.crazygames.com/requirements/quality/) as acceptance criteria for every milestone:
- **Land directly in gameplay**; onboarding happens inside gameplay, is skippable, uses visuals more than text, and shows the keyboard/mouse controls. Explain only the core, not every feature.
- Clear, reachable goals; easy to learn and to understand; correct, clear language; consistent, intuitive controls; buttons clearly labelled, well sized, no artificial delays.
- Responsive to input; balanced, well-paced challenge; no repetitive or boring tasks; comfortable layout on desktop and mobile; comfortable audio with consistent levels.
- **Aesthetics:** high resolution, consistent resolution everywhere, no graphical defects or compression artifacts, one coherent art style.
- **Controls:** do not bind **Escape** or browser shortcuts (Ctrl+W etc.); read keys by physical position (`KeyboardEvent.code`) so AZERTY and other layouts work.
- Easy to add content later; frequently updated after release.
- Before submitting, compare against https://www.crazygames.com/new (current accepted games) and the requirements at https://docs.crazygames.com/requirements/intro/ (full implementation: SDK + gameplayStart, ads via SDK, works with AdBlock, PEGI 12, covers and description).

## Communication
- Talk to the user in **Persian (Farsi)**. Code, comments, commits and file names in English.
- The user is a full-stack web developer and has already shipped one Phaser game with you (Element Warden). Explain only new game-dev concepts (pathfinding, flow fields, etc.).
- You cannot hear audio. When sounds need choosing, give numbered options for the user to listen to.

## Tech stack
- **Three.js** (0.186, post-processing from its examples) + **TypeScript 5** + **Vite**. No backend. HUD and menus are HTML/CSS over the canvas. Phaser is not used.
- Ask before adding any dependency. Write pathfinding yourself; the grid is small.
- `npm run dev`, `npm run build` (`tsc --noEmit` + bundle), `npm test` (Node's built-in test runner, no extra deps).

## Reused core from Element Warden
Copy (do not link) these from the Element Warden repo (`git@github.com:senFouka/element-warden.git`) and adapt names. Do not rewrite them from scratch. Element Warden is a Phaser game: keep each module's API and behaviour, and replace only its Phaser parts (event emitter, sound manager, camera fit, scene UI):
- `services/platform/` (PlatformRouter, CrazyGamesPlatform SDK v3, MockPlatform with `?mockAds=1`; rewards only on `adFinished`)
- `systems/SaveSystem.ts` + `saveFormat.ts` (RunSave/ProfileSave split, merge by a monotonic lifetime-progress counter, never by timestamp, backups)
- `core/viewport.ts` (fixed play area, fogged void, fullscreen) and `core/EventBus.ts`
- `systems/Sfx.ts` (persisted mute, platform/ad override), pause on blur/tab hide
- The autonomous playtest harness (Playwright in a temp folder, never in package.json)

## Hard platform constraints (CrazyGames)
- Download < 20 MB. **Initial load to gameplay < 10 s** (first map and basic towers first, the rest streamed in the background). See "Visual direction".
- ≥ 60 fps on a normal laptop, ≥ 30 fps on a mid-range phone; graphics presets with auto-detection (see "Graphics settings").
- Desktop and mobile. Landscape 1280×720 play area. Touch targets ≥ 64 px. Mute always visible.
- Targets: average session 10+ min, Day-1 retention 10–15%, gameplay conversion 80%+.
- On submission, enable "Progress Save".

## Core loop
1. First map "Shardgate Spiral" (34×30 cells, `src/data/map.ts`): a **fixed route** of cobblestone lanes from the blue portal to the red portal, both at the top. The lanes spiral in and back out side by side, so towers on the grass between lanes hit creeps twice; the centre reaches most of the route. Towers are built on grass only.
2. The player places towers on the grass cells beside the route (one tower per cell). Towers never block the route.
3. Each enemy that reaches the exit costs lives. Lives at 0 → game over.
4. Gold from kills + **interest**: every 15 s of game time the player earns a percentage of banked gold (saving vs. spending is a real decision).
5. Every 5 waves the player **picks one element** (choice of 3, or a random pick for bonus gold). **No pick before wave 5** (user, 2026-10-08): the first waves are Bolt and Mortar only. The first pick (wave 5) unlocks at once. Every later pick **summons that element's boss**; the element unlocks only when the boss dies. Elements unlock single-element towers; owning two elements unlocks their dual tower; triples come later.
6. Towers are upgraded in place and can be **converted**: a basic tower (Bolt, Mortar) upgrades into any unlocked elemental tower, a single into a dual by adding a second owned element.
7. A **boss** walks at the end of every 5th wave (8 bosses in a 40-wave game, each its own model). A full game is **40 waves** in v1, with save/resume. Every wave has its own creep model (40 different looks).

## Map and route
- Grid of cells, 34×30 on the first map (72×44 and 54×33 were too big). Lane cells (creeps walk, no building) and grass cells (buildable).
- The camera starts on the whole map; the player zooms (wheel / pinch) and pans (drag / arrow keys) to build.
- Ground enemies follow the route polyline (`routePolyline()` in `src/data/map.ts`); flying enemies cut across the grass straight toward the next lane corner. The BFS in `src/systems/pathfinding.ts` is only used by tests to prove lanes never touch where the route does not continue (no shortcuts).
- Placement: grass cells only, one tower per cell. Show a ghost tower with its range while placing.

## Elements (data: `src/data/elements.ts`)
Six elements in a counter cycle. Each is **strong (×1.5)** against the next armor element in the cycle and **weak (×0.5)** against the previous one:

Ember → Frost → Gale → Stone → Venom → Tide → (back to Ember)

| Element | Identity | Strong vs. | Weak vs. |
|---|---|---|---|
| Ember | single-target burn damage | Frost | Tide |
| Frost | slows, chill | Gale | Ember |
| Gale | chain lightning, fast attacks | Stone | Frost |
| Stone | heavy hits, stun chance | Venom | Gale |
| Venom | stacking poison, armor shred | Tide | Stone |
| Tide | splash, knockback | Ember | Venom |

Element pick: on waves 5, 10, 15 … choose 1 of 3 offered elements, or take a **random pick** for a gold bonus. Picking an element you already own levels it (levels 2–3 boost all its towers).

## Towers (data: `src/data/towers.ts`)
- **Basic towers** (always available, cheap): Bolt (fast single-target, a small arbalest on a stone post) and Mortar (slow splash, ornate drum tower). Both have **3 levels**; each level looks visibly grander.
- **Single-element towers:** one per element, 3 upgrade levels each.
- **Dual-element towers:** one per pair of owned elements, 15 in total. Each must differ by mechanic, not just numbers (e.g. Ember+Frost "Thermal Shock": alternates burn/chill, bonus damage on switch; Gale+Stone "Quake Coil": chaining stuns). Propose the full list with names and mechanics before Milestone 4.
- Triple-element towers: later, after launch data.
- Sell refunds 75% (100% if sold in the same build phase it was placed).

## Enemies (data: `src/data/enemies.ts`)
- Each wave has one enemy **type** and one **armor element** (shown in the wave preview), so element choice and placement matter.
- Types: normal, fast, swarm (many weak), armored, regenerating, flying (cuts across the grass), splitter (splits on death), boss, and one **elemental boss** per element (summoned by element picks).
- Wave preview always shows the next wave's type, element and count.
- HP growth and all tuning numbers live in `src/data/balance.ts`. Never hardcode numbers in systems.

## Player agency and pacing
- Building, upgrading and selling are allowed at any time. Wave pacing (set by the user): a creep needs about **60 s** to walk the whole route; a wave gets at most **80 s**; once it is cleared (or its 80 s are up) a **10 s rest** counts down to the next wave. A **Start now** button starts the next wave at once (small gold bonus), any time after the current wave has finished spawning. Creeps of a wave walk close together so splash towers hit several.
- Free **1× / 1.5× speed** toggle (user, 2026-10-09: only these two), never ad-gated. Everything runs on game time; no gameplay timer uses real time.
- Tower info panel: DPS, targeting mode (first / last / strongest / closest), kill count.
- First-time hints, no blocking tutorial: the first 30 seconds teach placement and path preview.

## Difficulty and meta
- Difficulty per game: Easy / Medium / Hard / Extreme (Extreme added at the user's request, 2026-10-08; Medium = the game as tuned before). Chosen before the first wave (or on the end screen), locked per game, remembered in ProfileSave. Harder levels ease in over the first waves so a game never ends before the player has built anything.
- **Lifetime progress** (ProfileSave): best wave per difficulty, games won, element mastery (how often each element was picked in won games), cosmetic tower skins unlocked by achievements. Meta gives **variety and goals, not power**; this game stays skill-based.
- Daily challenge (later): fixed seed, fixed elements, shared for the day.

## Ads (fair rules, same as Element Warden)
- Rewarded, by player choice only: one extra element reroll per pick, one lives refill per game, one continue after game over (resume the current wave with half lives), and (user, 2026-10-09) once per wave, gold for a build or upgrade the player cannot afford: the ad pays that price and the build/upgrade happens.
- Midgame ad only at natural breaks: game over / victory → next game. Never during a wave or the build phase.
- No fake timers, no pressure mechanics, no paywalls. Much of the audience is teenagers.

## Milestones
Finish and verify each before the next. Do not build ahead. Every milestone includes visual polish for what it adds.
0. **Visual direction:** evaluate (A) 3D low-poly with Three.js/Babylon.js (stylized fantasy, real-time lighting, shadows, particles) vs. (B) Phaser 2.5D isometric with high-quality pre-rendered sprites; recommend one (look, performance, size, dev effort; for 3D, what changes in the reused core and how to keep Phaser-style simplicity). Source free assets (verified licenses, logged in `ASSETS.md`). Build a **visual vertical slice for each**: one map section with terrain, rocks and decoration; 3 towers (basic, Ember, Frost) at 2 upgrade levels each; 2 creep types walking a path with health bars; projectiles, hits, a death effect, one big elemental effect; real lighting/post-effects if 3D. Show from real headless Chrome: screenshots (desktop + mobile), a combat GIF or frame sequence, fps on desktop and with 4× CPU throttle, bundle size. Then **stop and wait for the user's choice**.
1. **Core copy + map:** copy the reused core, the fixed-route map, Bolt and Mortar, place/sell on grass, one enemy type, waves with countdown, lives, gold, interest, game over. Playable within 5 s.
2. **Wave design:** all enemy types, wave preview, bosses, 40-wave table, speed toggle, save/resume, difficulty.
3. **Elements:** element picks every 5 waves, single-element towers with upgrades, armor elements and the counter cycle, convert basic → elemental.
4. **Dual towers:** all 15 pairs with distinct mechanics; tower info panel and targeting modes.
5. **Meta + ads:** ProfileSave stats, achievements, cosmetic skins, rewarded ads, midgame ad.
6. **Polish:** juice, sound, mobile placement UX (drag-to-place with an offset so the finger doesn't hide the cell), performance with 200+ enemies.
7. **Autonomous balance + submit.**

## Autonomous playtest (from Milestone 1)
Bots (Playwright, temp folder):
- **planner:** places towers on double-pass spots and the centre, upgrades, picks elements by a simple rule.
- **spammer:** places towers at random grass cells (should lose early on Medium).
- **newbie:** slow, misplaces, opens menus.
- **chaos:** random taps, block attempts, sell spam, tab hide, SDK failure.

Report per batch: session length (real and game time), wave reached and death-wave distribution, leaks per wave, longest stretch with no affordable action, FPS min/avg (desktop, and 4× CPU throttling with a mobile viewport) and draw calls, JS errors, screenshots at key moments for visual review.

Targets: good placement (double-pass spots) clearly beats random placement; Medium is winnable by a decent planner; no bot wins Hard without element-counter play.

Fix bugs automatically. Show balance/design changes with before/after reports and wait for approval. At each milestone end, give the user a Persian checklist (max 15 min of play) covering only what you cannot verify (sound, feel, readability).

## Working rules
- Read `PROGRESS.md` first. Small steps; build and test after each; tell the user how to test in the browser.
- When a design decision isn't covered here, propose options and ask. Don't build ahead; don't quietly narrow scope.
- End of session: update `PROGRESS.md`, commit, push.
