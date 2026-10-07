# External assets

Every third-party asset used in the game must be listed here with its source
and licence. Licences were checked by hand on 2026-10-06 (the licence file
inside each download and the official page). Full download notes:
`slices/ASSET_SOURCES.txt`.

## Models (Step 0 visual slices, `slices/public/models/`)

| File | Pack / author | Source | Licence | Changes |
|---|---|---|---|---|
| `kaykit-skeletons/Skeleton_Minion.glb`, `Skeleton_Warrior.glb` | KayKit Character Pack: Skeletons 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 | CC0 1.0 (`LICENSE.txt` in repo) | animations trimmed from 95 to 12 clips |
| `kaykit-skeletons/Skeleton_Blade.glb`, `Skeleton_Axe.glb` | same | same | CC0 1.0 | none |
| `quaternius/Yeti.glb` | Quaternius, Ultimate Monsters | https://quaternius.com/packs/ultimatemonsters.html | `License.txt` in the download: CC0 1.0. **Note:** quaternius.com/license.html now shows the "Quaternius Asset License v1.0" (2026-08-28): commercial games allowed, no credit needed, no reselling the assets as assets. | converted glTF to GLB, animations trimmed to 7 clips |
| `kenney-nature/*.glb` (rocks, trees, bushes, grass) | Kenney, Nature Kit 2.1 | https://kenney.nl/assets/nature-kit | CC0 1.0 (`License.txt` in zip) | recoloured in code |

Downloaded but not used yet (kept in the scratchpad, not in the repo):
Kenney Tower Defense Kit 2.1 and Castle Kit 2.0 (CC0), KayKit Medieval
Hexagon Pack 1.0 (CC0), other Quaternius monsters.

## Creep models (`public/models/monsters/`, 47 files, 5.3 MB)
Details per model (source page id, clips kept): `public/models/monsters/SOURCES.txt`; list: `catalog.json`.

| Files | Pack / author | Source | Licence | Changes |
|---|---|---|---|---|
| `big_*`, `blob_*`, `fly_*` (43) | Quaternius, Ultimate Monsters | 4 from the official Google Drive glTF; 39 from Quaternius's own Poly Pizza upload of the same pack (https://poly.pizza/bundle/Ultimate-Monsters-Bundle-5oyGWAmOB6, each model "CC0 1.0", uploader Quaternius; Drive was over its download quota) | CC0 1.0 (licence files in the folder; Quaternius site also shows its own licence v1.0, commercial games allowed) | clips trimmed to move/death/hit, prefixes stripped, colours as vertex colours, KHR_mesh_quantization |
| `skel_*` (4) | KayKit Character Pack: Skeletons 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 | CC0 1.0 | clips trimmed, 256 px palette, meshes merged |

Excluded on purpose: Quaternius Orc / Orc_Skull (too Warcraft-like).

## Images
Direction B's sprites (`slices/public/iso/`) are our own renders of the
models above plus our procedural towers; the ground, towers, gates and all
effects are painted or built in code.

## Music and sound effects (`public/audio/`)
Picked by the user on the audition page (2026-10-08). All **CC0 1.0**, licence read on each item's page (2026-10-07); attribution not required. Each file ships as `.ogg` + `.mp3`, loudness-normalised (music about -16 LUFS stereo, effects mono). Full source notes for every candidate: `slices/audition/sounds/SOURCES2.txt`.

| File | Source | Author | Licence | Edit |
|---|---|---|---|---|
| music_menu | "Fantasy Orchestral Theme", https://opengameart.org/content/fantasy-orchestral-theme | Joth | CC0 1.0 | trimmed 3:12 -> 2:43, 4 s fade |
| music_battle | "Battle Theme A", https://opengameart.org/content/battle-theme-a | cynicmusic | CC0 1.0 | none (author asks, not requires, credit "cynicmusic.com pixelsphere.org") |
| bossWave | "war horn", https://freesound.org/s/539956/ | adharca | CC0 1.0 | trimmed |
| bossDeath | "DRAGON_ROAR" https://freesound.org/s/85568/ + "Stone crash" https://freesound.org/s/711657/ | JoelAudio, discofield | CC0 1.0 | layered by us |
| build | "impact-stone-heavy" https://freesound.org/s/513694/ + "achievement-sparkle" https://freesound.org/s/715067/ | kasparsj, SkySpeira | CC0 1.0 | layered by us |
| upgrade | "achievement-sparkle", https://freesound.org/s/715067/ | SkySpeira | CC0 1.0 | trimmed |
| sell | "Money Bag", https://freesound.org/s/338260/ | PhilSavlem | CC0 1.0 | trimmed |
| waveStart | "Muffled Distant Explosion", https://freesound.org/s/149966/ | NenadSimic | CC0 1.0 | trimmed |
| leak | "TollBell", https://freesound.org/s/73678/ | daytripper | CC0 1.0 | trimmed |
| gameOver | "Failure Drum Sound Effect 3", https://freesound.org/s/456964/ | FunWithSound | CC0 1.0 | trimmed |
| victory | "Success Fanfare Trumpets", https://freesound.org/s/456966/ | FunWithSound | CC0 1.0 | trimmed to < 4 s |
| denied | "Bonk Click w/deny feel", https://freesound.org/s/220210/ | GameAudio | CC0 1.0 | trimmed |
| click | "Wooden Click", https://freesound.org/s/321083/ | BenjaminNelan | CC0 1.0 | trimmed |
| boltShot, mortarFire, creepDeath | Kenney packs (www.kenney.nl), one of: RPG Audio, Impact Sounds, Interface Sounds, Sci-Fi Sounds, Digital Audio (exact source in `slices/audition/sounds/backup_v1` notes) | Kenney | CC0 1.0 (`License.txt` in each zip) | first set, waiting for the user's pick |

Tower hits and shell blasts have no sound (user's choice).
