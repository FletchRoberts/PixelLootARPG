import Phaser from "phaser";
import { content } from "../../data";
import type { Biome } from "../../sim/data/types";
import { makeSprite } from "../art/sprites";

export const TILE_SRC = 16; // source px per tile in biome tilesets

export const textureKey = {
  character: (id: string) => `character:${id}`,
  monster: (id: string) => `monster:${id}`,
  tileset: (biomeId: string) => `tiles:${biomeId}`,
  gem: (kind: string, defId: string) => `gem:${kind}:${defId}`,
};

/** Generates placeholder textures for all content, then starts the game. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    for (const c of content.characters) {
      if (c.sprite) this.textures.addCanvas(textureKey.character(c.id), makeSprite(c.sprite));
    }
    for (const m of content.monsters) {
      if (m.sprite) this.textures.addCanvas(textureKey.monster(m.id), makeSprite(m.sprite));
    }
    for (const b of content.biomes) this.textures.addCanvas(textureKey.tileset(b.id), makeTileset(b));
    // Gem icons: PixelGen "currency" sprites coloured by attribute (red Str, green Dex, blue Int).
    const theme = { strength: "blood", dexterity: "poison", intelligence: "ice" } as const;
    for (const g of content.skills) this.textures.addCanvas(textureKey.gem("skill_gem", g.id), makeSprite({ type: "currency", seed: `skill-${g.id}`, theme: theme[g.attribute], size: 16 }));
    for (const g of content.supports) this.textures.addCanvas(textureKey.gem("support_gem", g.id), makeSprite({ type: "currency", seed: `support-${g.id}`, theme: theme[g.attribute], size: 16 }));
    this.scene.start("Game");
  }
}

/**
 * One row of tiles: floor variants first, then wall variants.
 * Index i < variants is floor variant i; variants + i is wall variant i.
 */
function makeTileset(biome: Biome): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SRC * biome.variants * 2;
  canvas.height = TILE_SRC;
  const ctx = canvas.getContext("2d")!;
  for (let i = 0; i < biome.variants; i++) {
    const floor = makeSprite({ ...biome.floor, seed: `${biome.floor.seed}-${i}`, size: TILE_SRC });
    const wall = makeSprite({ ...biome.wall, seed: `${biome.wall.seed}-${i}`, size: TILE_SRC });
    ctx.drawImage(floor, i * TILE_SRC, 0);
    ctx.drawImage(wall, (biome.variants + i) * TILE_SRC, 0);
  }
  return canvas;
}
