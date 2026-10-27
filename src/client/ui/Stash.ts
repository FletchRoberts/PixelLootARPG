// Stash: the hideout's storage. Three tabs (Gear / Gems / Cairnstones), your bag on the left,
// the stash on the right; ←/→ picks a side, ✕ moves the selected item across.
// Fully usable with a pad: D-pad moves, L1/R1 switch tabs, ○ closes.

import Phaser from "phaser";
import { content } from "../../data";
import type { StashTab } from "../../sim/items/inventory";
import type { Item } from "../../sim/items/types";
import type { InventoryCommand, WorldState } from "../../sim/world";
import type { InputManager } from "../input/InputManager";
import { gearTooltip, itemColor, itemName, stoneTooltip } from "./items";

const FONT = { fontFamily: "monospace", fontSize: "13px", color: "#d8d8e0" };
const ROWS = 22;
const TABS: StashTab[] = ["gear", "gems", "stones"];
const TAB_LABEL: Record<StashTab, string> = { gear: "Gear", gems: "Gems", stones: "Cairnstones" };

export class Stash {
  open = false;
  private tab: StashTab = "gear";
  private side: "bag" | "stash" = "bag";
  private row = { bag: 0, stash: 0 };
  private message = "";
  private root: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private header: Phaser.GameObjects.Text;
  private colTitles: Phaser.GameObjects.Text[];
  private cols: { bag: Phaser.GameObjects.Text[]; stash: Phaser.GameObjects.Text[] } = { bag: [], stash: [] };
  private tipTitle: Phaser.GameObjects.Text;
  private tip: Phaser.GameObjects.Text;
  private footer: Phaser.GameObjects.Text;

  constructor(
    private scene: Phaser.Scene,
    private inputs: InputManager,
    private world: () => WorldState,
    private command: (cmd: InventoryCommand) => string | null,
  ) {
    this.bg = scene.add.rectangle(0, 0, 10, 10, 0x0b0b10, 0.95).setOrigin(0).setStrokeStyle(1, 0x7a6a3a);
    this.header = scene.add.text(0, 0, "", { ...FONT, fontSize: "16px", color: "#e8c878" });
    this.colTitles = [scene.add.text(0, 0, "", { ...FONT, color: "#a8a8b8" }), scene.add.text(0, 0, "", { ...FONT, color: "#a8a8b8" })];
    for (let i = 0; i < ROWS; i++) {
      this.cols.bag.push(scene.add.text(0, 0, "", FONT));
      this.cols.stash.push(scene.add.text(0, 0, "", FONT));
    }
    this.tipTitle = scene.add.text(0, 0, "", { ...FONT, fontSize: "14px" });
    this.tip = scene.add.text(0, 0, "", { ...FONT, color: "#c8c8d0", lineSpacing: 3 });
    this.footer = scene.add.text(0, 0, "", { ...FONT, fontSize: "12px", color: "#8a8a96" });
    this.root = scene.add
      .container(0, 0, [this.bg, this.header, ...this.colTitles, ...this.cols.bag, ...this.cols.stash, this.tipTitle, this.tip, this.footer])
      .setScrollFactor(0)
      .setDepth(34_000)
      .setVisible(false);
  }

  show(): void {
    this.open = true;
    this.message = "";
    this.root.setVisible(true);
    this.render();
  }

  hide(): void {
    this.open = false;
    this.root.setVisible(false);
  }

  private lists(): { bag: Item[]; stash: Item[] } {
    const save = this.world().player.save;
    const bag = this.tab === "gear" ? save.gearBag : this.tab === "gems" ? save.gemBag : save.stoneBag;
    return { bag, stash: save.stash[this.tab] };
  }

  update(): void {
    const i = this.inputs;
    if (i.pressed("cancel")) return this.hide();
    if (i.pressed("tabNext") || i.pressed("tabPrev")) {
      this.tab = TABS[(TABS.indexOf(this.tab) + (i.pressed("tabNext") ? 1 : -1) + TABS.length) % TABS.length]!;
      this.row = { bag: 0, stash: 0 };
      this.message = "";
    }
    if (i.pressed("left")) this.side = "bag";
    if (i.pressed("right")) this.side = "stash";
    const list = this.lists()[this.side];
    if (list.length > 0) {
      if (i.pressed("down")) this.row[this.side] = (this.row[this.side] + 1) % list.length;
      if (i.pressed("up")) this.row[this.side] = (this.row[this.side] - 1 + list.length) % list.length;
    }
    this.row[this.side] = Math.max(0, Math.min(this.row[this.side], list.length - 1));
    if (i.pressed("confirm") && list.length > 0) {
      const item = list[this.row[this.side]]!;
      const refused = this.command({ type: "stash", tab: this.tab, index: this.row[this.side], take: this.side === "stash" });
      this.message = refused ? `Can't: ${refused}` : `${this.side === "bag" ? "Stored" : "Took"} ${itemName(item)}`;
    }
    this.render();
  }

