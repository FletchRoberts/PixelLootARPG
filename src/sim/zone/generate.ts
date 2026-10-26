// Linear zone generator: a winding main path (start → end arena) with short
// dead-end side branches. Built as a polyline of capsules + circles in tile
// space, rasterized to a grid, smoothed, and checked for connectivity.

import { Rng } from "../core/rng";
import { add, clamp, dist, normalize, scale, sub, type Vec } from "../core/vec";
import type { Range, ZoneGenConfig } from "../data/types";
import { FLOOR, SOLID, type PackSpawn, type Zone } from "./zone";

const DEG = Math.PI / 180;
const MAX_ATTEMPTS = 30;

interface Segment {
  a: Vec;
  b: Vec;
  hwA: number; // half-width at a
  hwB: number;
  owner: number; // index in a path, for adjacency checks
  path: "main" | number; // "main" or branch index
}

interface Circle {
  c: Vec;
  r: number;
}

interface Layout {
  main: Vec[];
  mainWidths: number[];
  segments: Segment[];
  circles: Circle[];
  branchEnds: Vec[];
}

const rollRange = (rng: Rng, r: Range) => rng.range(r[0], r[1]);
const rollInt = (rng: Rng, r: Range) => rng.int(r[0], r[1]);
const fromAngle = (a: number, l: number): Vec => ({ x: Math.cos(a) * l, y: Math.sin(a) * l });

