import Phaser from "phaser";
import { content } from "../../data";
import { createWorld, DT, step, TICK_RATE, type Actor, type PlayerInput, type SimEvent, type WorldState } from "../../sim/world";
import type { Vec } from "../../sim/core/vec";
import { isFloor, type Zone } from "../../sim/zone/zone";
import { InputManager } from "../input/InputManager";
import { textureKey, TILE_SRC } from "./BootScene";

const SPRITE_SCALE = 2.6; // sprite height relative to collision diameter
const MAX_STEPS_PER_FRAME = 5; // avoid a spiral of death after a long hitch
const OVERLAY_DELAY_MS = 600; // ignore the attack that was held when the overlay appeared
const MINIMAP_MAX = 180; // px, longest side

interface ActorView {
  sprite: Phaser.GameObjects.Image;
}

interface SceneData {
  seed?: number;
}

/** Renders the sim and feeds it input. Owns no game rules. */
export class GameScene extends Phaser.Scene {
  world!: WorldState;
  private accumulator = 0;
  private views = new Map<number, ActorView>();
  private bars!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private minimap!: { image: Phaser.GameObjects.Image; dots: Phaser.GameObjects.Graphics; scale: number };
  private overlayAt = 0;
  private overlayHint?: { text: Phaser.GameObjects.Text; make: () => string };
  private inputs!: InputManager;
  private aimMarker!: Phaser.GameObjects.Graphics;
  private lastAim: Vec = { x: 0, y: 0 };
  private knownPad: string | null = null;

  constructor() {
    super("Game");
  }

