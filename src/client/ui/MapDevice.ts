// Map Device: shown between maps. Pick a Cairnstone to open (it's consumed), or run the free
// map (no stone: a bit below your best level, random lowest-tier mods). Salvage stones here;
// Options opens the menu to craft them (Currency tab). Fully usable with a pad.

import Phaser from "phaser";
import { content } from "../../data";
import { mapModLines, rewardLine, stoneName } from "../../sim/items/cairnstone";
import { salvageYield } from "../../sim/items/crafting";
import type { CairnstoneItem } from "../../sim/items/types";
import type { InventoryCommand, WorldState } from "../../sim/world";
import type { InputManager } from "../input/InputManager";
import { currencyName, RARITY_COLOR } from "./items";

const FONT = { fontFamily: "monospace", fontSize: "14px", color: "#d8d8e0" };
const ROWS = 18;
const RARITY_ORDER = { rare: 0, magic: 1, normal: 2 } as const;
const INPUT_DELAY_MS = 400; // ignore the ✕ that dismissed the previous screen

export interface MapDeviceActions {
  command(cmd: InventoryCommand): string | null;
  /** Start the chosen map: null = this world's free map, else a stone from the stone bag. */
  open(stoneIndex: number | null): void;
  openMenu(): void;
}

export class MapDevice {
  open = false;
  private row = 0;
  private message = "";
  private confirmSalvage: number | null = null; // uid of a rare stone waiting for a second press
  private shownAt = 0;
  private root: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private header: Phaser.GameObjects.Text;
  private rows: Phaser.GameObjects.Text[] = [];
  private title: Phaser.GameObjects.Text;
  private body: Phaser.GameObjects.Text;
  private footer: Phaser.GameObjects.Text;

  constructor(
    private scene: Phaser.Scene,
    private inputs: InputManager,
    private world: () => WorldState,
    private actions: MapDeviceActions,
  ) {
    this.bg = scene.add.rectangle(0, 0, 10, 10, 0x0b0b10, 0.95).setOrigin(0).setStrokeStyle(1, 0x5a4a7a);
    this.header = scene.add.text(0, 0, "", { ...FONT, fontSize: "16px", color: "#c8a8ff" });
    for (let i = 0; i < ROWS; i++) this.rows.push(scene.add.text(0, 0, "", { ...FONT, fontSize: "13px" }));
    this.title = scene.add.text(0, 0, "", { ...FONT, fontSize: "15px" });
    this.body = scene.add.text(0, 0, "", { ...FONT, fontSize: "13px", color: "#c8c8d0", lineSpacing: 3 });
    this.footer = scene.add.text(0, 0, "", { ...FONT, fontSize: "12px", color: "#8a8a96" });
    this.root = scene.add
      .container(0, 0, [this.bg, this.header, ...this.rows, this.title, this.body, this.footer])
      .setScrollFactor(0)
      .setDepth(34_000)
      .setVisible(false);
  }

  show(message = ""): void {
    this.open = true;
    this.row = 0;
    this.message = message;
    this.confirmSalvage = null;
    this.shownAt = this.scene.time.now;
    this.root.setVisible(true);
    this.render();
  }

  hide(): void {
    this.open = false;
    this.root.setVisible(false);
  }

  /** Free map first, then stones: highest level first, rares before magic before normal. Values are stone bag indices. */
  private entries(): (number | null)[] {
    const bag = this.world().player.save.stoneBag;
    const order = bag.map((_, i) => i).sort((a, b) => bag[b]!.level - bag[a]!.level || RARITY_ORDER[bag[a]!.rarity] - RARITY_ORDER[bag[b]!.rarity]);
    return [null, ...order];
  }

  update(): void {
    const i = this.inputs;
    const entries = this.entries();
    if (this.scene.time.now - this.shownAt < INPUT_DELAY_MS) return this.render();
    if (i.pressed("character") || i.pressed("inventory")) return this.actions.openMenu();
    if (i.pressed("down") || i.pressed("up")) {
      this.row = (this.row + (i.pressed("down") ? 1 : -1) + entries.length) % entries.length;
      this.confirmSalvage = null;
      this.message = "";
    }
    this.row = Math.min(this.row, entries.length - 1);
    const pick = entries[this.row] ?? null;
    if (i.pressed("confirm")) return this.actions.open(pick);
    if (pick !== null && i.pressed("salvage")) this.salvage(pick);
    this.render();
  }

