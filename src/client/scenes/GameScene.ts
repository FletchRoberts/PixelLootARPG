import Phaser from "phaser";
import { content } from "../../data";
import {
  createWorld,
  currentSave,
  DT,
  inventoryCommand,
  nearestPickup,
  nearestStation,
  rejoinMap,
  previewInventoryCommand,
  saveAfterClear,
  saveAfterDeath,
  SKILL_SLOTS,
  step,
  TICK_RATE,
  type Actor,
  type Ailments,
  type MonsterState,
  type PlayerInput,
  type SimEvent,
  type WorldState,
} from "../../sim/world";
import { xpToNext } from "../../sim/stats/character";
import { freeMap, rewardLine } from "../../sim/items/cairnstone";
import { newCharacter } from "../../sim/items/save";
import type { CairnstoneItem, CharacterSave } from "../../sim/items/types";
import { itemColor, itemName, itemTextureKey } from "../ui/items";
import { clearSave, loadSave, writeSave } from "../save/storage";
import type { Vec } from "../../sim/core/vec";
import { hasLineOfSight, isFloor, type Zone } from "../../sim/zone/zone";
import { InputManager } from "../input/InputManager";
import { GameMenu } from "../ui/GameMenu";
import { MapDevice } from "../ui/MapDevice";
import { Stash } from "../ui/Stash";
import { hideoutRun } from "../../sim/zone/hideout";
import { textureKey, TILE_SRC } from "./BootScene";

const SPRITE_SCALE = 2.6; // sprite height relative to collision diameter
const MAX_STEPS_PER_FRAME = 5; // avoid a spiral of death after a long hitch
const OVERLAY_DELAY_MS = 600; // ignore the attack that was held when the overlay appeared
const MINIMAP_MAX = 180; // px, longest side
const AUTOSAVE_MS = 5000;

interface ActorView {
  sprite: Phaser.GameObjects.Image;
  flashUntil: number; // scene time; status tints wait until a hit flash is over
  label?: Phaser.GameObjects.Text; // magic / rare / Legendary monsters: name and mods
  scale: number; // sprite size relative to a normal monster of its kind
}

/** Monster rarity colours (rings, labels, health bars), matching item rarity colours. */
const MONSTER_RARITY_COLOR = { normal: 0xd04040, magic: 0x8a8aff, rare: 0xffff77, unique: 0xe08a3a } as const;

interface SceneData {
  seed?: number; // seed for the next free map (a map in progress keeps its own)
  save?: CharacterSave; // the character entering this zone (else the browser save, else a new one)
  message?: string; // toast on arrival (e.g. what the last map rewarded)
  suspended?: WorldState; // went home through a portal: the open map, waiting
  resume?: WorldState; // came back through the portal: continue this map
}

interface ItemView {
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

const randomSeed = () => (Math.random() * 2 ** 32) >>> 0;

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
  private itemViews = new Map<number, ItemView>();
  private deathSave: CharacterSave | null = null;
  private lastAutosave = 0;
  private menu!: GameMenu;
  private device!: MapDevice;
  private stash!: Stash;
  private freeSeed = 0; // the free map the Map Device previews and opens
  private suspended: WorldState | null = null; // the open map while you're home through a portal
  private abandonArmed = false; // Map Device: second press abandons the open map
  private arrivedAt = 0; // scene start: presses right after arriving belong to the previous screen
  private portalView: { g: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text } | null = null;
  private stationLabels = new Map<string, Phaser.GameObjects.Text>();
  private clearMessage = "";
  private shots!: Phaser.GameObjects.Graphics;
  private under!: Phaser.GameObjects.Graphics; // drawn below actors: rarity rings
  private exitLabel?: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;
  private skillBar!: { g: Phaser.GameObjects.Graphics; labels: Phaser.GameObjects.Text[] };
  private lastNoManaToast = 0;

  constructor() {
    super("Game");
  }

