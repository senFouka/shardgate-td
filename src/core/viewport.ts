import * as THREE from 'three';

/**
 * Camera framing. Ported from Element Warden's viewport idea: every player
 * sees the same play area whatever the window shape; a bigger screen is
 * sharper, never a wider view of the battlefield. The space around the play
 * area shows scenery (hills and fog) instead of black bars.
 *
 * In 3D the "play area" is a rectangle on the ground (in cells) seen by a
 * perspective camera at a fixed pitch. `fitDistance` returns how far the
 * camera must stand so the rectangle fits the current aspect ratio.
 */
export interface PlayArea {
  /** ground rectangle to keep in view, in world units */
  width: number;
  depth: number;
  /** extra height above the ground to keep visible (tall towers at the far edge) */
  headroom: number;
}

export function fitDistance(camera: THREE.PerspectiveCamera, area: PlayArea, pitchRad: number): number {
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const needW = area.width;
  const needH = area.depth * Math.sin(pitchRad) + area.headroom;
  return Math.max(needW / camera.aspect, needH) / (2 * tanHalf);
}

/** Places the camera on its pitch arc around `target`, at `distance`. */
export function placeCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3, pitchRad: number, distance: number): void {
  camera.position.set(target.x, target.y + Math.sin(pitchRad) * distance, target.z + Math.cos(pitchRad) * distance);
  camera.lookAt(target);
}
