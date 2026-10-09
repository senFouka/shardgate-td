import './ui/ui.css';
import * as THREE from 'three';
import { platform } from './services/platform';
import { loadSavesAtBoot, setPendingSave } from './systems/SaveSystem';
import { profile } from './systems/ProfileStore';
import { sfx } from './systems/Sfx';
import { music } from './systems/Music';
import { gameEvents } from './core/EventBus';
import { GameRenderer } from './render/GameRenderer';
import { GraphicsController } from './render/GraphicsController';
import { CameraRig } from './render/CameraRig';
import { MapView } from './render/MapView';
import { Particles } from './render/particles';
import { CreepRoster } from './render/creepModels';
import { MAP } from './data/map';
import { Game } from './game/Game';
import { GameView } from './game/GameView';
import { BuildInput } from './game/BuildInput';
import { FocusPause } from './ui/FocusPause';
import { SettingsPanel } from './ui/SettingsPanel';
import { mountCornerButtons } from './ui/Hud';
import { GameHud } from './ui/GameHud';
import { ELEMENTS } from './data/elements';
import { towerStats } from './data/balance';
import { CREEP_LOOKS } from './data/creeps';
import { toast } from './ui/Toast';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Boot: platform, saves, audio, renderer and graphics settings, the map,
 * camera, UI, then the game loop.
 */
const PITCH_DEG = 56;
const SKY = 0x2a3a2a;
/** Display name of a tower kind, for messages. */
const TOWER_NAMES = (kind: string): string => (kind in ELEMENTS ? ELEMENTS[kind as keyof typeof ELEMENTS].tower : kind[0].toUpperCase() + kind.slice(1));

const DENIED: Record<string, string> = {
  'not-grass': 'Towers go on the grass beside the road. Right-click (or X) to stop building.',
  occupied: 'There is already a tower there.',
  gold: 'Not enough gold.',
  over: 'The game is over.',
  locked: 'Unlock that element first.',
};