  private tooltip(item: Item | undefined): { title: string; color: string; lines: string[] } {
    if (!item) return { title: "", color: "#d8d8e0", lines: [] };
    if (item.kind === "gear") {
      const t = gearTooltip(item);
      return { title: t.title, color: itemColor(item), lines: t.lines };
    }
    if (item.kind === "cairnstone") {
      const t = stoneTooltip(item);
      return { title: t.title, color: itemColor(item), lines: t.lines };
    }
    if (item.kind === "skill_gem") {
      const def = content.skills.find((s) => s.id === item.defId);
      return { title: itemName(item), color: itemColor(item), lines: [`Skill gem · level ${item.level} / ${content.gems.maxLevel}`, `Tags: ${def?.tags.join(", ") ?? ""}`] };
    }
    if (item.kind === "support_gem") {
      const def = content.supports.find((s) => s.id === item.defId);
      return { title: itemName(item), color: itemColor(item), lines: ["Support gem", "", def?.description ?? ""] };
    }
    return { title: itemName(item), color: itemColor(item), lines: [] };
  }

  render(): void {
    if (!this.open) return;
    const { width, height } = this.scene.scale;
    const w = Math.min(1040, width - 32);
    const h = Math.min(600, height - 100);
    const x = (width - w) / 2;
    const y = Math.max(16, (height - h) / 2 - 20);
    this.bg.setPosition(x, y).setSize(w, h);
    const pad = this.inputs.device === "pad";
    const tabs = TABS.map((t) => (t === this.tab ? `[ ${TAB_LABEL[t].toUpperCase()} ]` : `  ${TAB_LABEL[t]}  `)).join("  ");
    this.header.setPosition(x + 16, y + 12).setText(`STASH    ${pad ? "L1" : "Q"} ◀  ${tabs}  ▶ ${pad ? "R1" : "Tab"}`);

    const lists = this.lists();
    const bagMax = this.tab === "gear" ? content.gear.bagSize : this.tab === "gems" ? content.gems.bagSize : content.cairnstones.bagSize;
    const colW = Math.min(300, (w - 48) * 0.3);
    const colX = { bag: x + 16, stash: x + 32 + colW };
    this.colTitles[0]!.setPosition(colX.bag, y + 44).setText(`${this.side === "bag" ? "▶ " : "  "}BAG ${lists.bag.length}/${bagMax}`);
    this.colTitles[1]!.setPosition(colX.stash, y + 44).setText(`${this.side === "stash" ? "▶ " : "  "}STASH ${lists.stash.length}/${content.hideout.stashSize[this.tab]}`);
    for (const side of ["bag", "stash"] as const) {
      const list = lists[side];
      const sel = this.row[side];
      const first = Math.max(0, Math.min(sel - Math.floor(ROWS / 2), list.length - ROWS));
      this.cols[side].forEach((t, k) => {
        const it = list[first + k];
        t.setPosition(colX[side], y + 68 + k * 19);
        if (!it) return t.setText(k === 0 && list.length === 0 ? "  (empty)" : "");
        const mark = side === this.side && first + k === sel ? "▶ " : "  ";
        const name = itemName(it);
        t.setText(`${mark}${name.length > 30 ? `${name.slice(0, 29)}…` : name}`).setColor(itemColor(it));
      });
    }

    const tx = colX.stash + colW + 16;
    const wrap = x + w - tx - 16;
    const tip = this.tooltip(lists[this.side][this.row[this.side]]);
    this.tipTitle.setPosition(tx, y + 44).setText(tip.title).setColor(tip.color);
    this.tip.setPosition(tx, y + 68).setWordWrapWidth(wrap).setText([...tip.lines, ...(this.message ? ["", this.message] : [])]);
    this.footer
      .setPosition(x + 16, y + h - 26)
      .setText(pad ? "D-pad select   ←/→ bag / stash   ✕ move across   L1/R1 tabs   ○ close" : "W/S select   A/D bag / stash   Enter move across   Q/Tab tabs   Esc close");
  }
}
