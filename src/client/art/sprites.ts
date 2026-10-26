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