  create(data: SceneData): void {
    // ?seed=123 in the URL pins the first free map, handy for reproducing layouts.
    const urlSeed = Number(new URLSearchParams(location.search).get("seed"));
    const seed = data.seed ?? (Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed : (Math.random() * 2 ** 32) >>> 0);
    const save = data.save ?? loadSave() ?? newCharacter(content, randomSeed());
    // A map in progress (e.g. retrying after a death) resumes; otherwise you're in the hideout.
    this.freeSeed = seed;
    this.suspended = data.suspended ?? null;
    if (data.resume) this.world = data.resume;
    else if (this.suspended) this.world = createWorld(content, seed, save, hideoutRun(content.hideout, true));
    else this.world = createWorld(content, seed, save, save.currentMap ?? hideoutRun(content.hideout));
    this.abandonArmed = false;
    this.arrivedAt = this.time.now;
    this.itemViews.clear();
    this.deathSave = null;
    this.persist();
    this.accumulator = 0;
    this.views.clear();
    this.portalView = null; // the old scene's objects are gone after a restart
    this.exitLabel = undefined;

    const zone = this.world.zone;
    const biome = content.biomes.find((b) => b.id === zone.biome)!;
    this.cameras.main.setBackgroundColor(biome.void);
    this.drawZone(zone);
    if (this.world.map.hideout) this.drawStations(zone);
    else this.drawExit(zone);

    this.bars = this.add.graphics().setDepth(10_000);
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(20_000);
    this.hudText = this.add
      .text(16, 44, "", { fontFamily: "monospace", fontSize: "15px", color: "#c8c8d0", lineSpacing: 4 })
      .setScrollFactor(0)
      .setDepth(20_000);
    this.minimap = this.makeMinimap(zone);
    this.shots = this.add.graphics().setDepth(12_000);
    this.under = this.add.graphics().setDepth(-2);
    this.bossText = this.add
      .text(0, 0, "", { fontFamily: "monospace", fontSize: "14px", color: "#ffff77", stroke: "#000", strokeThickness: 3 })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(20_001)
      .setVisible(false);
    this.skillBar = {
      g: this.add.graphics().setScrollFactor(0).setDepth(20_000),
      labels: Array.from({ length: SKILL_SLOTS }, () =>
        this.add.text(0, 0, "", { fontFamily: "monospace", fontSize: "12px", color: "#d8d8e0", align: "center" }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20_001),
      ),
    };

    this.overlayHint = undefined;
    this.aimMarker = this.add.graphics().setDepth(9_000);
    this.inputs = new InputManager(this);
    this.inputs.onChange = () => this.onInputChange();
    this.menu = new GameMenu(this, this.inputs, () => this.world, {
      command: (cmd) => {
        const refused = inventoryCommand(this.world, content, cmd);
        if (!refused) this.persist();
        return refused;
      },
      preview: (cmd) => previewInventoryCommand(this.world, content, cmd),
      resetCharacter: () => {
        clearSave();
        const seed = randomSeed();
        this.scene.restart({ seed, save: newCharacter(content, seed) } satisfies SceneData);
      },
    });

    this.device = new MapDevice(this, this.inputs, () => this.world, {
      command: (cmd) => {
        const refused = inventoryCommand(this.world, content, cmd);
        if (!refused) this.persist();
        return refused;
      },
      open: (stoneIndex) => this.openMap(stoneIndex),
      openMenu: () => this.menu.show("stones"),
      freeMap: () => freeMap(content, this.world.player.save, this.freeSeed),
    });
    this.stash = new Stash(this, this.inputs, () => this.world, (cmd) => {
      const refused = inventoryCommand(this.world, content, cmd);
      if (!refused) this.persist();
      return refused;
    });
    if (data.message) this.toast(data.message);

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
      const dead = this.world.status === "dead";
      if (ready && dead && this.inputs.pressed("cancel")) {
        // Give up on this map and go back to the hideout (the stone was already used).
        const save = { ...(this.deathSave ?? saveAfterDeath(this.world, content)) };
        delete save.currentMap;
        writeSave(save);
        this.scene.restart({ seed: randomSeed(), save, message: "Back in the hideout. The map is gone." } satisfies SceneData);
        return;
      }
      if (ready && pressed) {
        // Died: the save keeps the map in progress, so it's retried. Cleared: back to the hideout.
        const next: SceneData =
          this.world.status === "dead"
            ? { seed: this.world.zone.seed, save: this.deathSave ?? saveAfterDeath(this.world, content) }
            : { seed: randomSeed(), save: saveAfterClear(this.world), message: this.clearMessage };
        if (next.save) writeSave(next.save);
        this.scene.restart(next);
      }
      return;
    }

    // The menu pauses the game while open.
    if (this.menu.open) {
      this.menu.update();
      this.render();
      return;
    }
    // Hideout windows pause the game too.
    if (this.device.open) {
      this.device.update();
      if (this.device.open) this.render();
      return;
    }
    if (this.stash.open) {
      this.stash.update();
      this.render();
      return;
    }
    if (this.inputs.pressed("character")) return this.menu.show("character");
    if (this.inputs.pressed("inventory")) return this.menu.show("gear");

