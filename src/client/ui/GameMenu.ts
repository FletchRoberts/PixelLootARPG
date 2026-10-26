// Pause menu with tabs:
//   Character  stats sheet
//   Inventory  skill gems on the four buttons, support gems in their sockets, the bag
//   Debug      spawn gems, switch weapon, reset the character (until weapons drop)
// Fully usable with keyboard or controller: D-pad/WASD move, ✕/Enter confirm, ○/Esc back.

import Phaser from "phaser";
import { content } from "../../data";
import { gemXpToNext } from "../../sim/items/gems";
import { supportFitsTarget } from "../../sim/items/inventory";
import type { GemItem, SocketTarget } from "../../sim/items/types";
import { describeSkill } from "../../sim/skills/describe";
import { xpToNext } from "../../sim/stats/character";
import { skillSummary, SKILL_SLOTS, type InventoryCommand, type WorldState } from "../../sim/world";
import type { InputManager } from "../input/InputManager";

export type MenuTab = "character" | "inventory" | "debug";
const TABS: MenuTab[] = ["character", "inventory", "debug"];
const FONT = { fontFamily: "monospace", fontSize: "14px", color: "#d8d8e0" };

type Cell = { kind: "skill"; slot: number } | { kind: "socket"; target: SocketTarget; socket: number };

interface Choice {
  label: string;
  run: () => string | null; // null = done, string = refused (shown to the player)
}

export interface MenuActions {
  command(cmd: InventoryCommand): string | null;
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
    this.root = scene.add.container(0, 0, [this.bg, this.header, this.left, this.right, this.footer]).setScrollFactor(0).setDepth(35_000).setVisible(false);
  }

  show(tab: MenuTab): void {
    this.open = true;
    this.tab = tab;
    this.row = 0;
    this.col = 0;
    this.picker = null;
    this.message = "";
    this.confirmReset = false;
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
    if (i.pressed("cancel") || i.pressed("character") || i.pressed("inventory")) return this.hide();
    if (i.pressed("tabNext") || i.pressed("tabPrev")) {
      const dir = i.pressed("tabNext") ? 1 : -1;
      this.tab = TABS[(TABS.indexOf(this.tab) + dir + TABS.length) % TABS.length]!;
      this.row = 0;
      this.col = 0;
      this.message = "";
      this.confirmReset = false;
    }
    if (this.tab === "inventory") this.updateInventory();
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
      save.bag.forEach((g, bagIndex) => {
        if (g.kind === "skill_gem") choices.push({ label: `Equip ${gemName(g)}`, run: () => this.actions.command({ type: "equip", bagIndex, slot: cell.slot }) });
      });
      if (save.skillBar[cell.slot]) choices.push({ label: "Remove (back to bag, supports stay in it)", run: () => this.actions.command({ type: "unequip", slot: cell.slot }) });
      this.picker = { title: `Skill gem for button ${this.inputs.skillPrompt(cell.slot)}`, choices, index: 0 };
    } else {
      const seen = new Set<string>();
      save.bag.forEach((g, bagIndex) => {
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
    for (const g of save.bag) counts.set(gemName(g), (counts.get(gemName(g)) ?? 0) + 1);
    left.push("", `BAG ${save.bag.length}/${content.gems.bagSize}`);
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
        const need = gemXpToNext(g.level, content.gems);
        lines.push(`${skillName(g.defId)}: level ${g.level}, ${g.sockets?.length ?? 0} sockets`, `XP ${Math.floor(g.xp)} / ${Number.isFinite(need) ? need : "max"}`, "");
      } else lines.push("Empty button: press ✕ / Enter to equip a skill gem.", "");
    }
    if (compiled) lines.push(...describeSkill(compiled));
    return lines;
  }

  // ---------------------------------------------------------------- debug

  private debugRows(): Choice[] {
    const save = this.world().player.save;
    const rows: Choice[] = [];
    const weapon = content.weapons.find((x) => x.id === save.weapon);
    rows.push({ label: `Weapon ‹ ${weapon?.name ?? save.weapon} ›   (←/→ to change)`, run: () => null });
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
    if (this.row === 0 && (i.pressed("left") || i.pressed("right"))) {
      const ids = content.weapons.map((x) => x.id);
      const at = ids.indexOf(this.world().player.save.weapon);
      const next = ids[(at + (i.pressed("right") ? 1 : -1) + ids.length) % ids.length]!;
      this.message = this.actions.command({ type: "debug_weapon", weapon: next }) ?? "";
    }
    if (i.pressed("confirm") && this.row > 0) {
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
    const close = `[${this.inputs.prompt("cancel")}] ${this.picker ? "back" : "close"}`;

    if (this.tab === "character") {
      this.left.setText(this.characterLines());
      this.right.setText("");
      this.footer.setText(close);
    } else if (this.tab === "inventory") {
      const { left, right } = this.inventoryLines();
      this.left.setText(left);
      this.right.setText(right);
      const nav = pad ? "D-pad move   ✕ choose" : "WASD move   Enter choose";
      this.footer.setText(`${nav}   ${close}      Gems in sockets level with their skill; sockets grow as the skill gem levels.`);
    } else {
      const rows = this.debugRows();
      const first = Math.max(0, Math.min(this.row - 8, rows.length - 18));
      this.left.setText(rows.slice(first, first + 18).map((r, k) => `${first + k === this.row ? "▶" : " "} ${r.label}`));
      this.right.setText(["DEBUG", "", "Spawns gems straight into your bag", "and switches weapons until gear drops.", "", this.message]);
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
      `Armour ${r(s.armour)}   Evasion ${r(s.evasion)}   Accuracy ${r(s.accuracy)}`,
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
      lines.push(`   ${range}  ·  ${sum.usesPerSecond.toFixed(2)}/s  ·  crit ${sum.critChance.toFixed(1)}%  ·  DPS ${sum.dps.toFixed(1)}${sum.cost ? `  ·  ${sum.cost.toFixed(1)} mana` : ""}`);
    }
    return lines;
  }
}
