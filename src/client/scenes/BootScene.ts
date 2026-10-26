import Phaser from "phaser";
import { content } from "../../data";
import { makeSprite } from "../art/sprites";

export const textureKey = {
  character: (id: string) => `character:${id}`,
  monster: (id: string) => `monster:${id}`,
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
    this.scene.start("Game");
  }
}