function pointSegDist(p: Vec, a: Vec, b: Vec): { d: number; t: number } {
  const ab = sub(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y;
  const t = l2 > 0 ? clamp(((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2, 0, 1) : 0;
  return { d: dist(p, add(a, scale(ab, t))), t };
}

/** Approximate min distance between two segments by sampling one of them. */
function segSegDist(a1: Vec, b1: Vec, a2: Vec, b2: Vec): number {
  const steps = Math.max(2, Math.ceil(dist(a1, b1) * 2));
  let best = Infinity;
  for (let i = 0; i <= steps; i++) {
    const p = add(a1, scale(sub(b1, a1), i / steps));
    best = Math.min(best, pointSegDist(p, a2, b2).d);
  }
  return best;
}

function clearOf(segs: Segment[], a: Vec, b: Vec, hw: number, gap: number, skip: (s: Segment) => boolean): boolean {
  for (const s of segs) {
    if (skip(s)) continue;
    if (segSegDist(a, b, s.a, s.b) < hw + Math.max(s.hwA, s.hwB) + gap) return false;
  }
  return true;
}

function buildLayout(cfg: ZoneGenConfig, rng: Rng): Layout | null {
  const mp = cfg.mainPath;
  const dir = rng.range(0, Math.PI * 2);
  const main: Vec[] = [{ x: 0, y: 0 }];
  const mainWidths: number[] = [rollRange(rng, mp.halfWidth)];
  const mainHeadings: number[] = [0];
  const segments: Segment[] = [];
  const count = rollInt(rng, mp.segments);
  let heading = rng.range(-mp.maxHeadingDegrees, mp.maxHeadingDegrees) * DEG * 0.5;

  for (let i = 1; i <= count; i++) {
    const prev = main[i - 1]!;
    let placed = false;
    for (let t = 0; t < 12 && !placed; t++) {
      const h = clamp(
        heading + rng.range(-mp.maxTurnDegrees, mp.maxTurnDegrees) * DEG,
        -mp.maxHeadingDegrees * DEG,
        mp.maxHeadingDegrees * DEG,
      );
      const p = add(prev, fromAngle(dir + h, rollRange(rng, mp.segmentLength)));
      const hw = rollRange(rng, mp.halfWidth);
      // Non-adjacent main segments must stay apart so the path never merges with itself.
      if (!clearOf(segments, prev, p, hw, cfg.gap, (s) => s.owner >= i - 2)) continue;
      segments.push({ a: prev, b: p, hwA: mainWidths[i - 1]!, hwB: hw, owner: i - 1, path: "main" });
      main.push(p);
      mainWidths.push(hw);
      mainHeadings.push(h);
      heading = h;
      placed = true;
    }
    if (!placed) return null;
  }

  const circles: Circle[] = [
    { c: main[0]!, r: cfg.startRadius },
    { c: main[main.length - 1]!, r: cfg.endRadius },
  ];
  // The end arena is big; make sure it doesn't swallow earlier parts of the path.
  const endC = circles[1]!;
  for (const s of segments) {
    if (s.owner >= count - 2) continue;
    if (pointSegDist(endC.c, s.a, s.b).d < endC.r + Math.max(s.hwA, s.hwB) + cfg.gap) return null;
  }
  for (let i = 2; i < main.length - 2; i++) {
    if (rng.next() >= mp.clearingChance) continue;
    const c = { c: main[i]!, r: rollRange(rng, mp.clearingRadius) };
    const ok = segments.every(
      (s) => Math.abs(s.owner - i) <= 1 || pointSegDist(c.c, s.a, s.b).d >= c.r + Math.max(s.hwA, s.hwB) + cfg.gap,
    );
    if (ok) circles.push(c);
  }

  // Dead-end branches off interior nodes, heading out to one side.
  const br = cfg.branches;
  const branchEnds: Vec[] = [];
  for (let i = 2; i < main.length - 3; i++) {
    if (rng.next() >= br.chance) continue;
    const side = rng.next() < 0.5 ? -1 : 1;
    let h = dir + mainHeadings[i]! + side * rollRange(rng, br.angleDegrees) * DEG;
    let at = main[i]!;
    const bIndex = branchEnds.length;
    const parts: Segment[] = [];
    const n = rollInt(rng, br.segments);
    for (let k = 0; k < n; k++) {
      const hw = rollRange(rng, br.halfWidth);
      const p = add(at, fromAngle(h, rollRange(rng, br.segmentLength)));
      // The first segment starts inside the main corridor, so only check the part beyond its wall,
      // and ignore the two main segments it branches from.
      const from = k === 0 ? add(at, fromAngle(h, mainWidths[i]! + hw + cfg.gap)) : at;
      const adjacent = (s: Segment) => k === 0 && s.path === "main" && (s.owner === i || s.owner === i - 1);
      const okMain = clearOf(segments, from, p, hw, cfg.gap, adjacent);
      const okCircles = circles.every((c) => c.c === main[i] || pointSegDist(c.c, from, p).d >= c.r + hw + cfg.gap);
      if (!okMain || !okCircles) break;
      parts.push({ a: at, b: p, hwA: hw, hwB: hw, owner: k, path: bIndex });
      at = p;
      h += rng.range(-br.maxTurnDegrees, br.maxTurnDegrees) * DEG;
    }
    if (parts.length === 0) continue;
    const end = { c: at, r: rollRange(rng, br.endRadius) };
    const endOk = segments.every((s) => parts.includes(s) || pointSegDist(end.c, s.a, s.b).d >= end.r + Math.max(s.hwA, s.hwB) + cfg.gap);
    if (!endOk) continue;
    segments.push(...parts);
    circles.push(end);
    branchEnds.push(at);
  }

  return { main, mainWidths, segments, circles, branchEnds };
}

function rasterize(cfg: ZoneGenConfig, layout: Layout, rng: Rng) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (p: Vec, r: number) => {
    minX = Math.min(minX, p.x - r);
    minY = Math.min(minY, p.y - r);
    maxX = Math.max(maxX, p.x + r);
    maxY = Math.max(maxY, p.y + r);
  };
  for (const s of layout.segments) {
    grow(s.a, Math.max(s.hwA, s.hwB));
    grow(s.b, Math.max(s.hwA, s.hwB));
  }
  for (const c of layout.circles) grow(c.c, c.r);

  const pad = cfg.margin + 1;
  const offset: Vec = { x: pad - Math.floor(minX), y: pad - Math.floor(minY) };
  const width = Math.ceil(maxX) - Math.floor(minX) + pad * 2;
  const height = Math.ceil(maxY) - Math.floor(minY) + pad * 2;
  const jitter = Array.from({ length: width * height }, () => (rng.next() - 0.5) * cfg.edgeRoughness);
  let tiles = new Array<number>(width * height).fill(SOLID);

  const mark = (x0: number, y0: number, x1: number, y1: number, inside: (p: Vec, j: number) => boolean) => {
    for (let ty = Math.max(0, Math.floor(y0)); ty <= Math.min(height - 1, Math.ceil(y1)); ty++) {
      for (let tx = Math.max(0, Math.floor(x0)); tx <= Math.min(width - 1, Math.ceil(x1)); tx++) {
        const idx = ty * width + tx;
        if (tiles[idx] === FLOOR) continue;
        if (inside({ x: tx + 0.5, y: ty + 0.5 }, jitter[idx]!)) tiles[idx] = FLOOR;
      }
    }
  };

  for (const s of layout.segments) {
    const a = add(s.a, offset);
    const b = add(s.b, offset);
    const r = Math.max(s.hwA, s.hwB) + 1;
    mark(Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r, (p, j) => {
      const { d, t } = pointSegDist(p, a, b);
      return d < s.hwA + (s.hwB - s.hwA) * t + j;
    });
  }
  for (const c of layout.circles) {
    const cc = add(c.c, offset);
    mark(cc.x - c.r - 1, cc.y - c.r - 1, cc.x + c.r + 1, cc.y + c.r + 1, (p, j) => dist(p, cc) < c.r + j);
  }

  // One smoothing pass: fill pinholes, drop single-tile spurs.
  const next = tiles.slice();
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && tiles[(y + dy) * width + x + dx] === FLOOR) n++;
      const idx = y * width + x;
      if (tiles[idx] === SOLID && n >= 6) next[idx] = FLOOR;
      else if (tiles[idx] === FLOOR && n <= 2) next[idx] = SOLID;
    }
  }
  tiles = next;
  // Keep the outer margin solid no matter what.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < cfg.margin || y < cfg.margin || x >= width - cfg.margin || y >= height - cfg.margin) tiles[y * width + x] = SOLID;
    }
  }
  return { tiles, width, height, offset };
}

