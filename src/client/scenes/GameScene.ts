import Phaser from "phaser";
import { content } from "../../data";
import { createWorld, DT, step, type Actor, type PlayerInput, type SimEvent, type WorldState } from "../../sim/world";
import { textureKey } from "./BootScene";

const SPRITE_SCALE = 2.6; // sprite height relative to collision diameter
const MAX_STEPS_PER_FRAME = 5; // avoid a spiral of death after a long hitch
const RESTART_DELAY_MS = 600; // ignore the attack click that was held when you died

interface ActorView {
  sprite: Phaser.GameObjects.Image;
}

/** Renders the sim and feeds it input. Owns no game rules. */
export class GameScene extends Phaser.Scene {
  private world!: WorldState;
  private accumulator = 0;
  private views = new Map<number, ActorView>();
  private bars!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private killText!: Phaser.GameObjects.Text;
  private diedAt = 0;
  private keys!: Record<"W" | "A" | "S" | "D" | "UP" | "LEFT" | "DOWN" | "RIGHT" | "R", Phaser.Input.Keyboard.Key>;

  constructor() {
    super("Game");
  }

  create(): void {
    this.world = createWorld(content, (Math.random() * 2 ** 32) >>> 0);
    this.accumulator = 0;
    this.views.clear();

    this.drawRoom();
    this.bars = this.add.graphics().setDepth(10_000);
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(20_000);
    this.killText = this.add
      .text(16, 44, "", { fontFamily: "monospace", fontSize: "16px", color: "#c8c8d0" })
      .setScrollFactor(0)
      .setDepth(20_000);

    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,LEFT,DOWN,RIGHT,R") as typeof this.keys;
    this.input.mouse?.disableContextMenu();

    const { width, height } = this.world.room;
    const cam = this.cameras.main;
    cam.setBounds(-200, -200, width + 400, height + 400);
    this.syncViews();
    cam.startFollow(this.views.get(this.world.player.id)!.sprite, true, 0.15, 0.15);
  }

  override update(_time: number, deltaMs: number): void {
    if (this.world.status === "dead") {
      const pointer = this.input.activePointer;
      if (this.time.now - this.diedAt > RESTART_DELAY_MS && (this.keys.R.isDown || pointer.leftButtonDown())) {
        this.scene.restart();
      }
      return;
    }

    this.accumulator += Math.min(deltaMs / 1000, DT * MAX_STEPS_PER_FRAME);
    const input = this.readInput();
    while (this.accumulator >= DT) {
      this.accumulator -= DT;
      const events = step(this.world, content, input, DT);
      this.syncViews();
      for (const e of events) this.onEvent(e);
    }
    this.render();
  }

  private readInput(): PlayerInput {
    const k = this.keys;
    const x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    const pointer = this.input.activePointer;
    const aim = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    return { move: { x, y }, aim: { x: aim.x, y: aim.y }, attack: pointer.leftButtonDown() };
  }

  /** Create views for new actors. Removal happens through death events so they can animate out. */
  private syncViews(): void {
    const p = this.world.player;
    if (!this.views.has(p.id)) this.views.set(p.id, this.makeView(p, textureKey.character(p.defId)));
    for (const m of this.world.monsters) {
      if (!this.views.has(m.id)) {
        const view = this.makeView(m, textureKey.monster(m.defId));
        view.sprite.setAlpha(0);
        this.tweens.add({ targets: view.sprite, alpha: 1, duration: 250 });
        this.views.set(m.id, view);
      }
    }
  }

  private makeView(actor: Actor, key: string): ActorView {
    const sprite = this.add.image(actor.pos.x, actor.pos.y, key);
    const height = actor.radius * 2 * SPRITE_SCALE;
    sprite.setScale(height / sprite.height);
    return { sprite };
  }

