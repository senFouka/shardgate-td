import * as THREE from 'three';
import { MAP } from '../data/map';

/**
 * Grid cell <-> world. One cell is one world unit; the map is centred on the
 * origin, columns along +x and rows along +z (toward the camera), y up.
 */
export const HALF_W = (MAP.cols - 1) / 2;
export const HALF_D = (MAP.rows - 1) / 2;

export function cellX(col: number): number {
  return col - HALF_W;
}

export function cellZ(row: number): number {
  return row - HALF_D;
}

export function cellToWorld(col: number, row: number, y = 0): THREE.Vector3 {
  return new THREE.Vector3(cellX(col), y, cellZ(row));
}

/** The cell under a world point (may be outside the map). */
export function worldToCell(x: number, z: number): { col: number; row: number } {
  return { col: Math.round(x + HALF_W), row: Math.round(z + HALF_D) };
}
