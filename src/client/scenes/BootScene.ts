import Phaser from "phaser";
import { content } from "../../data";
import { loadSpriteSource } from "../art/sprites";

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
    const label = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "Loading…", { color: "#888", fontFamily: "monospace" })
      .setOrigin(0.5);

    void loadSpriteSource().then((source) => {
      console.info(`Sprites: ${source.name}`);
      for (const c of content.characters) {
        if (c.sprite) this.textures.addCanvas(textureKey.character(c.id), source.make(c.sprite));
      }
      for (const m of content.monsters) {
        if (m.sprite) this.textures.addCanvas(textureKey.monster(m.id), source.make(m.sprite));
      }
      label.destroy();
      this.scene.start("Game");
    });
  }
}
