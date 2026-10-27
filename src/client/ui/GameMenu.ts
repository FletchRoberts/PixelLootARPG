// Pause menu with tabs:
//   Character  stats sheet
//   Gear       equipment slots and the gear bag, with tooltips, comparison and salvage
//   Gems       skill gems on the four buttons, support gems in their sockets
//   Currency   the currency stash: use currency on gear/gems, bulk salvage
//   Debug      spawn gems, gear and currency, reset the character
// Fully usable with keyboard or controller: D-pad/WASD move, ✕/Enter confirm, ○/Esc back.

import Phaser from "phaser";
import { content } from "../../data";
import { compareWorlds, type StatChange } from "../../sim/items/compare";
import { allTargets, currencyProblem, salvageYield, targetItem, type BulkSalvage, type CraftTarget } from "../../sim/items/crafting";
import { supportFitsTarget } from "../../sim/items/inventory";
import { EQUIP_SLOTS, type EquipSlot, type GearItem, type GemItem, type SocketTarget } from "../../sim/items/types";
import { currencyName, gearTooltip, itemColor, itemName, RARITY_COLOR } from "./items";
import { describeSkill } from "../../sim/skills/describe";
import { xpToNext } from "../../sim/stats/character";
import { computeStat } from "../../sim/stats/stats";
import { skillSummary, SKILL_SLOTS, type InventoryCommand, type WorldState } from "../../sim/world";
import type { InputManager } from "../input/InputManager";

export type MenuTab = "character" | "gear" | "gems" | "currency" | "debug";
const TABS: MenuTab[] = ["character", "gear", "gems", "currency", "debug"];
const FULL_CURRENCIES = content.currencies.filter((c) => !c.combine);
const fragmentOf = (id: string) => content.currencies.find((c) => c.combine?.into === id);
const CRAFT_ROWS = 9; // visible targets in the currency picker
const GEAR_ROWS = 24; // visible rows in the gear list
const DIFF_ROWS = 14; // stat change lines in the gear tooltip

type GearEntry = { kind: "slot"; slot: EquipSlot } | { kind: "bag"; bagIndex: number };
const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: "Weapon",
  helmet: "Helmet",
  body: "Body",
  gloves: "Gloves",
  boots: "Boots",
  belt: "Belt",
  amulet: "Amulet",
  ring1: "Ring",
  ring2: "Ring",
};
const FONT = { fontFamily: "monospace", fontSize: "14px", color: "#d8d8e0" };

type Cell = { kind: "skill"; slot: number } | { kind: "socket"; target: SocketTarget; socket: number };

interface Choice {
  label: string;
  run: () => string | null; // null = done, string = refused (shown to the player)
}

export interface MenuActions {
  command(cmd: InventoryCommand): string | null;
  preview(cmd: InventoryCommand): WorldState | string; // the world after cmd, without applying it
  resetCharacter(): void;
}

const skillName = (id: string) => content.skills.find((s) => s.id === id)?.name ?? id;
const supportName = (id: string) => content.supports.find((s) => s.id === id)?.name ?? id;
const gemName = (g: GemItem) => (g.kind === "skill_gem" ? `${skillName(g.defId)} Lv${g.level}` : `${supportName(g.defId)}`);

export class GameMenu {
  open = false;
  private tab: MenuTab = "character";
  private row = 0;
  private col = 0;
  private picker: { title: string; choices: Choice[]; index: number } | null = null;
  private message = "";
  private confirmReset = false;
  private root: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private header: Phaser.GameObjects.Text;
  private left: Phaser.GameObjects.Text;
  private right: Phaser.GameObjects.Text;
  private footer: Phaser.GameObjects.Text;
  private gearRows: Phaser.GameObjects.Text[] = [];
  private tip: { title: Phaser.GameObjects.Text; body: Phaser.GameObjects.Text; cmpTitle: Phaser.GameObjects.Text; cmpBody: Phaser.GameObjects.Text };
  private diffRows: Phaser.GameObjects.Text[] = [];
  private ringTarget: "ring1" | "ring2" = "ring1"; // which ring a new ring replaces when both are worn
  private diffCache: { key: string; title: string; changes: StatChange[] } | null = null;
  private confirmSalvage: number | null = null; // uid of a rare/unique waiting for a second salvage press
  private craft: { currency: string; index: number; result: string[] } | null = null; // choosing a target for currency

  constructor(
    private scene: Phaser.Scene,
    private inputs: InputManager,
    private world: () => WorldState,
    private actions: MenuActions,
  ) {
    this.bg = scene.add.rectangle(0, 0, 10, 10, 0x0b0b10, 0.95).setOrigin(0).setStrokeStyle(1, 0x3a3a48);
    this.header = scene.add.text(0, 0, "", { ...FONT, fontSize: "16px" });
    this.left = scene.add.text(0, 0, "", { ...FONT, lineSpacing: 5 });
    this.right = scene.add.text(0, 0, "", { ...FONT, fontSize: "13px", color: "#a8c8e8", lineSpacing: 4 });
    this.footer = scene.add.text(0, 0, "", { ...FONT, fontSize: "12px", color: "#8a8a96" });
    for (let i = 0; i < GEAR_ROWS; i++) this.gearRows.push(scene.add.text(0, 0, "", { ...FONT, fontSize: "13px" }));
    for (let i = 0; i < DIFF_ROWS; i++) this.diffRows.push(scene.add.text(0, 0, "", { ...FONT, fontSize: "13px" }));
    this.tip = {
      title: scene.add.text(0, 0, "", { ...FONT, fontSize: "15px" }),
      body: scene.add.text(0, 0, "", { ...FONT, fontSize: "13px", color: "#c8c8d0", lineSpacing: 3 }),
      cmpTitle: scene.add.text(0, 0, "", { ...FONT, fontSize: "13px" }),
      cmpBody: scene.add.text(0, 0, "", { ...FONT, fontSize: "12px", color: "#9a9aa6", lineSpacing: 2 }),
    };
    this.root = scene.add
      .container(0, 0, [this.bg, this.header, this.left, this.right, this.footer, ...this.gearRows, ...this.diffRows, this.tip.title, this.tip.body, this.tip.cmpTitle, this.tip.cmpBody])
      .setScrollFactor(0)
      .setDepth(35_000)
      .setVisible(false);
  }

