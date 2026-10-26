// Placeholder sprites from PixelGen. tools/pixel-forge.html is the single source of
// the generator: we import the page as text and run its <script id="core"> block,
// which is dependency-free and defines PixelGen. Works in dev and in production builds.

import forgeHtml from "../../../tools/pixel-forge.html?raw";
import type { SpriteSpec } from "../../sim/data/types";

interface PixelGrid {
  w: number;
  h: number;
  p: (string | null)[];
}

export interface PixelGenApi {
  generate(opts: { type: string; seed: string; size?: number; theme?: string }): PixelGrid;
  toCanvas(grid: PixelGrid, scale?: number): HTMLCanvasElement;
  types: string[];
  themes: string[];
}

let cached: PixelGenApi | undefined;

export function pixelGen(): PixelGenApi {
  if (cached) return cached;
  const core = /<script id="core">([\s\S]*?)<\/script>/.exec(forgeHtml)?.[1];
  if (!core) throw new Error('tools/pixel-forge.html: <script id="core"> not found');
  // The core declares `const PixelGen = ...`; wrap it so we get the value back without globals.
  cached = new Function("window", "module", `${core}\nreturn PixelGen;`)(undefined, undefined) as PixelGenApi;
  return cached;
}

export function makeSprite(spec: SpriteSpec): HTMLCanvasElement {
  const pg = pixelGen();
  return pg.toCanvas(pg.generate({ type: spec.type, seed: spec.seed, theme: spec.theme, size: spec.size ?? 32 }));
}

// ---------------------------------------------------------------------------
// Armour icons. PixelGen has no armour types yet (planned for the art pass), so
// these are tiny hand-drawn silhouettes: '#' body, '+' shadow; '.' is a highlight
// when it sits between solid pixels on its row, and transparent outside them.

const SILHOUETTES: Record<string, string[]> = {
  helmet: [
    "....####....",
    "..##.....##.",
    ".#.########+",
    ".#.#######++",
    "#.########++",
    "#.##+##+##++",
    "#.#++++++#++",
    "#.#+....+#+.",
    "#.#+....+#+.",
    ".##......##.",
  ],
  body: [
    ".##......##.",
    "#.##....##+#",
    "#.########+#",
    "#.########+#",
    ".#.#######+.",
    "..#.######+.",
    "..#.######+.",
    "..#.######+.",
    "..#.######+.",
    "..########+.",
  ],
  gloves: [
    "...#.#.#....",
    "..#.#.#.#...",
    "..#.#.#.#...",
    "..#######.#.",
    "..#.#####+#.",
    "..#.######..",
    "..#.#####+..",
    "...#####++..",
    "...######...",
    "...######...",
  ],
  boots: [
    "...#####....",
    "...#.###+...",
    "...#.###+...",
    "...#.###+...",
    "...#.###+...",
    "..#.####+...",
    ".#.#####+##.",
    "#.#########+",
    "###########+",
    ".++++++++++.",
  ],
  belt: [
    "............",
    "............",
    "############",
    "#..........#",
    "####++++####",
    "####+..+####",
    "####++++####",
    "#..........#",
    "############",
    "............",
  ],
};

/** 12×10 silhouette icon for an armour slot, coloured (e.g. steel grey for Strength bases). */
export function armourIcon(slot: string, color: string): HTMLCanvasElement {
  const rows = SILHOUETTES[slot] ?? SILHOUETTES.body!;
  const c = document.createElement("canvas");
  c.width = 12;
  c.height = 10;
  const ctx = c.getContext("2d")!;
  const shade = (hex: string, k: number) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
    return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  };
  rows.forEach((row, y) => {
    const first = row.search(/[#+]/);
    const last = Math.max(row.lastIndexOf("#"), row.lastIndexOf("+"));
    [...row].forEach((ch, x) => {
      const inside = x > first && x < last;
      if (ch === "#") ctx.fillStyle = shade(color, 1);
      else if (ch === "+") ctx.fillStyle = shade(color, 0.55);
      else if (ch === "." && inside) ctx.fillStyle = shade(color, 1.4);
      else return;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return c;
}
