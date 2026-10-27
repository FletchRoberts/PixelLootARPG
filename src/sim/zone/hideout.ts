// The hideout: a small, fixed, safe room between maps with stations to use (Map Device,
// Stash, Crafting Bench). It's an ordinary Zone with no packs and stations instead of an exit.

import type { HideoutDef } from "../data/types";
import type { MapRun } from "../items/types";
import { FLOOR, SOLID, type Zone } from "./zone";

/** The map run that means "in the hideout". */
export function hideoutRun(def: HideoutDef): MapRun {
  return { seed: 0, level: 1, mods: [], name: def.name, free: true, deaths: 0, hideout: true };
}

/** A rounded room (an ellipse inside a solid border). */
export function hideoutZone(def: HideoutDef, tileSize: number): Zone {
  const { width, height } = def;
  const tiles = new Array<number>(width * height).fill(SOLID);
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2 - 1.5;
  const ry = height / 2 - 1.5;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) tiles[y * width + x] = FLOOR;
    }
  }
  const px = ([x, y]: [number, number]) => ({ x: x * tileSize, y: y * tileSize });
  const start = px(def.start);
  return {
    seed: 0,
    biome: def.biome,
    layout: "hideout",
    width,
    height,
    tileSize,
    tiles,
    start,
    exit: start, // unused: the hideout has no exit (leave through the Map Device)
    mainPath: [start],
    branchEnds: [],
    packs: [],
    pathLength: 0,
    stations: def.stations.map((s) => ({ id: s.id, name: s.name, pos: px(s.pos) })),
  };
}