  private salvage(index: number): void {
    const stone = this.world().player.save.stoneBag[index];
    if (!stone) return;
    if (stone.rarity === "rare" && this.confirmSalvage !== stone.uid) {
      this.confirmSalvage = stone.uid;
      this.message = `Salvage ${stoneName(content, stone)}? Press ${this.inputs.prompt("salvage")} again.`;
      return;
    }
    this.confirmSalvage = null;
    const y = salvageYield(content, stone);
    const refused = this.actions.command({ type: "salvage", bag: "stones", index });
    this.message = refused ? `Can't: ${refused}` : `Salvaged ${stoneName(content, stone)}: +${y.count} ${currencyName(y.currency)}`;
  }

  render(): void {
    if (!this.open) return;
    const { width, height } = this.scene.scale;
    const w = Math.min(1040, width - 32);
    const h = Math.min(600, height - 100);
    const x = (width - w) / 2;
    const y = Math.max(16, (height - h) / 2 - 20);
    const save = this.world().player.save;
    this.bg.setPosition(x, y).setSize(w, h);
    this.header.setPosition(x + 16, y + 12).setText(`MAP DEVICE   ·   best map level ${save.bestMapLevel}   ·   Cairnstones ${save.stoneBag.length}/${content.cairnstones.bagSize}`);

    const entries = this.entries();
    const first = Math.max(0, Math.min(this.row - Math.floor(ROWS / 2), entries.length - ROWS));
    this.rows.forEach((t, k) => {
      const idx = first + k;
      const e = entries[idx];
      t.setPosition(x + 16, y + 48 + k * 19);
      if (e === undefined) return t.setText("");
      const mark = idx === this.row ? "▶ " : "  ";
      if (e === null) return t.setText(`${mark}Run without a Cairnstone (level ${this.world().map.level})`).setColor("#a8a8b8");
      const s = save.stoneBag[e]!;
      t.setText(`${mark}Lv ${String(s.level).padStart(2)}  ${stoneName(content, s)}${s.corrupted ? "  (corrupted)" : ""}`).setColor(RARITY_COLOR[s.rarity]);
    });

    const tx = x + 16 + Math.min(470, w * 0.47);
    const wrap = w - (tx - x) - 24;
    const pick = entries[this.row] ?? null;
    let lines: string[];
    if (pick === null) {
      const m = this.world().map;
      this.title.setText(m.name).setColor("#a8a8b8");
      lines = [
        `Level ${m.level}: free maps run ${content.cairnstones.freeMap.levelsBelowBest} below your best map level (${save.bestMapLevel}).`,
        "No Cairnstone needed. Random lowest-tier mods:",
        "",
        ...(m.mods.length ? mapModLines(content, m.mods) : ["(no mods)"]),
        "",
        `Rewards: ${rewardLine(content, m.mods)}`,
        "Clearing it still gives a Cairnstone.",
      ];
    } else {
      const s: CairnstoneItem = save.stoneBag[pick]!;
      this.title.setText(stoneName(content, s)).setColor(RARITY_COLOR[s.rarity]);
      lines = [
        `Cairnstone · level ${s.level} · ${s.rarity}${s.corrupted ? " · corrupted" : ""}`,
        "Opening it uses it up. Monster level = stone level.",
        "",
        ...(s.mods.length ? mapModLines(content, s.mods) : ["(no mods: craft it with currency to add some)"]),
        "",
        `Rewards: ${rewardLine(content, s.mods)}`,
      ];
    }
    lines.push("", "Every cleared map gives a new Cairnstone (sometimes a level higher).", "Deaths retry the same map: no limit for now.");
    if (this.message) lines.push("", this.message);
    this.title.setPosition(tx, y + 48);
    this.body.setPosition(tx, y + 74).setWordWrapWidth(wrap).setText(lines);

    const pad = this.inputs.device === "pad";
    this.footer
      .setPosition(x + 16, y + h - 26)
      .setText(`${pad ? "D-pad select   ✕ open map   □ salvage stone   Options craft (menu)" : "W/S select   Enter open map   X salvage stone   C craft (menu)"}`);
  }
}
