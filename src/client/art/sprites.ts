// Placeholder sprite source. Uses PixelGen (tools/pixel-forge.html, window.PixelGen)
// when it's available; otherwise a tiny built-in seeded generator so the game still runs.

import type { SpriteSpec } from "../../sim/data/types";

const PIXELGEN_URL = "/tools/pixel-forge.html";

type PixelGenApi = Record<string, unknown>;

export interface SpriteSource {
  name: "PixelGen" | "fallback";
  make(spec: SpriteSpec): HTMLCanvasElement;
}

export async function loadSpriteSource(): Promise<SpriteSource> {
  const pg = await loadPixelGen();
  if (pg) {
    return {
      name: "PixelGen",
      make: (spec) => fromPixelGen(pg, spec) ?? fallbackSprite(spec),
    };
  }
  return { name: "fallback", make: fallbackSprite };
}

/** Load pixel-forge.html in a hidden same-origin iframe and grab its window.PixelGen. */
async function loadPixelGen(): Promise<PixelGenApi | null> {
  try {
    // Vite's SPA fallback answers missing .html with index.html, so check the content first.
    const res = await fetch(PIXELGEN_URL);
    if (!res.ok || !(await res.text()).includes("PixelGen")) return null;
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    frame.src = PIXELGEN_URL;
    const timeout = setTimeout(() => resolve(null), 3000);
    frame.onload = () => {
      clearTimeout(timeout);
      const pg = (frame.contentWindow as (Window & { PixelGen?: PixelGenApi }) | null)?.PixelGen;
      resolve(pg ?? null);
    };
    document.body.appendChild(frame);
  });
}

/**
 * Call into PixelGen. Its exact API isn't pinned down in this repo yet, so this
 * tries the obvious entry points and accepts a canvas (or {canvas}) back.
 * Once pixel-forge.html is committed, replace this with the real call.
 */
function fromPixelGen(pg: PixelGenApi, spec: SpriteSpec): HTMLCanvasElement | null {
  for (const name of ["generate", "create", "make", spec.kind]) {
    const fn = pg[name];
    if (typeof fn !== "function") continue;
    try {
      const out = fn.call(pg, { kind: spec.kind, type: spec.kind, seed: spec.seed });
      const canvas = isCanvas(out) ? out : isCanvas(out?.canvas) ? out.canvas : null;
      // Copy into this document; the iframe's canvas belongs to another realm.
      if (canvas) return copyCanvas(canvas);
    } catch (err) {
      console.warn(`PixelGen.${name} failed`, err);
    }
  }
  console.warn("PixelGen loaded but no usable generator found; using fallback sprite", spec);
  return null;
}

function isCanvas(v: unknown): v is HTMLCanvasElement {
  return !!v && typeof (v as HTMLCanvasElement).getContext === "function";
}

function copyCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d")!.drawImage(src, 0, 0);
  return c;
}

// --- Fallback: mirrored random-fill sprite with an outline. ---

const PALETTES: Record<string, string[]> = {
  hero: ["#d9c7a0", "#4a7bd1", "#2c4f8f", "#e8e2d0"],
  monster: ["#7fae4b", "#4f7a2c", "#b5463c", "#2f4a1c"],
};

function fallbackSprite(spec: SpriteSpec): HTMLCanvasElement {
  const size = 14;
  const half = size / 2;
  let s = spec.seed * 2654435761 + spec.kind.length;
  const rand = () => {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >>> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    return s / 4294967296;
  };
  const palette = PALETTES[spec.kind] ?? PALETTES.monster!;
  const grid: (string | null)[][] = Array.from({ length: size }, () => Array<string | null>(size).fill(null));

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < half; x++) {
      // Denser toward the centre column and middle rows so it reads as a body.
      const centre = 1 - Math.abs(x - half) / half;
      const middle = 1 - Math.abs(y - half) / half;
      if (rand() < 0.25 + centre * 0.45 + middle * 0.2) {
        const color = palette[Math.floor(rand() * palette.length)]!;
        grid[y]![x] = color;
        grid[y]![size - 1 - x] = color;
      }
    }
  }

  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0b0b10";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y]![x]) continue;
      const near = [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ].some(([dx, dy]) => grid[y + dy!]?.[x + dx!]);
      if (near) ctx.fillRect(x, y, 1, 1);
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const color = grid[y]![x];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}