  show(tab: MenuTab): void {
    this.open = true;
    this.tab = tab;
    this.row = 0;
    this.col = 0;
    this.picker = null;
    this.message = "";
    this.confirmReset = false;
    this.confirmSalvage = null;
    this.craft = null;
    this.root.setVisible(true);
    this.render();
  }

  hide(): void {
    this.open = false;
    this.root.setVisible(false);
  }

  /** Handle menu input for this frame. Call only while open. */
  update(): void {
    const i = this.inputs;
    if (this.picker) {
      this.updatePicker();
      return this.render();
    }
    if (this.craft) {
      this.updateCraft();
      return this.render();
    }
    if (i.pressed("cancel") || i.pressed("character") || i.pressed("inventory")) return this.hide();
    if (i.pressed("tabNext") || i.pressed("tabPrev")) {
      const dir = i.pressed("tabNext") ? 1 : -1;
      this.tab = TABS[(TABS.indexOf(this.tab) + dir + TABS.length) % TABS.length]!;
      this.row = 0;
      this.col = 0;
      this.message = "";
      this.confirmReset = false;
      this.confirmSalvage = null;
    }
    if (this.tab === "gear") this.updateGear();
    if (this.tab === "gems") this.updateInventory();
    if (this.tab === "currency") this.updateCurrency();
    if (this.tab === "debug") this.updateDebug();
    this.render();
  }

  // ---------------------------------------------------------------- inventory

  /** Grid rows: weapon attack sockets, then each skill button with its gem and sockets. */
  private grid(): { label: string; cells: Cell[] }[] {
    const save = this.world().player.save;
    const rows = [{ label: "attack", cells: save.attackSockets.map((_, socket): Cell => ({ kind: "socket", target: { kind: "attack" }, socket })) }];
    for (let slot = 0; slot < SKILL_SLOTS; slot++) {
      const gem = save.skillBar[slot];
      const sockets = (gem?.sockets ?? []).map((_, socket): Cell => ({ kind: "socket", target: { kind: "skill", slot }, socket }));
      rows.push({ label: `slot${slot}`, cells: [{ kind: "skill", slot }, ...sockets] });
    }
    return rows;
  }

  private updateInventory(): void {
    const i = this.inputs;
    const grid = this.grid();
    if (i.pressed("down")) this.row = (this.row + 1) % grid.length;
    if (i.pressed("up")) this.row = (this.row - 1 + grid.length) % grid.length;
    const cells = grid[this.row]!.cells;
    if (i.pressed("right")) this.col = Math.min(cells.length - 1, this.col + 1);
    if (i.pressed("left")) this.col = Math.max(0, this.col - 1);
    this.col = Math.min(this.col, Math.max(0, cells.length - 1));
    const cell = cells[this.col];
    if (cell && i.pressed("confirm")) this.openPicker(cell);
  }

  private openPicker(cell: Cell): void {
    const save = this.world().player.save;
    const choices: Choice[] = [];
    if (cell.kind === "skill") {
      save.gemBag.forEach((g, bagIndex) => {
        if (g.kind === "skill_gem") choices.push({ label: `Equip ${gemName(g)}`, run: () => this.actions.command({ type: "equip", bagIndex, slot: cell.slot }) });
      });
      const equipped = save.skillBar[cell.slot];
      if (equipped) {
        const copies = save.gemBag.map((g, i) => ({ g, i })).filter(({ g }) => g.kind === "skill_gem" && g.defId === equipped.defId);
        if (copies.length > 0 && equipped.level < content.gems.maxLevel) {
          const best = copies.sort((a, b) => b.g.level - a.g.level)[0]!;
          choices.unshift({
            label: `Level up: feed a copy (Lv${best.g.level}) → Lv${Math.min(content.gems.maxLevel, equipped.level + best.g.level)}   [${copies.length} in bag]`,
            run: () => this.actions.command({ type: "level_gem", slot: cell.slot, copyBagIndex: best.i }),
          });
        }
        choices.push({ label: "Remove (gem and its supports go back to the bag)", run: () => this.actions.command({ type: "unequip", slot: cell.slot }) });
      }
      this.picker = { title: `Skill gem for button ${this.inputs.skillPrompt(cell.slot)}`, choices, index: 0 };
    } else {
      const seen = new Set<string>();
      save.gemBag.forEach((g, bagIndex) => {
        if (g.kind !== "support_gem" || seen.has(g.defId)) return;
        seen.add(g.defId); // duplicates are interchangeable; list each support once
        if (!supportFitsTarget(save, g.defId, cell.target, content)) return;
        const def = content.supports.find((s) => s.id === g.defId);
        choices.push({ label: `${supportName(g.defId)}: ${def?.description ?? ""}`, run: () => this.actions.command({ type: "socket", bagIndex, target: cell.target, socket: cell.socket }) });
      });
      const sockets = cell.target.kind === "attack" ? save.attackSockets : save.skillBar[cell.target.slot]?.sockets;
      if (sockets?.[cell.socket]) choices.push({ label: "Remove (back to bag)", run: () => this.actions.command({ type: "unsocket", target: cell.target, socket: cell.socket }) });
      this.picker = { title: "Support gem for this socket", choices, index: 0 };
    }
    if (choices.length === 0) {
      this.picker = null;
      this.message = cell.kind === "skill" ? "No skill gems in your bag." : "No support gems in your bag that fit this skill.";
    }
  }

