// Display helpers for items: names, rarity colours, icon texture keys, tooltip lines.
// Client-only; the numbers and text come from the sim (itemText).

import { content } from "../../data";
import { itemText } from "../../sim/items/gear";
import type { GearItem, Item, Rarity } from "../../sim/items/types";

export const RARITY_COLOR: Record<Rarity, string> = {
  normal: "#c8c8c8",
  magic: "#8a8aff",
  rare: "#ffff77",
  unique: "#e08a3a",
};
export const GEM_COLOR = "#4ad8c8"; // PoE-style teal for gems

export function itemName(item: Item): string {
  if (item.kind === "gear") return itemText(content, item).name;
  if (item.kind === "skill_gem") return `${content.skills.find((s) => s.id === item.defId)?.name ?? item.defId}${item.level > 1 ? ` (Lv${item.level})` : ""}`;
  return `${content.supports.find((s) => s.id === item.defId)?.name ?? item.defId} Support`;
}

export function itemColor(item: Item): string {
  return item.kind === "gear" ? RARITY_COLOR[item.rarity] : GEM_COLOR;
}

export function itemTextureKey(item: Item): string {
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
  return { title: t.name, lines };
}