  create(data: SceneData): void {
    // ?seed=123 in the URL pins the first zone, handy for reproducing layouts.
    const urlSeed = Number(new URLSearchParams(location.search).get("seed"));
    const seed = data.seed ?? (Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed : (Math.random() * 2 ** 32) >>> 0);
    this.world = createWorld(content, seed);
    this.accumulator = 0;
    this.views.clear();

    const zone = this.world.zone;
    const biome = content.biomes.find((b) => b.id === zone.biome)!;
    this.cameras.main.setBackgroundColor(biome.void);
    this.drawZone(zone);
    this.drawExit(zone);

    this.bars = this.add.graphics().setDepth(10_000);
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(20_000);
    this.hudText = this.add
      .text(16, 44, "", { fontFamily: "monospace", fontSize: "15px", color: "#c8c8d0", lineSpacing: 4 })
      .setScrollFactor(0)
      .setDepth(20_000);
    this.minimap = this.makeMinimap(zone);

    this.overlayHint = undefined;
    this.aimMarker = this.add.graphics().setDepth(9_000);
    this.inputs = new InputManager(this);
    this.inputs.onChange = () => this.onInputChange();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, zone.width * zone.tileSize, zone.height * zone.tileSize);
    this.syncViews();
    cam.startFollow(this.views.get(this.world.player.id)!.sprite, true, 0.15, 0.15);
    this.scale.on("resize", this.layoutMinimap, this);
    // Dev-only handle for debugging and automated play-testing.
    if (import.meta.env.DEV) (window as unknown as { __game?: GameScene }).__game = this;
    this.events.once("shutdown", () => this.scale.off("resize", this.layoutMinimap, this));
  }

  override update(_time: number, deltaMs: number): void {
    this.inputs.update(this.time.now);
    if (this.world.status !== "playing") {
      const ready = this.time.now - this.overlayAt > OVERLAY_DELAY_MS;
      const pressed = this.inputs.pressed("confirm") || this.input.activePointer.leftButtonDown();
      if (ready && pressed) {
        // Died: retry the same zone. Cleared: roll a new one.
        const seed = this.world.status === "dead" ? this.world.zone.seed : (Math.random() * 2 ** 32) >>> 0;
        this.scene.restart({ seed } satisfies SceneData);
      }
      return;
    }

    this.accumulator += Math.min(deltaMs / 1000, DT * MAX_STEPS_PER_FRAME);
    const input = this.readInput();
    while (this.accumulator >= DT) {
      this.accumulator -= DT;
      const events = step(this.world, content, input, DT);
      for (const e of events) this.onEvent(e);
      if (this.world.status !== "playing") break;
    }
    this.render();
  }

  private readInput(): PlayerInput {
    const w = this.world;
    const pointer = this.input.activePointer;
    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const input = this.inputs.gameplay(
      { player: w.player.pos, facing: w.player.facing, enemies: w.monsters.filter((m) => m.awake).map((m) => m.pos) },
      { x: world.x, y: world.y },
      pointer.leftButtonDown(),
    );
    this.lastAim = input.aim;
    return input;
  }

  private onInputChange(): void {
    const pad = this.inputs.padId;
    if (pad !== this.knownPad) {
      this.toast(pad ? `Controller connected: ${shortPadName(pad)}` : "Controller disconnected");
      this.knownPad = pad;
    }
    if (this.overlayHint) this.overlayHint.text.setText(this.overlayHint.make());
  }

  private toast(message: string): void {
    const t = this.add
      .text(this.scale.width / 2, 24, message, { fontFamily: "monospace", fontSize: "14px", color: "#e8e2d0", backgroundColor: "#000000aa", padding: { x: 8, y: 4 } })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(40_000);
    this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 500, onComplete: () => t.destroy() });
  }

  /** Create views for actors. Removal happens through death events so they can animate out. */
  private syncViews(): void {
    const p = this.world.player;
    if (!this.views.has(p.id)) this.views.set(p.id, this.makeView(p, textureKey.character(p.defId)));
    for (const m of this.world.monsters) {
      if (!this.views.has(m.id)) this.views.set(m.id, this.makeView(m, textureKey.monster(m.defId)));
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
        if (isPlayer) {
          this.cameras.main.shake(90, 0.004);
          this.inputs.rumble(0.45, 0.25, 110);
        }
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
      case "zone_complete":
        this.onZoneComplete();
        break;
      case "wake":
        break;
    }
  }

  private render(): void {
    const w = this.world;
    const actors: Actor[] = [w.player, ...w.monsters];
    this.bars.clear();
    for (const a of actors) {
      const view = this.views.get(a.id);
      if (!view) continue;
      view.sprite.setPosition(a.pos.x, a.pos.y).setDepth(a.pos.y).setFlipX(Math.cos(a.facing) < 0);
      if (a !== w.player && a.life < a.maxLife) {
        this.drawBar(this.bars, a.pos.x - 16, a.pos.y - a.radius * SPRITE_SCALE - 8, 32, 4, a.life / a.maxLife, 0xd04040);
      }
    }

    const p = w.player;
    const biome = content.biomes.find((b) => b.id === w.zone.biome)!;
    this.hud.clear();
    this.drawBar(this.hud, 16, 16, 240, 18, p.life / p.maxLife, 0xc0302a);
    this.hudText.setText([
      `HP ${Math.ceil(p.life)}/${p.maxLife}`,
      `${biome.name}`,
      `Kills ${w.kills}/${w.totalMonsters}   ${formatTime(w.tick / TICK_RATE)}`,
    ]);
    this.drawMinimapDots();
    this.drawAimMarker();
  }

  /** Controller users can't see a cursor, so show which way the next swing goes. */
  private drawAimMarker(): void {
    const g = this.aimMarker.clear();
    if (this.inputs.device !== "pad") return;
    const p = this.world.player;
    const a = Math.atan2(this.lastAim.y - p.pos.y, this.lastAim.x - p.pos.x);
    const r = p.radius + 26;
    const tip = { x: p.pos.x + Math.cos(a) * (r + 10), y: p.pos.y + Math.sin(a) * (r + 10) };
    const l = { x: p.pos.x + Math.cos(a - 0.35) * r, y: p.pos.y + Math.sin(a - 0.35) * r };
    const rr = { x: p.pos.x + Math.cos(a + 0.35) * r, y: p.pos.y + Math.sin(a + 0.35) * r };
    g.fillStyle(0xe8e2d0, 0.75).fillTriangle(tip.x, tip.y, l.x, l.y, rr.x, rr.y);
  }

  private drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, frac: number, color: number): void {
    g.fillStyle(0x000000, 0.7).fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(0x3a1414, 1).fillRect(x, y, w, h);
    g.fillStyle(color, 1).fillRect(x, y, w * Phaser.Math.Clamp(frac, 0, 1), h);
  }

  /** Tilemap from the zone grid: floor tiles, wall tiles on solid cells that touch floor, void elsewhere. */
  private drawZone(zone: Zone): void {
    const biome = content.biomes.find((b) => b.id === zone.biome)!;
    const variants = biome.variants;
    const data: number[][] = [];
    for (let y = 0; y < zone.height; y++) {
      const row: number[] = [];
      for (let x = 0; x < zone.width; x++) {
        // Floor uses one seamless tile: mixed floor variants read as obstacles.
        if (isFloor(zone, x, y)) row.push(0);
        else if (touchesFloor(zone, x, y)) row.push(variants + variant(x, y, variants));
        else row.push(-1);
      }
      data.push(row);
    }
    const map = this.make.tilemap({ data, tileWidth: TILE_SRC, tileHeight: TILE_SRC });
    const tileset = map.addTilesetImage(textureKey.tileset(biome.id), textureKey.tileset(biome.id), TILE_SRC, TILE_SRC, 0, 0)!;
    map.createLayer(0, tileset, 0, 0)!.setScale(zone.tileSize / TILE_SRC).setDepth(-10);
  }

  private drawExit(zone: Zone): void {
    const { x, y } = zone.exit;
    const r = zone.tileSize * 0.8;
    const g = this.add.graphics().setDepth(-5);
    g.fillStyle(0x6fd3ff, 0.18).fillCircle(x, y, r * 1.6);
    g.fillStyle(0x6fd3ff, 0.35).fillCircle(x, y, r);
    g.lineStyle(3, 0xbfefff, 0.9).strokeCircle(x, y, r);
    this.tweens.add({ targets: g, alpha: 0.55, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.add
      .text(x, y - r - 14, "EXIT", { fontFamily: "monospace", fontSize: "14px", color: "#bfefff", stroke: "#000", strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(-4);
  }

  private makeMinimap(zone: Zone) {
    const canvas = document.createElement("canvas");
    canvas.width = zone.width;
    canvas.height = zone.height;
    const ctx = canvas.getContext("2d")!;
    for (let y = 0; y < zone.height; y++) {
      for (let x = 0; x < zone.width; x++) {
        if (isFloor(zone, x, y)) ctx.fillStyle = "rgba(170,170,190,0.55)";
        else if (touchesFloor(zone, x, y)) ctx.fillStyle = "rgba(60,60,75,0.8)";
        else continue;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const key = `minimap:${zone.seed}`;
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.addCanvas(key, canvas);
    const scale = MINIMAP_MAX / Math.max(zone.width, zone.height);
    const image = this.add.image(0, 0, key).setOrigin(0).setScale(scale).setScrollFactor(0).setDepth(20_000);
    const dots = this.add.graphics().setScrollFactor(0).setDepth(20_001);
    image.setPosition(this.scale.width - image.displayWidth - 16, 16);
    return { image, dots, scale };
  }

  private layoutMinimap(): void {
    const m = this.minimap;
    if (!m) return;
    m.image.setPosition(this.scale.width - m.image.displayWidth - 16, 16);
  }

  private drawMinimapDots(): void {
    const { image, dots, scale } = this.minimap;
    const z = this.world.zone;
    const k = scale / z.tileSize;
    const ox = image.x;
    const oy = image.y;
    dots.clear();
    dots.fillStyle(0x6fd3ff, 1).fillCircle(ox + z.exit.x * k, oy + z.exit.y * k, 3);
    for (const m of this.world.monsters) {
      dots.fillStyle(m.awake ? 0xff5040 : 0x903028, 1).fillRect(ox + m.pos.x * k - 1, oy + m.pos.y * k - 1, 2, 2);
    }
    const p = this.world.player.pos;
    dots.fillStyle(0xffffff, 1).fillCircle(ox + p.x * k, oy + p.y * k, 2.5);
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
    const view = this.views.get(this.world.player.id);
    if (view) this.tweens.add({ targets: view.sprite, angle: 90, alpha: 0.5, duration: 400 });
    this.inputs.rumble(1, 0.8, 400);
    this.showOverlay("YOU DIED", "#c0302a", () => `press ${this.inputs.prompt("confirm")} to retry this zone`);
  }

  private onZoneComplete(): void {
    this.showOverlay("ZONE CLEARED", "#6fd3ff", () => `press ${this.inputs.prompt("confirm")} for the next zone`);
  }

  private showOverlay(title: string, color: string, hint: () => string): void {
    this.render();
    this.overlayAt = this.time.now;
    const w = this.world;
    const { width, height } = this.scale;
    const shade = this.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0);
    const head = this.add
      .text(width / 2, height / 2 - 30, title, { fontFamily: "monospace", fontSize: "48px", color })
      .setOrigin(0.5);
    const stats = this.add
      .text(width / 2, height / 2 + 22, `Kills ${w.kills}/${w.totalMonsters}   Time ${formatTime(w.tick / TICK_RATE)}`, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#c8c8d0",
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(width / 2, height / 2 + 48, hint(), { fontFamily: "monospace", fontSize: "14px", color: "#8a8a96" })
      .setOrigin(0.5);
    this.overlayHint = { text: sub, make: hint };
    this.add.container(0, 0, [shade, head, stats, sub]).setScrollFactor(0).setDepth(30_000);
  }
}

/** "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)" -> "DualSense Wireless Controller" */
function shortPadName(id: string): string {
  return id.replace(/\s*\(.*\)\s*$/, "").trim() || "Gamepad";
}

function touchesFloor(zone: Zone, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isFloor(zone, x + dx, y + dy)) return true;
  return false;
}

/** Stable per-tile variant pick, biased toward variant 0 so walls don't look noisy. */
function variant(x: number, y: number, variants: number): number {
  const h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  return h % 4 === 0 ? (h >>> 2) % variants : 0;
}

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