  private updatePicker(): void {
    const i = this.inputs;
    const p = this.picker!;
    if (i.pressed("cancel")) {
      this.picker = null;
      return;
    }
    if (i.pressed("down")) p.index = (p.index + 1) % p.choices.length;
    if (i.pressed("up")) p.index = (p.index - 1 + p.choices.length) % p.choices.length;
    if (i.pressed("confirm")) {
      const refused = p.choices[p.index]!.run();
      this.message = refused ? `Can't: ${refused}` : "";
      this.picker = null;
    }
  }

  private inventoryLines(): { left: string[]; right: string[] } {
    const w = this.world();
    const save = w.player.save;
    const grid = this.grid();
    const weapon = content.weapons.find((x) => x.id === save.weapon);
    const cellText = (cell: Cell): string => {
      if (cell.kind === "skill") {
        const g = save.skillBar[cell.slot];
        return g ? gemName(g) : "— empty —";
      }
      const sockets = cell.target.kind === "attack" ? save.attackSockets : save.skillBar[cell.target.slot]?.sockets;
      const g = sockets?.[cell.socket];
      return g ? supportName(g.defId) : "·";
    };
    const left: string[] = ["EQUIPPED", ""];
    grid.forEach((row, r) => {
      const label = r === 0 ? `Weapon (${weapon?.attack.name ?? "?"})` : `[${this.inputs.skillPrompt(r - 1)}]`;
      const cells = row.cells.map((c, k) => {
        const text = cellText(c);
        const selected = r === this.row && k === this.col;
        const box = c.kind === "skill" ? text : `[${text}]`;
        return selected ? `▶${box}◀` : ` ${box} `;
      });
      // Skill cell, then its sockets after an arrow.
      const [first, ...rest] = r === 0 ? ["", ...cells] : cells;
      left.push(`${label.padEnd(18)}${first ?? ""}${rest.length ? `  ⟶ ${rest.join("")}` : ""}`);
    });

    // Bag, grouped.
    const counts = new Map<string, number>();
    for (const g of save.gemBag) counts.set(gemName(g), (counts.get(gemName(g)) ?? 0) + 1);
    left.push("", `GEM BAG (${save.gemBag.length}/${content.gems.bagSize})`);
    const entries = [...counts.entries()].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name));
    for (let k = 0; k < entries.length; k += 3) left.push("  " + entries.slice(k, k + 3).join("   "));
    if (entries.length === 0) left.push("  (empty: gems drop from monsters, pick up with " + this.inputs.prompt("pickup") + ")");

    // Right side: what's selected, or the picker.
    let right: string[];
    if (this.picker) {
      right = [this.picker.title, "", ...this.picker.choices.map((c, k) => `${k === this.picker!.index ? "▶" : " "} ${c.label}`)];
    } else {
      const cell = grid[this.row]?.cells[this.col];
      right = this.cellDetails(w, cell);
    }
    if (this.message) right.push("", this.message);
    return { left, right };
  }

  private cellDetails(w: WorldState, cell: Cell | undefined): string[] {
    const save = w.player.save;
    if (!cell) return [];
    const skillIndex = cell.kind === "skill" ? cell.slot + 1 : cell.target.kind === "attack" ? 0 : cell.target.slot + 1;
    const compiled = w.player.compiled[skillIndex];
    const lines: string[] = [];
    if (cell.kind === "socket") {
      const sockets = cell.target.kind === "attack" ? save.attackSockets : save.skillBar[cell.target.slot]?.sockets;
      const g = sockets?.[cell.socket];
      const def = g && content.supports.find((s) => s.id === g.defId);
      lines.push(def ? `${def.name}: ${def.description}` : "Empty socket: press ✕ / Enter to add a support.", "");
    } else {
      const g = save.skillBar[cell.slot];
      if (g) {
        const copies = save.gemBag.filter((b) => b.kind === "skill_gem" && b.defId === g.defId).length;
        const max = g.level >= content.gems.maxLevel;
        lines.push(
          `${skillName(g.defId)}: level ${g.level} / ${content.gems.maxLevel}, ${g.sockets?.length ?? 0} sockets`,
          max ? "Max level: further copies start a new gem." : `Feed a copy of this gem to level it (${copies} in bag). Press ✕ / Enter.`,
          "",
        );
      } else lines.push("Empty button: press ✕ / Enter to equip a skill gem.", "");
    }
    if (compiled) lines.push(...describeSkill(compiled));
    return lines;
  }

  // ---------------------------------------------------------------- gear

  private gearEntries(): GearEntry[] {
    const save = this.world().player.save;
    const out: GearEntry[] = EQUIP_SLOTS.map((slot) => ({ kind: "slot", slot }));
    save.gearBag.forEach((_, bagIndex) => out.push({ kind: "bag", bagIndex }));
    return out;
  }

  private entryItem(e: GearEntry | undefined): GearItem | undefined {
    const save = this.world().player.save;
    if (!e) return undefined;
    return e.kind === "slot" ? save.equipment[e.slot] : save.gearBag[e.bagIndex];
  }

  /** Where a bag item would go: its slot, or for rings the free ring slot / the chosen one. */
  private targetSlot(item: GearItem): EquipSlot | undefined {
    const base = content.itemBases.find((b) => b.id === item.base);
    if (!base) return undefined;
    if (base.slot !== "ring") return base.slot;
    const eq = this.world().player.save.equipment;
    return !eq.ring1 ? "ring1" : !eq.ring2 ? "ring2" : this.ringTarget;
  }

  private bothRingsWorn(item: GearItem | undefined): boolean {
    const eq = this.world().player.save.equipment;
    return !!item && content.itemBases.find((b) => b.id === item.base)?.slot === "ring" && !!eq.ring1 && !!eq.ring2;
  }

  private updateGear(): void {
    const i = this.inputs;
    const entries = this.gearEntries();
    if (i.pressed("down") || i.pressed("up")) {
      this.row = (this.row + (i.pressed("down") ? 1 : -1) + entries.length) % entries.length;
      if (this.confirmSalvage !== null) this.message = "";
      this.confirmSalvage = null;
    }
    this.row = Math.min(this.row, entries.length - 1);
    const e = entries[this.row];
    const item = this.entryItem(e);
    if (e?.kind === "bag" && this.bothRingsWorn(item) && (i.pressed("left") || i.pressed("right"))) {
      this.ringTarget = this.ringTarget === "ring1" ? "ring2" : "ring1";
    }
    if (e?.kind === "bag" && item && i.pressed("salvage")) return this.salvageGear(e.bagIndex, item);
    if (!e || !i.pressed("confirm")) return;
    this.confirmSalvage = null;
    const refused =
      e.kind === "slot"
        ? item
          ? this.actions.command({ type: "unequip_gear", slot: e.slot })
          : "nothing equipped there"
        : this.actions.command({ type: "equip_gear", bagIndex: e.bagIndex, slot: item ? this.targetSlot(item) : undefined });
    this.message = refused ? `Can't: ${refused}` : "";
    this.diffCache = null;
  }

  /** Salvage a bag item into fragments; rares and uniques need a second press. */
  private salvageGear(bagIndex: number, item: GearItem): void {
    if ((item.rarity === "rare" || item.rarity === "unique") && this.confirmSalvage !== item.uid) {
      this.confirmSalvage = item.uid;
      this.message = `Salvage ${itemName(item)}? Press ${this.inputs.prompt("salvage")} again to confirm.`;
      return;
    }
    this.confirmSalvage = null;
    const y = salvageYield(content, item);
    const refused = this.actions.command({ type: "salvage", bag: "gear", index: bagIndex });
    this.message = refused ? `Can't: ${refused}` : `Salvaged ${itemName(item)}: +${y.count} ${currencyName(y.currency)}`;
    this.diffCache = null;
  }

  /** Stat changes for equipping the selected bag item / removing the selected equipped item. Cached per selection. */
  private changesFor(e: GearEntry | undefined, item: GearItem | undefined): { title: string; changes: StatChange[] } | null {
    if (!e || !item) return null;
    const w = this.world();
    const slot = e.kind === "bag" ? this.targetSlot(item) : e.slot;
    const key = `${e.kind}:${e.kind === "bag" ? e.bagIndex : e.slot}:${item.uid}:${slot}:${Object.values(w.player.save.equipment).map((x) => x?.uid).join(",")}:${w.player.level}`;
    if (this.diffCache?.key === key) return this.diffCache;
    const cmd: InventoryCommand = e.kind === "bag" ? { type: "equip_gear", bagIndex: e.bagIndex, slot } : { type: "unequip_gear", slot: e.slot };
    const after = this.actions.preview(cmd);
    const where = slot === "ring1" ? " (left ring)" : slot === "ring2" ? " (right ring)" : "";
    const title = typeof after === "string" ? `Can't equip: ${after}` : e.kind === "bag" ? `If equipped${where}:` : "If removed:";
    this.diffCache = { key, title, changes: typeof after === "string" ? [] : compareWorlds(w, after, content) };
    return this.diffCache;
  }

  private renderGear(x: number, y: number, w: number): void {
    const entries = this.gearEntries();
    const first = Math.max(0, Math.min(this.row - Math.floor(GEAR_ROWS / 2), entries.length - GEAR_ROWS));
    this.gearRows.forEach((t, k) => {
      const idx = first + k;
      const e = entries[idx];
      if (!e) return t.setText("");
      const it = this.entryItem(e);
      const mark = idx === this.row ? "▶ " : "  ";
      const label = e.kind === "slot" ? `${SLOT_LABEL[e.slot].padEnd(7)} ` : "  ";
      const header = e.kind === "bag" && (idx === 0 || entries[idx - 1]?.kind === "slot") ? "BAG  " : "";
      const name = it ? itemName(it) : "—";
      t.setPosition(x + 16, y + 48 + k * 19)
        .setText(`${mark}${header || label}${name}`)
        .setColor(it ? itemColor(it) : "#5a5a66");
    });

    const tx = x + 16 + Math.min(470, w * 0.47);
    const wrap = w - (tx - x) - 24;
    const sel = entries[this.row];
    const item = this.entryItem(sel);
    if (item) {
      const tip = gearTooltip(item);
      this.tip.title.setPosition(tx, y + 48).setText(tip.title).setColor(RARITY_COLOR[item.rarity]);
      this.tip.body.setPosition(tx, y + 72).setWordWrapWidth(wrap).setText([...tip.lines, ...(this.message ? ["", this.message] : [])]);
    } else {
      this.tip.title.setPosition(tx, y + 48).setText(sel?.kind === "slot" ? `${SLOT_LABEL[sel.slot]}: empty` : "").setColor("#8a8a96");
      this.tip.body.setPosition(tx, y + 72).setText(this.message ? [this.message] : ["Gear drops from monsters. Pick it up, then equip it here.", "", `Unwanted gear: ${this.inputs.prompt("salvage")} salvages it into currency fragments`, "(10 fragments combine into a full currency)."]);
    }

    // Green/red stat changes if this item were equipped (or removed).
    let cy = y + 80 + this.tip.body.height;
    const diff = this.changesFor(sel, item);
    const lines: { text: string; color: string }[] = [];
    if (diff) {
      const ringHint = sel?.kind === "bag" && this.bothRingsWorn(item) ? `   [${this.inputs.device === "pad" ? "←/→" : "A/D"}] other ring` : "";
      lines.push({ text: diff.title + ringHint, color: "#d8d8e0" });
      if (diff.changes.length === 0 && !diff.title.startsWith("Can't")) lines.push({ text: "  no change to your stats", color: "#8a8a96" });
      for (const c of diff.changes.slice(0, DIFF_ROWS - 1)) {
        const n = (v: number) => (Math.abs(v) < 10 && !Number.isInteger(v) ? v.toFixed(1) : String(Math.round(v)));
        const sign = c.delta > 0 ? "+" : "−";
        const pct = c.percent ? "%" : "";
        lines.push({ text: `  ${sign}${n(Math.abs(c.delta))}${pct} ${c.label}   (${n(c.before)}${pct} → ${n(c.after)}${pct})`, color: c.better ? "#6ee07a" : "#ff6a6a" });
      }
    }
    this.diffRows.forEach((t, k) => {
      const l = lines[k];
      t.setPosition(tx, cy + k * 17).setText(l?.text ?? "").setColor(l?.color ?? "#d8d8e0");
    });
    cy += lines.length * 17 + 10;

    // What's worn in the slot this bag item would replace.
    let worn: GearItem | undefined;
    if (sel?.kind === "bag" && item) {
      const slot = this.targetSlot(item);
      if (slot) worn = this.world().player.save.equipment[slot];
    }
    if (worn) {
      const tip = gearTooltip(worn);
      this.tip.cmpTitle.setPosition(tx, cy).setText(`Currently equipped: ${tip.title}`).setColor(RARITY_COLOR[worn.rarity]);
      this.tip.cmpBody.setPosition(tx, cy + 20).setWordWrapWidth(wrap).setText(tip.lines);
    } else {
      this.tip.cmpTitle.setText("");
      this.tip.cmpBody.setText("");
    }
  }

  // ---------------------------------------------------------------- currency

  /** Left list: each full currency (with its fragments), then the bulk salvage actions. */
  private currencyRows(): ({ kind: "currency"; id: string } | { kind: "salvage"; what: BulkSalvage; label: string; count: number })[] {
    const save = this.world().player.save;
    const gearOf = (r: GearItem["rarity"]) => save.gearBag.filter((g) => g.rarity === r).length;
    const spare = (kind: GemItem["kind"]) => {
      const gems = save.gemBag.filter((g) => g.kind === kind);
      return gems.length - new Set(gems.map((g) => g.defId)).size;
    };
    return [
      ...FULL_CURRENCIES.map((c) => ({ kind: "currency" as const, id: c.id })),
      { kind: "salvage", what: "normal", label: "Salvage all normal gear in the bag", count: gearOf("normal") },
      { kind: "salvage", what: "magic", label: "Salvage all magic gear in the bag", count: gearOf("magic") },
      { kind: "salvage", what: "rare", label: "Salvage all rare gear in the bag", count: gearOf("rare") },
      { kind: "salvage", what: "spare_supports", label: "Salvage spare support gems (keeps one of each)", count: spare("support_gem") },
      { kind: "salvage", what: "spare_skill_gems", label: "Salvage spare skill gems (keeps the best copy)", count: spare("skill_gem") },
    ];
  }

  /** Items the selected currency can be used on right now. */
  private craftTargets(currency: string): CraftTarget[] {
    const save = this.world().player.save;
    return allTargets(save).filter((t) => !currencyProblem(content, currency, targetItem(save, t)));
  }

  private targetLabel(t: CraftTarget): string {
    const it = targetItem(this.world().player.save, t);
    const name = it ? itemName(it) : "?";
    switch (t.where) {
      case "equipped":
        return `[worn ${SLOT_LABEL[t.slot]}] ${name}`;
      case "gear_bag":
        return `[bag] ${name}`;
      case "skill":
        return `[skill ${this.inputs.skillPrompt(t.slot)}] ${name}`;
      case "gem_bag":
        return `[gem bag] ${name}`;
    }
  }

  private itemLines(t: CraftTarget | undefined): string[] {
    const it = t && targetItem(this.world().player.save, t);
    if (!it) return [];
    if (it.kind === "gear") {
      const tip = gearTooltip(it);
      return [tip.title, ...tip.lines];
    }
    return [`${itemName(it)}: level ${it.level} / ${content.gems.maxLevel}`];
  }

  private updateCurrency(): void {
    const i = this.inputs;
    const rows = this.currencyRows();
    if (i.pressed("down")) this.row = (this.row + 1) % rows.length;
    if (i.pressed("up")) this.row = (this.row - 1 + rows.length) % rows.length;
    this.row = Math.min(this.row, rows.length - 1);
    const r = rows[this.row];
    if (r?.kind === "salvage" && r.what !== "rare") this.confirmReset = false;
    if (!r || !i.pressed("confirm")) return;
    if (r.kind === "currency") {
      if ((this.world().player.save.currency[r.id] ?? 0) < 1) {
        this.message = `You have no ${currencyName(r.id)}.`;
        return;
      }
      if (this.craftTargets(r.id).length === 0) {
        this.message = `Nothing you own can take a ${currencyName(r.id)} right now.`;
        return;
      }
      this.message = "";
      this.craft = { currency: r.id, index: 0, result: [] };
      return;
    }
    if (r.what === "rare" && !this.confirmReset) {
      this.confirmReset = true; // reused as "press again" for the rare bulk salvage
      this.message = `Salvage ${r.count} rare item(s)? Press ${i.prompt("confirm")} again.`;
      return;
    }
    this.confirmReset = false;
    const before = { ...this.world().player.save.currency };
    const refused = this.actions.command({ type: "salvage_bulk", what: r.what });
    this.message = refused ? `Can't: ${refused}` : `Salvaged ${r.count}: ${this.currencyGains(before).join(", ")}`;
    this.diffCache = null;
  }

  /** "+3 Whetstone Fragment" lines for what the stash gained since `before` (combined fragments show as the full currency). */
  private currencyGains(before: Record<string, number>): string[] {
    const now = this.world().player.save.currency;
    return Object.keys(now)
      .map((id) => ({ id, d: (now[id] ?? 0) - (before[id] ?? 0) }))
      .filter((x) => x.d > 0)
      .map((x) => `+${x.d} ${currencyName(x.id)}`);
  }

  private updateCraft(): void {
    const i = this.inputs;
    const c = this.craft!;
    if (i.pressed("cancel")) {
      this.craft = null;
      return;
    }
    const targets = this.craftTargets(c.currency);
    if (targets.length === 0) return;
    if (i.pressed("down")) c.index = (c.index + 1) % targets.length;
    if (i.pressed("up")) c.index = (c.index - 1 + targets.length) % targets.length;
    c.index = Math.min(c.index, targets.length - 1);
    if (!i.pressed("confirm")) return;
    const target = targets[c.index]!;
    const before = this.itemLines(target);
    const refused = this.actions.command({ type: "apply_currency", currency: c.currency, target });
    if (refused) {
      c.result = [`Can't: ${refused}`];
      return;
    }
    // Show what changed: lines that appeared (+) and disappeared (−).
    const after = this.itemLines(target);
    const added = after.slice(1).filter((l) => l && !before.includes(l)).map((l) => `  + ${l}`);
    const removed = before.slice(1).filter((l) => l && !after.includes(l)).map((l) => `  − ${l}`);
    c.result = [`Used ${currencyName(c.currency)} on ${after[0] ?? "item"}:`, ...(added.length + removed.length ? [...added, ...removed] : ["  nothing changed"])];
    this.diffCache = null;
    // Keep pointing at the same item if it can still take this currency.
    const still = this.craftTargets(c.currency).findIndex((t) => JSON.stringify(t) === JSON.stringify(target));
    if (still >= 0) c.index = still;
    if ((this.world().player.save.currency[c.currency] ?? 0) < 1) c.result.push("", `That was your last ${currencyName(c.currency)}.`);
  }

  private currencyLines(): { left: string[]; right: string[] } {
    const save = this.world().player.save;
    const rows = this.currencyRows();
    const left = ["CURRENCY STASH (no limit)", ""];
    rows.forEach((r, k) => {
      const mark = k === this.row ? "▶" : " ";
      if (r.kind === "currency") {
        const frag = fragmentOf(r.id);
        const fragText = frag ? `   fragments ${save.currency[frag.id] ?? 0}/${frag.combine!.count}` : "";
        left.push(`${mark} ${currencyName(r.id).padEnd(16)} ×${String(save.currency[r.id] ?? 0).padEnd(4)}${fragText}`);
      } else {
        if (rows[k - 1]?.kind === "currency") left.push("", "SALVAGE");
        left.push(`${mark} ${r.label} (${r.count})`);
      }
    });

    const right: string[] = [];
    const r = rows[this.row];
    if (this.craft) {
      const c = this.craft;
      const targets = this.craftTargets(c.currency);
      right.push(`${currencyName(c.currency)} ×${save.currency[c.currency] ?? 0}: choose an item`, "");
      const first = Math.max(0, Math.min(c.index - Math.floor(CRAFT_ROWS / 2), targets.length - CRAFT_ROWS));
      targets.slice(first, first + CRAFT_ROWS).forEach((t, k) => right.push(`${first + k === c.index ? "▶" : " "} ${this.targetLabel(t)}`));
      if (targets.length === 0) right.push("  (nothing left that this can be used on)");
      right.push("", ...this.itemLines(targets[c.index]).slice(0, 16));
      if (c.result.length) right.push("", ...c.result);
    } else if (r?.kind === "currency") {
      const def = content.currencies.find((x) => x.id === r.id)!;
      const frag = fragmentOf(r.id);
      right.push(def.name, "", def.description, "");
      if (frag) right.push(`${frag.name}s come from salvaging and drops; ${frag.combine!.count} combine into one automatically.`, "");
      right.push(`Usable on ${this.craftTargets(r.id).length} of your items. Press ${this.inputs.prompt("confirm")} to choose one.`);
    } else if (r) {
      right.push(r.label, "", "Salvaging destroys the items for currency fragments:");
      const s = content.crafting.salvage;
      right.push(
        `  normal gear → ${s.gear.normal.count} ${currencyName(s.gear.normal.currency)}`,
        `  magic gear → ${s.gear.magic.count} ${currencyName(s.gear.magic.currency)}`,
        `  rare gear → ${s.gear.rare.count} ${currencyName(s.gear.rare.currency)}`,
        `  unique (one at a time, Gear tab) → ${s.gear.unique.count} ${currencyName(s.gear.unique.currency)}`,
        `  skill gem → ${s.skill_gem.count} + ${s.skill_gem.perLevel ?? 0}/level ${currencyName(s.skill_gem.currency)}`,
        `  support gem → ${s.support_gem.count} ${currencyName(s.support_gem.currency)}`,
        "",
        "Equipped items are never salvaged. Single items: Gear tab, " + this.inputs.prompt("salvage") + ".",
      );
    }
    if (this.message) right.push("", this.message);
    return { left, right };
  }

  // ---------------------------------------------------------------- debug

  private debugRows(): Choice[] {
    const rows: Choice[] = [];
    const seed = () => (Date.now() ^ (Math.random() * 2 ** 31)) >>> 0;
    for (const rarity of ["normal", "magic", "rare"] as const) {
      rows.push({ label: `Give random ${rarity} item (item level ${this.world().monsterLevel})`, run: () => this.actions.command({ type: "debug_give_gear", opts: { rarity }, seed: seed() }) });
    }
    for (const u of content.uniques) rows.push({ label: `Give unique: ${u.name}`, run: () => this.actions.command({ type: "debug_give_gear", opts: { unique: u.id }, seed: seed() }) });
    for (const b of content.itemBases.filter((x) => x.slot === "weapon")) {
      rows.push({ label: `Give rare weapon: ${b.name}`, run: () => this.actions.command({ type: "debug_give_gear", opts: { base: b.id, rarity: "rare" }, seed: seed() }) });
    }
    rows.push({
      label: "Give 5 of every currency",
      run: () => {
        for (const c of FULL_CURRENCIES) this.actions.command({ type: "debug_give_currency", currency: c.id, count: 5 });
        return null;
      },
    });
    for (const s of content.skills) rows.push({ label: `Give skill gem: ${s.name}`, run: () => this.actions.command({ type: "debug_give", kind: "skill_gem", defId: s.id }) });
    for (const s of content.supports) rows.push({ label: `Give support gem: ${s.name}`, run: () => this.actions.command({ type: "debug_give", kind: "support_gem", defId: s.id }) });
    rows.push({
      label: this.confirmReset ? "Reset character: press again to confirm (deletes your save)" : "Reset character",
      run: () => {
        if (!this.confirmReset) {
          this.confirmReset = true;
          return null;
        }
        this.actions.resetCharacter();
        return null;
      },
    });
    return rows;
  }

  private updateDebug(): void {
    const i = this.inputs;
    const rows = this.debugRows();
    if (i.pressed("down")) this.row = (this.row + 1) % rows.length;
    if (i.pressed("up")) this.row = (this.row - 1 + rows.length) % rows.length;
    if (this.row !== rows.length - 1) this.confirmReset = false;
    if (i.pressed("confirm")) {
      const refused = rows[this.row]!.run();
      this.message = refused ? `Can't: ${refused}` : this.row < rows.length - 1 ? `Added: ${rows[this.row]!.label.replace(/^Give [a-z ]+: /, "")}` : "";
    }
  }

  // ---------------------------------------------------------------- layout

  private render(): void {
    const { width, height } = this.scene.scale;
    const w = Math.min(1040, width - 32);
    const h = Math.min(600, height - 100);
    const x = (width - w) / 2;
    const y = Math.max(16, (height - h) / 2 - 20);
    this.bg.setPosition(x, y).setSize(w, h);
    const tabs = TABS.map((t) => (t === this.tab ? `[ ${t.toUpperCase()} ]` : `  ${t}  `)).join("  ");
    const pad = this.inputs.device === "pad";
    this.header.setPosition(x + 16, y + 12).setText(`${pad ? "L1" : "Q"} ◀  ${tabs}  ▶ ${pad ? "R1" : "Tab"}      (game paused)`);
    this.footer.setPosition(x + 16, y + h - 26);
    this.left.setPosition(x + 16, y + 48);
    this.right.setPosition(x + 16 + Math.min(560, w * 0.56), y + 48).setWordWrapWidth(w - Math.min(560, w * 0.56) - 32);
    const close = `[${this.inputs.prompt("cancel")}] ${this.picker || this.craft ? "back" : "close"}`;
    const gearTab = this.tab === "gear";
    this.left.setVisible(!gearTab);
    this.right.setVisible(!gearTab);
    for (const t of [...this.gearRows, ...this.diffRows, this.tip.title, this.tip.body, this.tip.cmpTitle, this.tip.cmpBody]) t.setVisible(gearTab);
    if (gearTab) {
      this.renderGear(x, y, w);
      this.footer.setText(`${pad ? "D-pad select   ✕ equip / take off   □ salvage" : "W/S select   Enter equip / take off   X salvage"}   ${close}      Gear bag ${this.world().player.save.gearBag.length}/${content.gear.bagSize}`);
      return;
    }

    if (this.tab === "character") {
      this.left.setText(this.characterLines());
      this.right.setText("");
      this.footer.setText(close);
    } else if (this.tab === "gems") {
      const { left, right } = this.inventoryLines();
      this.left.setText(left);
      this.right.setText(right);
      const nav = pad ? "D-pad move   ✕ choose" : "WASD move   Enter choose";
      this.footer.setText(`${nav}   ${close}      Feed duplicate skill gems to level them; sockets grow with level.`);
    } else if (this.tab === "currency") {
      const { left, right } = this.currencyLines();
      this.left.setText(left);
      this.right.setText(right);
      const nav = pad ? (this.craft ? "D-pad pick item   ✕ use (repeat)" : "D-pad select   ✕ use / salvage") : this.craft ? "W/S pick item   Enter use (repeat)" : "W/S select   Enter use / salvage";
      this.footer.setText(`${nav}   ${close}`);
    } else {
      const rows = this.debugRows();
      const first = Math.max(0, Math.min(this.row - 8, rows.length - 18));
      this.left.setText(rows.slice(first, first + 18).map((r, k) => `${first + k === this.row ? "▶" : " "} ${r.label}`));
      this.right.setText(["DEBUG", "", "Spawns gems, gear and currency straight into your bags", "(gear at the current zone's item level).", "", this.message]);
      this.footer.setText(`${pad ? "D-pad select   ✕ give" : "W/S select   Enter give"}   ${close}`);
    }
  }

  private characterLines(): string[] {
    const w = this.world();
    const p = w.player;
    const s = p.stats;
    const need = xpToNext(p.level, content.progression);
    const r = (n: number | undefined) => Math.round(n ?? 0);
    const points = (p.level - 1) * content.progression.passivePointsPerLevel;
    const lines = [
      `Level ${p.level}   XP ${r(p.xp)} / ${Number.isFinite(need) ? need : "max"}   Passive points ${points} (tree later)`,
      `Zones cleared ${w.zonesCleared}   Death costs ${content.progression.deathXpPenalty}% of a level's XP (never a level)`,
      ``,
      `Strength ${r(s.strength)}   Dexterity ${r(s.dexterity)}   Intelligence ${r(s.intelligence)}`,
      `Life ${r(p.maxLife)}   Mana ${r(p.maxMana)} (+${(s.mana_regen ?? 0).toFixed(1)}/s)`,
      `Armour ${r(s.armour)}   Evasion ${r(s.evasion)}   Accuracy ${r(s.accuracy)}   Move speed ${r(p.speed)}`,
      `Resist  fire ${r(s.fire_resistance)}%  cold ${r(s.cold_resistance)}%  lightning ${r(s.lightning_resistance)}%  chaos ${r(s.chaos_resistance)}%`,
      ``,
    ];
    for (let i = 0; i <= SKILL_SLOTS; i++) {
      const sum = skillSummary(w, content, i);
      if (!sum) continue;
      const range = Object.entries(sum.ranges)
        .map(([t, [lo, hi]]) => `${r(lo)}-${r(hi)} ${t}`)
        .join(", ");
      const gem = i > 0 ? p.save.skillBar[i - 1] : null;
      const slot = i === 0 ? "Weapon attack" : `Skill ${i} [${this.inputs.skillPrompt(i - 1)}]`;
      lines.push(`${slot}: ${sum.name}${gem ? ` (Lv${gem.level})` : ""}`);
      const root = p.compiled[i]?.nodes[0];
      const lifeLeech = root ? computeStat("life_leech", 0, root.mods, root.tags) : 0;
      const manaLeech = root ? computeStat("mana_leech", 0, root.mods, root.tags) : 0;
      const leech = [lifeLeech && `${lifeLeech}% life leech`, manaLeech && `${manaLeech}% mana leech`].filter(Boolean).join(", ");
      lines.push(`   ${range}  ·  ${sum.usesPerSecond.toFixed(2)}/s  ·  crit ${sum.critChance.toFixed(1)}%  ·  DPS ${sum.dps.toFixed(1)}${sum.cost ? `  ·  ${sum.cost.toFixed(1)} mana` : ""}${leech ? `  ·  ${leech}` : ""}`);
    }
    return lines;
  }
}
