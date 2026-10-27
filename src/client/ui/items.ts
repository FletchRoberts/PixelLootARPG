// Display helpers for items: names, rarity colours, icon texture keys, tooltip lines.
// Client-only; the numbers and text come from the sim (itemText).

import { content } from "../../data";
import { mapModLines, rewardLine, stoneName } from "../../sim/items/cairnstone";
import { itemText } from "../../sim/items/gear";
import type { CairnstoneItem, GearItem, Item, Rarity } from "../../sim/items/types";

export const RARITY_COLOR: Record<Rarity, string> = {
  normal: "#c8c8c8",
  magic: "#8a8aff",
  rare: "#ffff77",
  unique: "#e08a3a",
};
export const GEM_COLOR = "#4ad8c8"; // PoE-style teal for gems
export const CURRENCY_COLOR = "#d8b86a";

export const currencyName = (id: string) => content.currencies.find((c) => c.id === id)?.name ?? id;

export function itemName(item: Item): string {
  if (item.kind === "currency") return `${item.count > 1 ? `${item.count}× ` : ""}${currencyName(item.id)}`;
  if (item.kind === "cairnstone") return `${stoneName(content, item)} (lvl ${item.level})`;
  if (item.kind === "gear") return itemText(content, item).name;
  if (item.kind === "skill_gem") return `${content.skills.find((s) => s.id === item.defId)?.name ?? item.defId}${item.level > 1 ? ` (Lv${item.level})` : ""}`;
  return `${content.supports.find((s) => s.id === item.defId)?.name ?? item.defId} Support`;
}

export function itemColor(item: Item): string {
  if (item.kind === "gear" || item.kind === "cairnstone") return RARITY_COLOR[item.rarity];
  return item.kind === "currency" ? CURRENCY_COLOR : GEM_COLOR;
}

export function itemTextureKey(item: Item): string {
  if (item.kind === "currency") return `currency:${item.id}`;
  if (item.kind === "cairnstone") return "cairnstone";
  return item.kind === "gear" ? `gear:${item.base}` : `gem:${item.kind}:${item.defId}`;
}

/** Tooltip as lines: title first (shown in rarity colour), then details. */
export function gearTooltip(item: GearItem): { title: string; lines: string[] } {
  const t = itemText(content, item);
  const lines: string[] = [];
  if (t.name !== t.baseName) lines.push(t.baseName);
  lines.push(`${item.rarity[0]!.toUpperCase()}${item.rarity.slice(1)} · item level ${item.ilvl}`);
  if (t.requires) lines.push(t.requires);
  if (t.implicits.length) lines.push("", ...t.implicits);
  if (t.mods.length) lines.push("", ...t.mods);
  if (t.grants.length) lines.push("", ...t.grants.map((g) => `★ ${g}`));
  if (t.flavour) lines.push("", `"${t.flavour}"`);
  if (t.corrupted) lines.push("", "Corrupted");
  return { title: t.name, lines };
}

/** Cairnstone tooltip: title (rarity colour), then level, mods and rewards. */
export function stoneTooltip(stone: CairnstoneItem): { title: string; lines: string[] } {
  const lines = [`Cairnstone · level ${stone.level} · ${stone.rarity}`];
  if (stone.mods.length) lines.push("", ...mapModLines(content, stone.mods), "", `Rewards: ${rewardLine(content, stone.mods)}`);
  if (stone.corrupted) lines.push("", "Corrupted");
  return { title: stoneName(content, stone), lines };
}
