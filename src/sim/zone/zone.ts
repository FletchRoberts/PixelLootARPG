// Zone layout data + tile queries and wall collision. Plain data, no rendering.

import type { Vec } from "../core/vec";

export const SOLID = 0;
export const FLOOR = 1;

export interface PackSpawn {
  pos: Vec; // world px
  size: number;
  kind: "path" | "branch" | "end";
}

export interface Zone {
  seed: number;
  biome: string;
  width: number; // tiles
  height: number;
  tileSize: number; // px
  tiles: number[]; // row-major, SOLID | FLOOR
  start: Vec; // world px
  exit: Vec; // world px
  mainPath: Vec[]; // node centres, world px (start → end)
  branchEnds: Vec[]; // dead-end clearings, world px (future reward spots)
  packs: PackSpawn[];
  pathLength: number; // tiles along the main path
}

export function isFloor(zone: Zone, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= zone.width || ty >= zone.height) return false;
  return zone.tiles[ty * zone.width + tx] === FLOOR;
}

export function tileOf(zone: Zone, p: Vec): { tx: number; ty: number } {
  return { tx: Math.floor(p.x / zone.tileSize), ty: Math.floor(p.y / zone.tileSize) };
}

export function isFloorAt(zone: Zone, p: Vec): boolean {
  const { tx, ty } = tileOf(zone, p);
  return isFloor(zone, tx, ty);
}

export function tileCenter(zone: Zone, tx: number, ty: number): Vec {
  return { x: (tx + 0.5) * zone.tileSize, y: (ty + 0.5) * zone.tileSize };
}

/** Push a circle out of any solid tiles it overlaps. Returns the corrected position. */
export function resolveWalls(zone: Zone, pos: Vec, radius: number): Vec {
  const ts = zone.tileSize;
  let { x, y } = pos;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const x0 = Math.floor((x - radius) / ts);
    const x1 = Math.floor((x + radius) / ts);
    const y0 = Math.floor((y - radius) / ts);
    const y1 = Math.floor((y + radius) / ts);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (isFloor(zone, tx, ty)) continue;
        const cx = Math.max(tx * ts, Math.min(x, (tx + 1) * ts));
        const cy = Math.max(ty * ts, Math.min(y, (ty + 1) * ts));
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          x += (dx / d) * (radius - d);
          y += (dy / d) * (radius - d);
        } else {
          // Centre is inside the tile: leave through the nearest face.
          const left = x - tx * ts;
          const right = (tx + 1) * ts - x;
          const top = y - ty * ts;
          const bottom = (ty + 1) * ts - y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) x -= left + radius;
          else if (m === right) x += right + radius;
          else if (m === top) y -= top + radius;
          else y += bottom + radius;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x, y };
}

/** True if the straight line a→b stays on floor tiles (sampled every quarter tile). */
export function hasLineOfSight(zone: Zone, a: Vec, b: Vec): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(d / (zone.tileSize / 4)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!isFloorAt(zone, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}
