// Breadth-first distance field over floor tiles, rooted at a target tile.
// Monsters walk downhill on it, so they follow corridors instead of hugging walls.
// It's a derived cache (rebuilt from zone + target), not part of serialized state.

import { isFloor, type Zone } from "./zone";

export const UNREACHED = 0xffff;

export interface FlowField {
  tx: number;
  ty: number;
  dist: Uint16Array; // steps from target, UNREACHED beyond maxDist
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** True if moving from (x,y) by (dx,dy) doesn't clip a wall corner. */
export function canStep(zone: Zone, x: number, y: number, dx: number, dy: number): boolean {
  if (!isFloor(zone, x + dx, y + dy)) return false;
  if (dx !== 0 && dy !== 0) return isFloor(zone, x + dx, y) && isFloor(zone, x, y + dy);
  return true;
}

export function buildFlowField(zone: Zone, tx: number, ty: number, maxDist: number): FlowField {
  const w = zone.width;
  const dist = new Uint16Array(w * zone.height).fill(UNREACHED);
  if (!isFloor(zone, tx, ty)) return { tx, ty, dist };
  // Uniform cost per step (diagonals included) keeps this a plain BFS.
  let frontier = [ty * w + tx];
  dist[frontier[0]!] = 0;
  for (let d = 1; d <= maxDist && frontier.length; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % w;
      const y = (i - x) / w;
      for (const [dx, dy] of DIRS) {
        if (!canStep(zone, x, y, dx, dy)) continue;
        const ni = (y + dy) * w + x + dx;
        if (dist[ni] !== UNREACHED) continue;
        dist[ni] = d;
        next.push(ni);
      }
    }
    frontier = next;
  }
  return { tx, ty, dist };
}

export function distAt(field: FlowField, zone: Zone, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= zone.width || ty >= zone.height) return UNREACHED;
  return field.dist[ty * zone.width + tx]!;
}

/** Neighbour tile one step closer to the target, or null if none / unreached. */
export function nextStep(field: FlowField, zone: Zone, tx: number, ty: number): { tx: number; ty: number } | null {
  const here = distAt(field, zone, tx, ty);
  if (here === UNREACHED || here === 0) return null;
  let best: { tx: number; ty: number } | null = null;
  let bestD = here;
  for (const [dx, dy] of DIRS) {
    if (!canStep(zone, tx, ty, dx, dy)) continue;
    const d = distAt(field, zone, tx + dx, ty + dy);
    if (d < bestD) {
      bestD = d;
      best = { tx: tx + dx, ty: ty + dy };
    }
  }
  return best;
}