/** Flood fill from (sx, sy); clears any floor not reachable. Returns reachable count. */
function keepReachable(tiles: number[], width: number, height: number, sx: number, sy: number): number {
  const seen = new Uint8Array(width * height);
  const stack = [sy * width + sx];
  if (tiles[stack[0]!] !== FLOOR) return 0;
  seen[stack[0]!] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop()!;
    count++;
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (!seen[ni] && tiles[ni] === FLOOR) {
        seen[ni] = 1;
        stack.push(ni);
      }
    }
  }
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === FLOOR && !seen[i]) tiles[i] = SOLID;
  return count;
}

/** Pack centres in tile space: spaced along the main path, at branch ends, and in the end arena. */
function placePacks(cfg: ZoneGenConfig, rng: Rng, mainTiles: Vec[], widths: number[], branchEnds: Vec[], pathLength: number): PackSpawn[] {
  const pk = cfg.packs;
  const out: PackSpawn[] = [];
  let travelled = 0;
  let nextAt = pk.safeStartDistance + rollRange(rng, pk.spacing) * 0.5;
  const stopAt = pathLength - cfg.endRadius - 2;
  for (let i = 1; i < mainTiles.length; i++) {
    const a = mainTiles[i - 1]!;
    const b = mainTiles[i]!;
    const l = dist(a, b);
    while (nextAt <= travelled + l && nextAt < stopAt) {
      const t = (nextAt - travelled) / l;
      const along = add(a, scale(sub(b, a), t));
      const perp = normalize({ x: -(b.y - a.y), y: b.x - a.x });
      const hw = widths[i - 1]! + (widths[i]! - widths[i - 1]!) * t;
      out.push({ pos: add(along, scale(perp, rng.range(-0.4, 0.4) * hw)), size: rollInt(rng, pk.size), kind: "path" });
      nextAt += rollRange(rng, pk.spacing);
    }
    travelled += l;
  }
  for (const e of branchEnds) {
    if (rng.next() < pk.branchChance) out.push({ pos: e, size: rollInt(rng, pk.branchSize), kind: "branch" });
  }
  out.push({ pos: mainTiles[mainTiles.length - 1]!, size: rollInt(rng, pk.endSize), kind: "end" });
  return out;
}

export function generateZone(cfg: ZoneGenConfig, seed: number): Zone {
  const rng = new Rng(seed);
  const biome = rng.weighted(cfg.biomes)?.id ?? cfg.biomes[0]!.id;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const layout = buildLayout(cfg, rng);
    if (!layout) continue;
    const { tiles, width, height, offset } = rasterize(cfg, layout, rng);
    const toTile = (p: Vec) => add(p, offset);
    const start = toTile(layout.main[0]!);
    const end = toTile(layout.main[layout.main.length - 1]!);
    keepReachable(tiles, width, height, Math.floor(start.x), Math.floor(start.y));
    if (tiles[Math.floor(end.y) * width + Math.floor(end.x)] !== FLOOR) continue;

    const mainTiles = layout.main.map(toTile);
    let pathLength = 0;
    for (let i = 1; i < mainTiles.length; i++) pathLength += dist(mainTiles[i - 1]!, mainTiles[i]!);
    const branchTiles = layout.branchEnds.map(toTile);
    const ts = cfg.tileSize;
    const px = (p: Vec): Vec => ({ x: p.x * ts, y: p.y * ts });
    const packs = placePacks(cfg, rng, mainTiles, layout.mainWidths, branchTiles, pathLength).map((p) => ({ ...p, pos: px(p.pos) }));

    return {
      seed,
      biome,
      width,
      height,
      tileSize: ts,
      tiles,
      start: px(start),
      exit: px(end),
      mainPath: mainTiles.map(px),
      branchEnds: branchTiles.map(px),
      packs,
      pathLength,
    };
  }
  throw new Error(`Zone generation failed for seed ${seed} after ${MAX_ATTEMPTS} attempts`);
}
