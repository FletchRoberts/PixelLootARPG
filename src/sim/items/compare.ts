// "What changes if I equip this?": the character's key numbers before and after a change.
// Both sides come from the real stat and skill pipeline, so the comparison is exact.

import { skillSummary, SKILL_SLOTS, type SimContent, type WorldState } from "../world";

export interface StatChange {
  label: string;
  before: number;
  after: number;
  delta: number;
  better: boolean; // all compared stats are "higher is better"
  percent: boolean; // show as a percentage
}

const STATS: { label: string; read: (w: WorldState) => number; percent?: boolean }[] = [
  { label: "Life", read: (w) => w.player.maxLife },
  { label: "Mana", read: (w) => w.player.maxMana },
  { label: "Mana regen /s", read: (w) => w.player.stats.mana_regen ?? 0 },
  { label: "Armour", read: (w) => w.player.stats.armour ?? 0 },
  { label: "Evasion", read: (w) => w.player.stats.evasion ?? 0 },
  { label: "Accuracy", read: (w) => w.player.stats.accuracy ?? 0 },
  { label: "Strength", read: (w) => w.player.stats.strength ?? 0 },
  { label: "Dexterity", read: (w) => w.player.stats.dexterity ?? 0 },
  { label: "Intelligence", read: (w) => w.player.stats.intelligence ?? 0 },
  { label: "Fire resistance", read: (w) => w.player.stats.fire_resistance ?? 0, percent: true },
  { label: "Cold resistance", read: (w) => w.player.stats.cold_resistance ?? 0, percent: true },
  { label: "Lightning resistance", read: (w) => w.player.stats.lightning_resistance ?? 0, percent: true },
  { label: "Chaos resistance", read: (w) => w.player.stats.chaos_resistance ?? 0, percent: true },
  { label: "Movement speed", read: (w) => w.player.speed },
];

export function compareWorlds(before: WorldState, after: WorldState, content: SimContent): StatChange[] {
  const rows = STATS.map((s) => ({ label: s.label, before: s.read(before), after: s.read(after), percent: !!s.percent }));
  // DPS for the weapon attack and each skill button (by the skill that's there).
  for (let i = 0; i <= SKILL_SLOTS; i++) {
    const a = skillSummary(before, content, i);
    const b = skillSummary(after, content, i);
    if (!a && !b) continue;
    const name = b?.name ?? a?.name ?? "";
    rows.push({ label: `${i === 0 ? "Attack" : `Skill ${i}`} DPS (${name})`, before: a?.dps ?? 0, after: b?.dps ?? 0, percent: false });
  }
  return rows
    .map((r) => ({ ...r, delta: r.after - r.before, better: r.after > r.before }))
    .filter((r) => Math.abs(r.delta) >= 0.05);
}