    this.accumulator += Math.min(deltaMs / 1000, DT * MAX_STEPS_PER_FRAME);
    const input = this.readInput();
    while (this.accumulator >= DT) {
      this.accumulator -= DT;
      const events = step(this.world, content, input, DT);
      // One-shot actions go to the first tick only.
      input.dodge = false;
      input.portal = false;
      input.pickup = false;
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
      {
        player: w.player.pos,
        facing: w.player.facing,
        // Aim assist considers any living enemy you can see (sleeping ones too), never through walls.
        enemies: w.monsters.filter((m) => m.life > 0 && hasLineOfSight(w.zone, w.player.pos, m.pos)).map((m) => m.pos),
      },
      { x: world.x, y: world.y },
      { left: pointer.leftButtonDown(), right: pointer.rightButtonDown() },
    );
    this.lastAim = input.aim;
    if (this.time.now - this.arrivedAt < OVERLAY_DELAY_MS) {
      input.pickup = false;
      input.portal = false;
    }
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
      if (this.views.has(m.id)) continue;
      const scale = content.monsterRarity.rarities[m.rarity].scale;
      const view = this.makeView(m, textureKey.monster(m.defId), scale);
      if (m.rarity !== "normal") {
        const mods = m.mods.map((id) => content.monsterMods.find((d) => d.id === id)?.name ?? id).join(", ");
        const color = `#${MONSTER_RARITY_COLOR[m.rarity].toString(16).padStart(6, "0")}`;
        const title = m.name ? `${m.name}${m.rarity === "unique" ? " (Legendary)" : ""}` : "";
        view.label = this.add
          .text(m.pos.x, m.pos.y, [title, mods].filter(Boolean).join("\n"), { fontFamily: "monospace", fontSize: m.name ? "12px" : "10px", color, align: "center", stroke: "#000", strokeThickness: 3 })
          .setOrigin(0.5, 1)
          .setDepth(10_001)
          .setVisible(!!m.name);
      }
      this.views.set(m.id, view);
    }
  }

  private makeView(actor: Actor, key: string, scale = 1): ActorView {
    const sprite = this.add.image(actor.pos.x, actor.pos.y, key);
    const height = actor.radius * 2 * SPRITE_SCALE * scale;
    sprite.setScale(height / sprite.height);
    return { sprite, flashUntil: 0, scale };
  }

  private onEvent(e: SimEvent): void {
    switch (e.type) {
      case "area":
        this.showArea(e.pos, e.radius, e.angle, e.arc, SHOT_COLORS[e.element]);
        break;
      case "swing":
        this.showSwing(e.angle, e.arc, e.range);
        break;
      case "damage": {
        const isPlayer = e.targetId === this.world.player.id;
        const view = this.views.get(e.targetId);
        if (view) this.flash(view, isPlayer ? 0xff4040 : 0xffffff);
        if (isPlayer) {
          this.cameras.main.shake(90, 0.004);
          this.inputs.rumble(0.45, 0.25, 110);
        }
        const shown = String(Math.max(1, Math.round(e.amount)));
        if (e.crit) this.floatText(e.pos.x, e.pos.y - 24, `${shown}!`, isPlayer ? "#ff3030" : "#ffd84a", 20);
        else this.floatText(e.pos.x, e.pos.y - 20, shown, isPlayer ? "#ff6060" : "#ffffff");
        break;
      }
      case "evade":
        this.floatText(e.pos.x, e.pos.y - 20, "evade", "#9aa0b0", 12);
        break;
      case "level_up":
        this.onLevelUp(e.level);
        break;
      case "pickup":
        this.toast(`+ ${itemName(e.item)}`);
        this.persist();
        break;
      case "bag_full":
        this.toast(
          e.bag === "gear"
            ? "Gear bag is full: salvage some (menu, □ / X)"
            : e.bag === "stones"
              ? "Cairnstone bag is full: salvage some at the Map Device"
              : "Gem bag is full: salvage spares in the Currency tab",
        );
        break;
      case "drop":
      case "xp":
      case "cast":
        break;
      case "no_mana":
        if (this.time.now - this.lastNoManaToast > 1500) {
          this.lastNoManaToast = this.time.now;
          this.toast("Not enough mana");
        }
        break;
      case "dodge": {
        const p = this.world.player;
        const puff = this.add.circle(p.pos.x, p.pos.y + p.radius, p.radius, 0xc8c0a8, 0.45).setDepth(p.pos.y - 1);
        this.tweens.add({ targets: puff, scale: 2, alpha: 0, duration: 300, onComplete: () => puff.destroy() });
        break;
      }
      case "death": {
        const view = this.views.get(e.actorId);
        this.views.delete(e.actorId);
        view?.label?.destroy();
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
      case "boss_defeated":
        this.toast(`${e.name} is defeated! The exit is open.`);
        this.inputs.rumble(0.8, 0.6, 350);
        this.cameras.main.shake(250, 0.008);
        break;
      case "boss_enraged":
        this.toast(`${e.name} is enraged!`);
        this.cameras.main.shake(200, 0.006);
        break;
      case "monster_cast":
        break;
      case "portal_opened":
        this.toast(`Portal opened: walk to it and press ${this.inputs.prompt("pickup")} to go home`);
        break;
      case "interact":
        if (e.station === "portal") this.takePortal();
        else if (e.station === "map_device") this.device.show();
        else if (e.station === "stash") this.stash.show();
        else this.menu.show("currency");
        break;
      case "zone_complete":
        this.onZoneComplete(e.reward);
        break;
      case "wake":
        break;
    }
  }

  private render(): void {
    const w = this.world;
    const actors: Actor[] = [w.player, ...w.monsters];
    this.bars.clear();
    const under = this.under.clear();
    for (const a of actors) {
      const view = this.views.get(a.id);
      if (!view) continue;
      view.sprite.setPosition(a.pos.x, a.pos.y).setDepth(a.pos.y).setFlipX(Math.cos(a.facing) < 0);
      if (a === w.player) continue;
      const m = a as MonsterState;
      this.drawAilments(m);
      const top = a.pos.y - a.radius * SPRITE_SCALE * view.scale - 8;
      const color = MONSTER_RARITY_COLOR[m.rarity];
      if (m.rarity !== "normal") {
        // A coloured ring underfoot marks magic / rare / Legendary monsters.
        const feet = a.pos.y + a.radius * SPRITE_SCALE * view.scale * 0.8;
        const rw = a.radius * 3 * view.scale;
        under.fillStyle(color, m.rarity === "magic" ? 0.18 : 0.3).fillEllipse(a.pos.x, feet, rw, rw * 0.4);
        under.lineStyle(m.rarity === "magic" ? 2 : 3, color, 0.95).strokeEllipse(a.pos.x, feet, rw, rw * 0.4);
        // Leaders always show their name and mods; magic monsters once they're hurt (keeps packs readable).
        view.label?.setPosition(a.pos.x, top - 6).setVisible(!!m.name || a.life < a.maxLife);
      }
      if (a.life < a.maxLife || m.name) {
        const wBar = m.name ? 48 : 32;
        this.drawBar(this.bars, a.pos.x - wBar / 2, top, wBar, m.name ? 5 : 4, a.life / a.maxLife, color);
      }
    }

    const p = w.player;
    const biome = content.biomes.find((b) => b.id === w.zone.biome)!;
    const need = xpToNext(p.level, content.progression);
    this.hud.clear();
    this.drawBar(this.hud, 16, 16, 240, 18, p.life / p.maxLife, 0xc0302a);
    this.drawBar(this.hud, 16, 38, 240, 10, p.mana / Math.max(1, p.maxMana), 0x3a6fd8, 0x141a3a);
    // XP bar along the bottom edge.
    const { width, height } = this.scale;
    this.drawBar(this.hud, 16, height - 14, width - 32, 6, Number.isFinite(need) ? p.xp / need : 1, 0xd8b04a, 0x2a2414);
    const hideout = [
      `HP ${Math.ceil(p.life)}/${Math.round(p.maxLife)}   MP ${Math.floor(p.mana)}/${Math.round(p.maxMana)}`,
      `Level ${p.level}   Hideout (safe)   best map level ${p.save.bestMapLevel}   Cairnstones ${p.save.stoneBag.length}`,
      `Walk to a station and press ${this.inputs.prompt("pickup")}: Map Device (run maps), Stash (storage), Crafting Bench`,
      `Menu [${this.inputs.prompt("character")}]   Gear [${this.inputs.prompt("inventory")}]`,
    ];
    this.hudText.setPosition(16, 54).setText(w.map.hideout ? hideout : [
      `HP ${Math.ceil(p.life)}/${Math.round(p.maxLife)}   MP ${Math.floor(p.mana)}/${Math.round(p.maxMana)}`,
      `Level ${p.level}   ${w.map.name}: monster lvl ${w.monsterLevel} (${biome.name}, ${content.zoneGen.layouts.find((l) => l.id === w.zone.layout)?.name ?? w.zone.layout})`,
      `${w.map.mods.length} map mod${w.map.mods.length === 1 ? "" : "s"}: ${rewardLine(content, w.map.mods)}${w.map.deaths ? `   deaths ${w.map.deaths}` : ""}`,
      `Kills ${w.kills}/${w.totalMonsters}   ${formatTime(w.tick / TICK_RATE)}`,
      `Attack [${this.inputs.device === "pad" ? "R2" : "LMB"}]   Dodge [${this.inputs.prompt("dodge")}]   Portal [${this.inputs.device === "pad" ? "D-pad ↑" : "T"}]   Menu [${this.inputs.prompt("character")}]   Gear [${this.inputs.prompt("inventory")}]`,
    ]);
    const player = this.views.get(p.id)?.sprite;
    if (player && w.status === "playing") player.setAlpha(p.roll ? 0.55 : 1);
    this.drawProjectiles();
    this.syncItems();
    this.syncStations();
    this.syncPortal();
    if (this.time.now - this.lastAutosave > AUTOSAVE_MS) this.persist();
    this.drawSkillBar();
    this.drawBossBar();
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

  /** Save the character as it is right now (zone progress isn't saved mid-zone, the character is). */
  private persist(): void {
    this.lastAutosave = this.time.now;
    if (this.world.status === "playing") writeSave(currentSave(this.world));
  }

  /** Ground items: icon + teal name; the one ✕ would pick up gets highlighted with the prompt. */
  private syncItems(): void {
    const w = this.world;
    const live = new Set(w.groundItems.map((g) => g.id));
    for (const [id, v] of this.itemViews) {
      if (live.has(id)) continue;
      v.icon.destroy();
      v.label.destroy();
      this.itemViews.delete(id);
    }
    const target = w.status === "playing" ? nearestPickup(w, content) : null;
    for (const g of w.groundItems) {
      let v = this.itemViews.get(g.id);
      if (!v) {
        const icon = this.add.image(g.pos.x, g.pos.y, itemTextureKey(g.item)).setDisplaySize(26, 26).setDepth(g.pos.y - 1);
        const label = this.add
          .text(g.pos.x, g.pos.y - 22, itemName(g.item), { fontFamily: "monospace", fontSize: "12px", color: itemColor(g.item), backgroundColor: "#000000aa", padding: { x: 4, y: 1 } })
          .setOrigin(0.5, 1)
          .setDepth(11_000);
        this.tweens.add({ targets: icon, y: g.pos.y - 10, duration: 160, yoyo: true, ease: "Quad.easeOut" });
        v = { icon, label };
        this.itemViews.set(g.id, v);
      }
      if (!this.tweens.isTweening(v.icon)) v.icon.setPosition(g.pos.x, g.pos.y);
      v.label.setPosition(g.pos.x, g.pos.y - 22);
      const hot = target?.id === g.id;
      v.label.setText(hot ? `[${this.inputs.prompt("pickup")}] ${itemName(g.item)}` : itemName(g.item)).setColor(hot ? "#ffffff" : itemColor(g.item));
      v.label.setBackgroundColor(hot ? "#1c5a54ee" : "#000000aa");
    }
  }

  private drawProjectiles(): void {
    const g = this.shots.clear();
    for (const pr of this.world.projectiles) {
      const node = this.world.player.compiled[pr.skill]?.nodes[pr.node];
      if (!node) continue;
      const type = (Object.keys(node.base)[0] ?? "physical") as keyof typeof SHOT_COLORS;
      const color = SHOT_COLORS[type] ?? 0xffffff;
      const r = Math.max(3, node.radius);
      g.fillStyle(color, 0.25).fillCircle(pr.pos.x, pr.pos.y, r * 1.9);
      g.fillStyle(color, 1).fillCircle(pr.pos.x, pr.pos.y, r);
      g.fillStyle(0xffffff, 0.8).fillCircle(pr.pos.x - pr.dir.x * r * 0.3, pr.pos.y - pr.dir.y * r * 0.3, r * 0.4);
    }
    // Enemy shots: dark core with an element rim, so they read differently from yours.
    for (const s of this.world.enemyShots) {
      const color = SHOT_COLORS[s.element] ?? 0xffffff;
      g.fillStyle(color, 0.3).fillCircle(s.pos.x, s.pos.y, s.radius * 2);
      g.fillStyle(0x1a0a0a, 1).fillCircle(s.pos.x, s.pos.y, s.radius);
      g.lineStyle(2, color, 1).strokeCircle(s.pos.x, s.pos.y, s.radius);
    }
    // Slams and novas: a red warning circle that fills in until it lands.
    for (const t of this.world.telegraphs) {
      const k = Math.min(1, t.t / t.total);
      g.fillStyle(0xff3a2a, 0.12).fillCircle(t.pos.x, t.pos.y, t.radius);
      g.fillStyle(0xff3a2a, 0.3).fillCircle(t.pos.x, t.pos.y, t.radius * k);
      g.lineStyle(2, 0xff6a4a, 0.9).strokeCircle(t.pos.x, t.pos.y, t.radius);
    }
    // Monsters winding up an attack glow so you can see what's coming.
    for (const m of this.world.monsters) {
      if (!m.cast) continue;
      g.lineStyle(3, 0xffd04a, 0.85).strokeCircle(m.pos.x, m.pos.y, m.radius * SPRITE_SCALE * 0.9 + 4);
    }
  }

  /** Four skill slots along the bottom: button prompt, skill name, mana cost (dim when unaffordable). */
  private drawSkillBar(): void {
    const { g, labels } = this.skillBar;
    const { width, height } = this.scale;
    const box = 116;
    const gap = 8;
    const x0 = width / 2 - (SKILL_SLOTS * box + (SKILL_SLOTS - 1) * gap) / 2;
    const y = height - 70;
    g.clear();
    for (let i = 0; i < SKILL_SLOTS; i++) {
      const skill = this.world.player.compiled[i + 1];
      const affordable = !!skill && (!!skill.trigger || this.world.player.mana >= skill.cost);
      const x = x0 + i * (box + gap);
      g.fillStyle(0x0b0b10, 0.75).fillRect(x, y, box, 46);
      g.lineStyle(1, affordable ? 0x6a8ad8 : 0x3a3a48, 1).strokeRect(x, y, box, 46);
      labels[i]!
        .setPosition(x + box / 2, y + 5)
        .setColor(skill ? (affordable ? "#d8d8e0" : "#6a6a76") : "#4a4a56")
        .setText([
          skill?.trigger ? "on kill" : `[${this.inputs.skillPrompt(i)}]`,
          skill ? `${skill.name}${skill.trigger ? "" : ` ${Math.round(skill.cost)}mp`}` : "empty",
        ]);
    }
  }

  private onLevelUp(level: number): void {
    const p = this.world.player;
    this.toast(`Level ${level}!`);
    const ring = this.add.circle(p.pos.x, p.pos.y, p.radius * 2, 0xffd84a, 0).setStrokeStyle(4, 0xffd84a, 1).setDepth(p.pos.y + 2);
    this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
    this.floatText(p.pos.x, p.pos.y - 40, "LEVEL UP", "#ffd84a", 18);
  }

  private drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, frac: number, color: number, back = 0x3a1414): void {
    g.fillStyle(0x000000, 0.7).fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(back, 1).fillRect(x, y, w, h);
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

  /** Hideout stations: placeholder shapes until the art pass, with a name label. */
  private drawStations(zone: Zone): void {
    this.stationLabels.clear();
    for (const st of zone.stations ?? []) {
      const { x, y } = st.pos;
      const g = this.add.graphics().setDepth(y - 10);
      if (st.id === "map_device") {
        g.fillStyle(0x8a5ad8, 0.2).fillCircle(x, y, 44);
        g.fillStyle(0x3a2a5a, 1).fillCircle(x, y, 30);
        g.lineStyle(3, 0xc8a8ff, 0.9).strokeCircle(x, y, 30);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          g.fillStyle(0xc8a8ff, 1).fillCircle(x + Math.cos(a) * 30, y + Math.sin(a) * 30, 4);
        }
        this.tweens.add({ targets: g, alpha: 0.7, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      } else if (st.id === "stash") {
        g.fillStyle(0x5a3a1a, 1).fillRect(x - 24, y - 16, 48, 32);
        g.fillStyle(0x7a5228, 1).fillRect(x - 24, y - 16, 48, 10);
        g.lineStyle(2, 0xe8c878, 1).strokeRect(x - 24, y - 16, 48, 32);
        g.fillStyle(0xe8c878, 1).fillRect(x - 4, y - 8, 8, 8);
      } else {
        g.fillStyle(0x6a6a74, 1).fillRect(x - 26, y - 6, 52, 14);
        g.fillStyle(0x4a4a54, 1).fillRect(x - 14, y + 8, 28, 12);
        g.fillStyle(0x8a8a96, 1).fillRect(x - 30, y - 12, 40, 8);
        g.fillStyle(0xff8a3a, 0.8).fillCircle(x + 18, y - 14, 4);
      }
      const label = this.add
        .text(x, y - 46, st.name, { fontFamily: "monospace", fontSize: "13px", color: "#e8e2d0", backgroundColor: "#000000aa", padding: { x: 4, y: 1 } })
        .setOrigin(0.5)
        .setDepth(20_500);
      this.stationLabels.set(st.id, label);
    }
  }

  /** The portal (if open): a swirling blue ring with a label; highlighted when ✕ would use it. */
  private syncPortal(): void {
    const at = this.world.portal;
    if (!at) {
      this.portalView?.g.setVisible(false);
      this.portalView?.label.setVisible(false);
      return;
    }
    if (!this.portalView) {
      const g = this.add.graphics();
      g.fillStyle(0x3a8aff, 0.25).fillEllipse(0, 0, 64, 80);
      g.lineStyle(4, 0x8ac8ff, 0.95).strokeEllipse(0, 0, 44, 62);
      g.lineStyle(2, 0xffffff, 0.6).strokeEllipse(0, 0, 26, 40);
      this.tweens.add({ targets: g, scaleX: 0.9, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      const label = this.add
        .text(0, 0, "", { fontFamily: "monospace", fontSize: "13px", color: "#cfe6ff", backgroundColor: "#000000aa", padding: { x: 4, y: 1 } })
        .setOrigin(0.5)
        .setDepth(20_500);
      this.portalView = { g, label };
    }
    const near = dist2(this.world.player.pos, at) <= content.hideout.interactRange ** 2 && !nearestPickup(this.world, content);
    const name = this.world.map.hideout ? `Portal to ${this.suspended?.map.name ?? "your map"}` : "Portal to hideout";
    this.portalView.g.setVisible(true).setPosition(at.x, at.y).setDepth(at.y - 1);
    this.portalView.label
      .setVisible(true)
      .setPosition(at.x, at.y - 52)
      .setText(near ? `[${this.inputs.prompt("pickup")}] ${name}` : name)
      .setBackgroundColor(near ? "#1c4a7aee" : "#000000aa");
  }

  /** Highlight the station ✕ would use, with the button prompt. */
  private syncStations(): void {
    const near = nearestPickup(this.world, content) ? null : nearestStation(this.world, content);
    for (const st of this.world.zone.stations ?? []) {
      const label = this.stationLabels.get(st.id);
      const hot = near?.id === st.id;
      label?.setText(hot ? `[${this.inputs.prompt("pickup")}] ${st.name}` : st.name).setBackgroundColor(hot ? "#4a2a7aee" : "#000000aa");
    }
  }

  private drawExit(zone: Zone): void {
    const { x, y } = zone.exit;
    const r = zone.tileSize * 0.8;
    const g = this.add.graphics().setDepth(-5);
    g.fillStyle(0x6fd3ff, 0.18).fillCircle(x, y, r * 1.6);
    g.fillStyle(0x6fd3ff, 0.35).fillCircle(x, y, r);
    g.lineStyle(3, 0xbfefff, 0.9).strokeCircle(x, y, r);
    this.tweens.add({ targets: g, alpha: 0.55, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.exitLabel = this.add
      .text(x, y - r - 14, "EXIT", { fontFamily: "monospace", fontSize: "14px", color: "#bfefff", stroke: "#000", strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(-4);
  }

  /** The boss bar along the top while the boss is awake, and the exit label (sealed until it dies). */
  private drawBossBar(): void {
    const w = this.world;
    const boss = w.bossId !== null ? w.monsters.find((m) => m.id === w.bossId) : undefined;
    this.exitLabel?.setText(boss ? "SEALED" : "EXIT").setColor(boss ? "#ff7a6a" : "#bfefff");
    const show = !!boss && boss.awake;
    this.bossText.setVisible(show);
    if (!boss || !show) return;
    const def = content.monsters.find((d) => d.id === boss.defId);
    const { width } = this.scale;
    const bw = Math.min(520, width - 80);
    const x = (width - bw) / 2;
    const titan = def?.boss === "titan";
    const color = titan ? 0xc04aff : MONSTER_RARITY_COLOR[boss.rarity];
    this.drawBar(this.hud, x, 30, bw, 12, boss.life / boss.maxLife, color, 0x1a1016);
    const kind = titan ? "Titan" : `${boss.rarity === "normal" ? "" : `${content.monsterRarity.rarities[boss.rarity].name} `}Warden`;
    const mods = boss.mods.map((id) => content.monsterMods.find((d) => d.id === id)?.name ?? id).join(", ");
    this.bossText
      .setPosition(width / 2, 10)
      .setText(`${boss.name ?? def?.name}  ·  ${kind}${boss.enraged ? "  ·  ENRAGED" : ""}${mods ? `  ·  ${mods}` : ""}`)
      .setColor(titan ? "#d8a0ff" : `#${MONSTER_RARITY_COLOR[boss.rarity === "normal" ? "rare" : boss.rarity].toString(16).padStart(6, "0")}`);
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
    for (const g of this.world.groundItems) dots.fillStyle(Phaser.Display.Color.HexStringToColor(itemColor(g.item)).color, 1).fillRect(ox + g.pos.x * k - 1.5, oy + g.pos.y * k - 1.5, 3, 3);
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

  private flash(view: ActorView, color: number): void {
    view.sprite.setTintFill(color);
    view.flashUntil = this.time.now + 70;
    this.time.delayedCall(70, () => view.sprite.active && view.sprite.clearTint());
  }

  /**
   * Status overlays (drawn over the sprite rather than tinting it, which just looks muddy):
   * frozen = icy disc with a white rim, chilled = blue ring, burning = flickering embers.
   */
  private drawAilments(m: MonsterState): void {
    const a: Ailments = m.ailments;
    const g = this.bars;
    const { x, y } = m.pos;
    const r = m.radius * 1.5;
    if (a.freeze > 0) {
      g.fillStyle(0x58b8ff, 0.5).fillCircle(x, y, r);
      g.lineStyle(2, 0xffffff, 0.9).strokeCircle(x, y, r);
    } else if (a.chill > 0) {
      g.lineStyle(2, 0x7fd0ff, 0.85).strokeCircle(x, y, r);
    }
    if (a.ignite > 0) {
      const t = this.time.now / 120;
      for (let i = 0; i < 3; i++) {
        const flick = Math.sin(t + i * 2.1);
        g.fillStyle(flick > 0 ? 0xffb040 : 0xff6020, 0.95).fillCircle(x + (i - 1) * m.radius * 0.8, y - m.radius * 1.3 - flick * 5, 4.5 + flick * 1.5);
      }
    }
  }

  /** Burst (circle) or cone (sector) that flashes and fades. */
  private showArea(pos: Vec, radius: number, angle: number, arc: number, color: number): void {
    const g = this.add.graphics().setDepth(pos.y + 2);
    g.fillStyle(color, 0.45).lineStyle(2, color, 0.95);
    if (arc > 0) {
      g.slice(pos.x, pos.y, radius, angle - arc / 2, angle + arc / 2, false).fillPath();
      g.beginPath().arc(pos.x, pos.y, radius, angle - arc / 2, angle + arc / 2, false).strokePath();
    } else {
      g.fillCircle(pos.x, pos.y, radius).strokeCircle(pos.x, pos.y, radius);
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 280, ease: "Quad.easeIn", onComplete: () => g.destroy() });
  }

  private floatText(x: number, y: number, text: string, color: string, size = 14): void {
    const t = this.add
      .text(x, y, text, { fontFamily: "monospace", fontSize: `${size}px`, color, stroke: "#000", strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(15_000);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  private onPlayerDied(): void {
    const view = this.views.get(this.world.player.id);
    if (view) this.tweens.add({ targets: view.sprite, angle: 90, alpha: 0.5, duration: 400 });
    this.inputs.rumble(1, 0.8, 400);
    this.deathSave = saveAfterDeath(this.world, content);
    writeSave(this.deathSave);
    const lost = Math.round(this.world.player.xp - this.deathSave.xp);
    const retry = this.deathSave.currentMap
      ? `${this.inputs.prompt("confirm")} retry this map   ·   ${this.inputs.prompt("cancel")} back to the hideout`
      : `${this.inputs.prompt("confirm")} back to the hideout (map lost)`;
    this.showOverlay("YOU DIED", "#c0302a", () => `lost ${lost} XP, kept all items   ·   ${retry}`);
  }

  private onZoneComplete(reward: CairnstoneItem | null): void {
    const got = reward ? `${itemName(reward)}` : "nothing";
    this.clearMessage = `Map cleared! Reward: ${got}.`;
    this.showOverlay("MAP CLEARED", "#6fd3ff", () => `reward: ${got}   ·   press ${this.inputs.prompt("confirm")} to return to the hideout`);
  }

  /** Through the portal: map → hideout (the map waits in memory), or hideout → back into the map. */
  private takePortal(): void {
    const save = currentSave(this.world);
    writeSave(save);
    if (this.world.map.hideout && this.suspended) {
      this.scene.restart({ resume: rejoinMap(this.suspended, save, content) } satisfies SceneData);
    } else if (!this.world.map.hideout) {
      this.scene.restart({ save, suspended: this.world, message: "Home through the portal. Your map is waiting: use the portal to go back." } satisfies SceneData);
    }
  }

  /** Start a map from the Map Device: the previewed free map (null) or a Cairnstone (consumed). */
  private openMap(stoneIndex: number | null): void {
    if (this.suspended && !this.abandonArmed) {
      this.abandonArmed = true;
      this.toast(`You have a map open: take the portal back, or press ${this.inputs.prompt("confirm")} again to abandon it`);
      return;
    }
    const refused = inventoryCommand(this.world, content, { type: "open_map", stoneIndex, seed: stoneIndex === null ? this.freeSeed : randomSeed() });
    if (refused) return;
    this.device.hide();
    const save = currentSave(this.world);
    writeSave(save);
    this.scene.restart({ save } satisfies SceneData);
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

const SHOT_COLORS = {
  physical: 0xc8a070, // earthy, so slams read differently from the white sword swing
  fire: 0xff8a3a,
  cold: 0x9fe0ff,
  lightning: 0xfff07a,
  chaos: 0xc070ff,
};

const dist2 = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
