# Shardgate TD: CrazyGames listing

## Title
Shardgate TD

## Short description (one line)
Build elemental towers along a winding road, claim the elements from their guardians and stop 40 waves of monsters before they reach the red gate.

## Description
Monsters pour out of the blue gate and march down a long, winding stone road toward the red one. Every one that gets through costs you a life. Build towers on the grass beside the road and stop them all.

Start with the Bolt, a quick crossbow, and the Mortar, which lobs shells into groups on the ground. From wave 5 you claim the elements. Each one brings a tower that fights in its own way: the Ember Brazier sets enemies on fire, the Frost Spire slows them down, the Gale Orb throws lightning that jumps from enemy to enemy, the Stone Monolith hits hard and stuns, the Venom Font stacks poison that weakens armor, and the Tide Well knocks whole groups back.

Every wave wears an elemental armor, and every element is strong against one armor and weak against another, so read the next wave and build the right towers. Later elements must be won: picking one sends its guardian down the road, and when it falls, the element is yours. Upgrade towers to level 3 and watch them grow, or turn a Bolt or Mortar into an element tower.

The road spirals in and back out, so a tower placed between two lanes hits the monsters twice. Save gold to earn interest, or spend it now to stop a boss. Eight bosses, a new monster every wave, four difficulties from Easy to Extreme, and your game is saved after every wave.

## Controls
- **Build:** pick a tower in the bar at the bottom (or press **1**-**8**), then click or tap the grass beside the road. Right-click or press **X** to stop building.
- **Tower info, upgrade, sell:** click or tap a tower. Press **U** to upgrade the selected tower.
- **Start the next wave early:** the Start button at the top, or **Space** (gives a little bonus gold).
- **Move the map:** drag, or use the arrow keys. **Zoom:** mouse wheel or pinch.
- **Game speed:** the 1x / 1.5x button, or **F**.
- Works with mouse and keyboard, and with touch on phones and tablets (landscape).

## Features
- Six elements, each with its own tower, effect and 3 upgrade levels; Bolt and Mortar to start
- Elemental armor and counters: strong ×1.5, weak ×0.5
- Element guardians to defeat; a boss every 5 waves; 40 waves, each with its own monster
- Damage numbers and critical hits, splash, chain lightning, burning, poison, slow, stun, knockback
- Four difficulties (Easy, Medium, Hard, Extreme), 1x / 1.5x speed
- Progress is saved after every wave; graphics settings for every device

## Suggested tags
Tower Defense, Strategy, Magic, Defense, Monster

## Upload steps
1. Sign in at https://developer.crazygames.com and start a **new game** (engine: **HTML5**).
2. Game files: archives are NOT accepted. Open `store/upload/` (a copy of `dist/` from
   `npm run build:basic`: the Basic Launch build, ads off as Basic Launch requires),
   select everything inside (`index.html`, `favicon.svg`, `assets/`, `audio/`, `models/`)
   and drag it into the upload zone. 103 files, 16 MB.
   For a Full Launch later: `npm run build` (ads on) and upload `dist/` the same way.
3. Title, description and controls: from this file. Category: Strategy. Tags: see above.
4. Covers: `cover-landscape-1920x1080.png`, `cover-portrait-800x1200.png`, `cover-square-800x800.png`.
5. Preview videos: `preview-landscape-1920x1080.mp4`, `preview-portrait-1080x1620.mp4`
   (17 s, 30 fps, no sound, the title on the first frame; not in git, rebuild with the
   capture script if needed).
6. **Progress Save:** "Yes, using the Data Module from the CrazyGames SDK".
7. Mobile: yes. Orientation: **landscape**. Multiplayer: no. SDK audio muting: yes.
8. PEGI 12 (fantasy combat, no blood, no real-world violence).

## Files in this folder
- `cover-*.png`: the three covers (rendered from the real game; title font Cinzel Decorative, OFL, see ASSETS.md)
- `preview-*.mp4`: the two preview videos (not in git)
- `upload/`: the game files to drag into the upload zone (not in git; rebuild with `npm run build:basic` and copy `dist/` here)