async function boot(): Promise<void> {
  await platform.init();
  platform.loadingStart();
  const saves = await loadSavesAtBoot();
  profile.load(saves.profile);
  setPendingSave(saves.run);
  sfx.init();
  music.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 40, 90);
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 400);
  const renderer = new GameRenderer(document.getElementById('game')!, scene, camera);
  const canvas = renderer.renderer.domElement;
  // soft studio reflections: gold trim and bronze read as metal
  const pmrem = new THREE.PMREMGenerator(renderer.renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  const rig = new CameraRig(camera, canvas, { width: MAP.cols, depth: MAP.rows, pitchDeg: PITCH_DEG, minCellsAcross: 14 });

  // light: the sun's shadow box follows the view so shadows stay sharp at any zoom
  scene.add(new THREE.HemisphereLight(0xd8e8ff, 0x46351f, 1.15));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.7);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  renderer.addShadowLight(sun);
  const followSun = () => {
    const { target, distance } = rig.view;
    const half = Math.max(8, distance * 0.62);
    const sc = sun.shadow.camera;
    [sc.left, sc.right, sc.top, sc.bottom] = [-half, half, half, -half];
    sc.near = 1;
    sc.far = 60 + half * 2;
    sc.updateProjectionMatrix();
    sun.target.position.copy(target);
    sun.position.set(target.x - 12, 30, target.z - 12);
    const fog = scene.fog as THREE.Fog;
    fog.near = distance * 1.15;
    fog.far = distance * 2.6;
  };

  const mapView = new MapView();
  const creepModels = new CreepRoster();
  await Promise.all([mapView.build(renderer.renderer.capabilities.getMaxAnisotropy()), creepModels.init()]);
  scene.add(mapView.group);

  const graphics = new GraphicsController(renderer, profile);
  gameEvents.on('graphics:changed', ({ preset, reason }) => {
    if (reason === 'auto') toast(`Graphics lowered to ${preset[0].toUpperCase()}${preset.slice(1)} for smoother play. You can change it in Settings.`);
  });

  /* ------------------------------------------------------------- game */

  let game = new Game(undefined, profile.difficulty);
  let view = new GameView(game, creepModels, () => renderer.particleScale);
  scene.add(view.root);

  const hud = new GameHud({
    waveName: (wave, boss) => creepModels.nameFor(wave, boss),
    onPickTower: (kind) => input.pick(kind),
    onSell: (t) => {
      game.sell(t);
      input.select(null);
    },
    onUpgrade: (t) => {
      const err = game.upgrade(t);
      if (err === 'gold') {
        sfx.play('denied');
        toast('Not enough gold to upgrade.', 1600);
      }
      hud.showTower(t);
      view.showRange(t);
    },
    onConvert: (t, el) => {
      if (game.convert(t, el) === 'gold') {
        sfx.play('denied');
        toast('Not enough gold to convert.', 1600);
      }
      hud.showTower(t);
      view.showRange(t);
    },
    onPickElement: (choice) => {
      game.pick(choice);
    },
    onCloseTower: () => input.select(null),
    onRestart: () => void nextGame(),
    onDifficulty: (d) => {
      profile.setDifficulty(d);
      // switching before the first wave is not a break between games: no ad
      if (game.phase === 'ready') startGame();
      else void nextGame();
    },
    onAdReroll: () => void rewarded(() => game.rerollOffer()),
    onAdRefill: () => void rewarded(() => game.refillLives()),
    onAdBuild: (kind) =>
      void rewarded(() => {
        if (!game.grantAdGold(towerStats(kind, 1).cost)) return false;
        hud.pick(kind); // now place it
        toast(`+${towerStats(kind, 1).cost} gold. Tap the grass to build your ${TOWER_NAMES(kind)}.`, 3000);
        return true;
      }),
    onSpeed: () => {
      const next = profile.speed === 1 ? 2 : profile.speed === 2 ? 3 : 1;
      profile.setSpeed(next);
      hud.setSpeed(next);
    },
    onAdUpgrade: (t) =>
      void rewarded(() => {
        const cost = game.upgradeCost(t);
        if (cost === null || !game.grantAdGold(cost)) return false;
        game.upgrade(t);
        hud.showTower(t);
        return true;
      }),
    onAdContinue: () =>
      void rewarded(() => {
        if (!game.continueGame()) return false;
        hud.hideEnd();
        platform.gameplayStart();
        return true;
      }),
  });
  const input = new BuildInput(camera, canvas, rig, scene, new Particles(8, true), {
    onSelect: (t) => hud.showTower(t),
    onBuilt: () => undefined,
    onDenied: (reason, kind, col, row) => {
      // not enough gold: offer an ad that pays for this tower, then build it here
      if (reason === 'gold' && hud.canOfferGold()) {
        const price = towerStats(kind, 1).cost;
        sfx.play('denied');
        hud.offerGold(TOWER_NAMES(kind), price, () =>
          void rewarded(() => {
            if (!game.grantAdGold(price)) return false;
            game.build(kind, col, row);
            return true;
          }),
        );
        return;
      }
      sfx.play('denied');
      toast(DENIED[reason] ?? 'You cannot build there.', 1800);
    },
    onCancelBuild: () => hud.pick(null),
  });

  /* -------------------------------------------------------------- ads */

  /** True while an ad plays: the game holds still (its audio is muted by the platform). */
  let adPlaying = false;

  /**
   * A rewarded ad the player asked for. The reward is granted only when the
   * platform confirms the ad was watched to the end; otherwise nothing
   * changes and the offer stays.
   */
  async function rewarded(grant: () => boolean): Promise<void> {
    if (adPlaying) return;
    adPlaying = true;
    platform.gameplayStop();
    const outcome = await platform.showRewardedAd();
    adPlaying = false;
    if (game.phase === 'playing') platform.gameplayStart();
    if (outcome === 'rewarded') {
      grant();
      return;
    }
    if (outcome === 'adblock') toast('The ad could not play (is an ad blocker on?). Nothing was used up.', 3500);
    else if (outcome !== 'disabled') toast('No ad is available right now. Try again in a little while.', 3000);
  }

  /** Between games (game over / victory -> next game) is the only place for a midgame ad. */
  async function nextGame(): Promise<void> {
    if (adPlaying) return;
    adPlaying = true;
    await platform.showMidgameAd();
    adPlaying = false;
    startGame();
  }
  platform.onAdsEnabledChange((on) => hud.setAdsEnabled(on));
  hud.setSpeed(profile.speed);
  hud.setAdsEnabled(platform.adsEnabled());

  function startGame(): void {
    scene.remove(view.root);
    view.reset();
    game = new Game(undefined, profile.difficulty);
    view = new GameView(game, creepModels, () => renderer.particleScale);
    view.setScale(renderer.bufferHeight(), camera.fov);
    scene.add(view.root);
    hud.bind(game);
    input.bind(game, view);
    game.on((e) => {
      if (e.type === 'over') {
        platform.gameplayStop();
        hud.showEnd(e.won, e.wave);
        profile.noteWave(game.difficulty, e.wave);
      }
      if (e.type === 'wave-start' && e.wave > 1) profile.addWaveCleared();
      if (e.type === 'summon') toast(`${CREEP_LOOKS[e.creep.look]?.name ?? 'A guardian'} walks the road. ${game.elements[e.element] ? `Defeat it to raise ${ELEMENTS[e.element].name} to level ${game.elements[e.element] + 1}.` : `Defeat it to claim ${ELEMENTS[e.element].name}.`}`, 4500);
      if (e.type === 'element') toast(e.level === 1 ? `${ELEMENTS[e.element].name} unlocked: build the ${ELEMENTS[e.element].tower}, or convert a Bolt or Mortar.` : `${ELEMENTS[e.element].name} is now level ${e.level}: all its towers hit harder.`, 4500);
    });
    view.prefetchOffer();
    platform.gameplayStart();
  }
  hud.bind(game);
  input.bind(game, view);
  startGame();
  // first-time tip, after the first element pick (the pick panel explains itself)
  if (!profile.hasSeenHint('build')) {
    const tip = () => {
      if (game.offer && game.pickIsFree) return void setTimeout(tip, 500);
      toast('Pick a tower below, tap the grass beside the road to build it, then press Start.', 7000);
      profile.markHintSeen('build');
    };
    setTimeout(tip, 4600);
  }

  renderer.onResize(() => {
    rig.fit();
    mapView.route.setScale(renderer.bufferHeight(), camera.fov);
    view.setScale(renderer.bufferHeight(), camera.fov);
  });
  renderer.resize();

  /* --------------------------------------------------------------- UI */

  let paused = false;
  const focusPause = new FocusPause({
    canPause: () => !paused,
    onPause: () => (paused = true),
    onResume: () => (paused = false),
  });
  const settings = new SettingsPanel(graphics, {
    // a reset is the player's own choice, not a break between games: no ad
    onReset: () => {
      if (!focusPause.visible) paused = false;
      startGame();
    },
    onOpen: () => {
      paused = true;
      platform.gameplayStop();
    },
    onClose: () => {
      if (!focusPause.visible) paused = false;
      platform.gameplayStart();
    },
  });
  mountCornerButtons(() => settings.open());
  // every button in the HTML UI clicks
  document.addEventListener('pointerdown', (e) => {
    if ((e.target as Element | null)?.closest?.('#ui button')) sfx.play('click');
  });

  /* ------------------------------------------------------------- loop */

  const timer = new THREE.Timer();
  timer.connect(document);
  let time = 0;
  const frame = () => {
    timer.update();
    const realDt = timer.getDelta();
    const dt = Math.min(0.05, realDt);
    if (!paused && document.visibilityState === 'visible') graphics.sampleFrame(realDt * 1000);
    const gdt = paused || adPlaying ? 0 : dt;
    time += gdt;
    // game speed: the rules and the battlefield effects run faster; camera, UI and music do not
    const sdt = gdt * profile.speed;
    game.advance(sdt);
    rig.update(dt);
    followSun();
    mapView.route.points.visible = game.phase === 'ready';
    mapView.update(time, gdt);
    view.update(sdt, camera);
    const s = view.shakeAmount;
    if (s > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0));
    hud.update();
    // calm theme in menus and before the first wave, battle theme while waves run
    music.play(game.phase === 'playing' && !settings.isOpen ? 'battle' : 'menu');
    music.update(realDt);
    renderer.render(dt);
    requestAnimationFrame(frame);
  };

  rig.update(1);
  followSun();
  await renderer.warmUp();
  platform.loadingStop();
  requestAnimationFrame(frame);

  // Dev-only handles so the game can be inspected and driven from the console (and by the bots).
  if (import.meta.env.DEV) {
    Object.assign(window, { platform, profile, graphics, renderer, scene, rig, camera, music });
    // a live getter: the game object is replaced on restart
    Object.defineProperty(window, 'game', { get: () => game, configurable: true });
  }
}

void boot();