  private onEvent(e: SimEvent): void {
    switch (e.type) {
      case "swing":
        this.showSwing(e.angle, e.arc, e.range);
        break;
      case "damage": {
        const isPlayer = e.targetId === this.world.player.id;
        const view = this.views.get(e.targetId);
        if (view) this.flash(view.sprite, isPlayer ? 0xff4040 : 0xffffff);
        if (isPlayer) this.cameras.main.shake(90, 0.004);
        this.floatText(e.pos.x, e.pos.y - 20, String(e.amount), isPlayer ? "#ff6060" : "#ffffff");
        break;
      }
      case "death": {
        const view = this.views.get(e.actorId);
        this.views.delete(e.actorId);
        if (view) {
          this.tweens.add({
            targets: view.sprite,
            alpha: 0,
            scaleY: view.sprite.scaleY * 0.2,
            duration: 220,
            onComplete: () => view.sprite.destroy(),
          });
        }
        break;
      }
      case "player_died":
        this.onPlayerDied();
        break;
      case "spawn":
        break;
    }
  }

  private render(): void {
    const actors: Actor[] = [this.world.player, ...this.world.monsters];
    this.bars.clear();
    for (const a of actors) {
      const view = this.views.get(a.id);
      if (!view) continue;
      view.sprite.setPosition(a.pos.x, a.pos.y).setDepth(a.pos.y).setFlipX(Math.cos(a.facing) < 0);
      if (a !== this.world.player) this.drawBar(this.bars, a.pos.x - 16, a.pos.y - a.radius * SPRITE_SCALE - 8, 32, 4, a.life / a.maxLife, 0xd04040);
    }

    const p = this.world.player;
    this.hud.clear();
    this.drawBar(this.hud, 16, 16, 240, 18, p.life / p.maxLife, 0xc0302a);
    this.killText.setText(`HP ${Math.ceil(p.life)}/${p.maxLife}   Kills ${this.world.kills}`);
  }

  private drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, frac: number, color: number): void {
    g.fillStyle(0x000000, 0.7).fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(0x3a1414, 1).fillRect(x, y, w, h);
    g.fillStyle(color, 1).fillRect(x, y, w * Phaser.Math.Clamp(frac, 0, 1), h);
  }

  private drawRoom(): void {
    const { width, height } = this.world.room;
    const g = this.add.graphics().setDepth(-1);
    const tile = 50;
    for (let y = 0; y < height; y += tile) {
      for (let x = 0; x < width; x += tile) {
        g.fillStyle(((x + y) / tile) % 2 === 0 ? 0x1a1a22 : 0x1e1e27, 1).fillRect(x, y, tile, tile);
      }
    }
    g.lineStyle(6, 0x3a3a48, 1).strokeRect(-3, -3, width + 6, height + 6);
  }

  private showSwing(angle: number, arc: number, range: number): void {
    const p = this.world.player.pos;
    const g = this.add.graphics().setDepth(p.y + 1);
    g.fillStyle(0xe8e2d0, 0.35);
    g.slice(p.x, p.y, range, angle - arc / 2, angle + arc / 2, false).fillPath();
    g.lineStyle(2, 0xffffff, 0.8);
    g.beginPath().arc(p.x, p.y, range, angle - arc / 2, angle + arc / 2, false).strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 140, onComplete: () => g.destroy() });
  }

  private flash(sprite: Phaser.GameObjects.Image, color: number): void {
    sprite.setTintFill(color);
    this.time.delayedCall(70, () => sprite.active && sprite.clearTint());
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(x, y, text, { fontFamily: "monospace", fontSize: "14px", color, stroke: "#000", strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(15_000);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  private onPlayerDied(): void {
    this.diedAt = this.time.now;
    const view = this.views.get(this.world.player.id);
    if (view) this.tweens.add({ targets: view.sprite, angle: 90, alpha: 0.5, duration: 400 });
    this.render();

    const { width, height } = this.scale;
    const shade = this.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0);
    const title = this.add
      .text(width / 2, height / 2 - 20, "YOU DIED", { fontFamily: "monospace", fontSize: "48px", color: "#c0302a" })
      .setOrigin(0.5);
    const sub = this.add
      .text(width / 2, height / 2 + 30, `Kills: ${this.world.kills}   —   press R or click to restart`, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#c8c8d0",
      })
      .setOrigin(0.5);
    this.add.container(0, 0, [shade, title, sub]).setScrollFactor(0).setDepth(30_000);
  }
}
