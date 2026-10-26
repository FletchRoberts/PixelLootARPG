// Pause menu with tabs: Character (stats sheet) and Skills (debug loadout editor:
// weapon, skill slots and support sockets). Fully usable with keyboard or controller.

import Phaser from "phaser";
import { content } from "../../data";
import { describeSkill } from "../../sim/skills/describe";
import { weaponAttackSkill, supportFits } from "../../sim/skills/compile";
import type { Loadout } from "../../sim/skills/types";
import { xpToNext } from "../../sim/stats/character";
import { skillSummary, SKILL_SLOTS, type WorldState } from "../../sim/world";
import type { InputManager } from "../input/InputManager";

export type MenuTab = "character" | "skills";
const TABS: MenuTab[] = ["character", "skills"];
const SOCKETS = 4; // debug: every skill gets 4 support sockets until gems exist
const NONE = "none";

interface Row {
  label: string;
  options: string[]; // ids, NONE first where allowed
  current: string;
  names: (id: string) => string;
  apply: (id: string) => Loadout;
  describe: number; // compiled skill index to show on the right
}

const FONT = { fontFamily: "monospace", fontSize: "14px", color: "#d8d8e0" };

export class GameMenu {
  open = false;
  private tab: MenuTab = "character";
  private selected = 0;
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
    private onLoadout: (l: Loadout) => void,
  ) {
    this.bg = scene.add.rectangle(0, 0, 10, 10, 0x0b0b10, 0.94).setOrigin(0).setStrokeStyle(1, 0x3a3a48);
    this.header = scene.add.text(0, 0, "", { ...FONT, fontSize: "16px" });
    this.left = scene.add.text(0, 0, "", { ...FONT, lineSpacing: 4 });
    this.right = scene.add.text(0, 0, "", { ...FONT, fontSize: "13px", color: "#a8c8e8", lineSpacing: 4 });
    this.footer = scene.add.text(0, 0, "", { ...FONT, fontSize: "12px", color: "#8a8a96" });
    this.root = scene.add.container(0, 0, [this.bg, this.header, this.left, this.right, this.footer]).setScrollFactor(0).setDepth(35_000).setVisible(false);
  }

  show(tab: MenuTab): void {
    this.open = true;
    this.tab = tab;
    this.selected = 0;
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
    if (i.pressed("cancel") || i.pressed("character") || (this.tab === "skills" && i.pressed("inventory"))) return this.hide();
    if (i.pressed("tabNext") || i.pressed("tabPrev")) {
      const dir = i.pressed("tabNext") ? 1 : -1;
      this.tab = TABS[(TABS.indexOf(this.tab) + dir + TABS.length) % TABS.length]!;
      this.selected = 0;
    }
    if (this.tab === "skills") {
      const rows = this.rows();
      if (i.pressed("down")) this.selected = (this.selected + 1) % rows.length;
      if (i.pressed("up")) this.selected = (this.selected - 1 + rows.length) % rows.length;
      const change = i.pressed("right") || i.pressed("confirm") ? 1 : i.pressed("left") ? -1 : 0;
      const row = rows[this.selected];
      if (change && row && row.options.length > 1) {
        const at = Math.max(0, row.options.indexOf(row.current));
        this.onLoadout(row.apply(row.options[(at + change + row.options.length) % row.options.length]!));
      }
    }
    this.render();
  }

  private render(): void {
    const { width, height } = this.scene.scale;
    const w = Math.min(980, width - 32);
    const h = Math.min(560, height - 120);
    const x = (width - w) / 2;
    const y = Math.max(16, (height - h) / 2 - 20);
    this.bg.setPosition(x, y).setSize(w, h);
    const tabs = TABS.map((t) => (t === this.tab ? `[ ${t.toUpperCase()} ]` : `  ${t}  `)).join("   ");
    const prev = this.inputs.device === "pad" ? "L1" : "Q";
    const next = this.inputs.device === "pad" ? "R1" : "Tab";
    this.header.setPosition(x + 16, y + 12).setText(`${prev} ◀  ${tabs}  ▶ ${next}      (game paused)`);
    this.footer.setPosition(x + 16, y + h - 26);

    if (this.tab === "character") {
      this.left.setPosition(x + 16, y + 48).setText(this.characterLines());
      this.right.setText("");
      this.footer.setText(`[${this.inputs.prompt("cancel")}] close`);
      return;
    }

    const rows = this.rows();
    this.selected = Math.min(this.selected, rows.length - 1);
    const lines = rows.map((r, idx) => {
      const mark = idx === this.selected ? "▶" : " ";
      return `${mark} ${r.label.padEnd(22)} ‹ ${r.names(r.current)} ›`;
    });
    this.left.setPosition(x + 16, y + 48).setText(lines);
    const sel = rows[this.selected];
    const compiled = sel ? this.world().player.compiled[sel.describe] : null;
    this.right.setPosition(x + 16 + 470, y + 48).setWordWrapWidth(w - 500).setText(compiled ? describeSkill(compiled) : ["(empty slot)"]);
    const nav = this.inputs.device === "pad" ? "D-pad ↑↓ select   ←→ / ✕ change" : "W/S select   A/D or Enter change";
    this.footer.setText(`${nav}   [${this.inputs.prompt("cancel")}] close      Debug loadout: gems and sockets will come from loot later.`);
  }

  private rows(): Row[] {
    const l = this.world().player.loadout;
    const clone = (): Loadout => ({ weapon: l.weapon, attackSupports: [...l.attackSupports], slots: l.slots.map((s) => ({ skill: s.skill, supports: [...s.supports] })) });
    const weaponName = (id: string) => content.weapons.find((w) => w.id === id)?.name ?? id;
    const skillName = (id: string) => (id === NONE ? "—" : (content.skills.find((s) => s.id === id)?.name ?? id));
    const supportName = (id: string) => (id === NONE ? "—" : (content.supports.find((s) => s.id === id)?.name ?? id));
    const rows: Row[] = [];

    rows.push({
      label: "Weapon",
      options: content.weapons.map((w) => w.id),
      current: l.weapon,
      names: weaponName,
      apply: (id) => ({ ...clone(), weapon: id, attackSupports: [] }),
      describe: 0,
    });
    const weapon = content.weapons.find((w) => w.id === l.weapon)!;
    this.socketRows(rows, "  Attack support", weaponAttackSkill(weapon), l.attackSupports, supportName, 0, (supports) => ({ ...clone(), attackSupports: supports }));

    for (let s = 0; s < SKILL_SLOTS; s++) {
      const slot = l.slots[s]!;
      rows.push({
        label: `Skill ${s + 1} [${this.inputs.skillPrompt(s)}]`,
        options: [NONE, ...content.skills.map((k) => k.id)],
        current: slot.skill ?? NONE,
        names: skillName,
        apply: (id) => {
          const next = clone();
          next.slots[s] = { skill: id === NONE ? null : id, supports: [] };
          return next;
        },
        describe: s + 1,
      });
      const def = slot.skill ? content.skills.find((k) => k.id === slot.skill) : undefined;
      if (def) {
        this.socketRows(rows, "  Support", def, slot.supports, supportName, s + 1, (supports) => {
          const next = clone();
          next.slots[s] = { skill: slot.skill, supports };
          return next;
        });
      }
    }
    return rows;
  }

  private socketRows(
    rows: Row[],
    label: string,
    skill: Parameters<typeof supportFits>[1],
    current: string[],
    names: (id: string) => string,
    describe: number,
    apply: (supports: string[]) => Loadout,
  ): void {
    const fitting = content.supports.filter((sp) => supportFits(sp, skill)).map((sp) => sp.id);
    for (let k = 0; k < SOCKETS; k++) {
      const here = current[k] ?? NONE;
      const usedElsewhere = new Set(current.filter((_, j) => j !== k));
      rows.push({
        label: `${label} ${k + 1}`,
        options: [NONE, ...fitting.filter((id) => !usedElsewhere.has(id))],
        current: here,
        names,
        apply: (id) => {
          const next = [...current];
          while (next.length <= k) next.push(NONE);
          next[k] = id;
          return apply(next.filter((v) => v !== NONE));
        },
        describe,
      });
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
      const slot = i === 0 ? "Weapon attack" : `Skill ${i} [${this.inputs.skillPrompt(i - 1)}]`;
      lines.push(`${slot}: ${sum.name}`);
      lines.push(`   ${range}  ·  ${sum.usesPerSecond.toFixed(2)}/s  ·  crit ${sum.critChance.toFixed(1)}%  ·  DPS ${sum.dps.toFixed(1)}${sum.cost ? `  ·  ${sum.cost.toFixed(1)} mana` : ""}`);
    }
    return lines;
  }
}
