// Crafting currency: the stash (with fragments that combine 10 → 1), currency effects on
// gear and gems, and salvaging unwanted items into fragments.
// Every currency's behaviour is a named effect here, referenced by id from currencies.json.

import type { Rng } from "../core/rng";
import type { CraftingRules, Currency, GemRules, ItemBase } from "../data/types";
import { rareName, rollAffix, rollMods, rollRange, type GearContent } from "./gear";
import { raiseGemLevel } from "./gems";
import type { CharacterSave, EquipSlot, GearItem, GemItem } from "./types";

export interface CraftingContent extends GearContent {
  currencies: Currency[];
  crafting: CraftingRules;
  gems: GemRules;
}

/** Add currency to the stash; fragments combine into their full currency as soon as there are enough. */
export function addCurrency(save: CharacterSave, id: string, count: number, content: { currencies: Currency[] }): void {
  save.currency[id] = (save.currency[id] ?? 0) + count;
  for (let guard = 0; guard < 8; guard++) {
    const def = content.currencies.find((c) => c.id === id);
    const have = save.currency[id] ?? 0;
    if (!def?.combine || have < def.combine.count) return;
    const made = Math.floor(have / def.combine.count);
    save.currency[id] = have - made * def.combine.count;
    save.currency[def.combine.into] = (save.currency[def.combine.into] ?? 0) + made;
    id = def.combine.into; // the full currency could itself combine further
  }
}

// ---------------------------------------------------------------- targets

/** Something currency can be used on: worn or bagged gear, a skill gem on the bar or in the gem bag. */
export type CraftTarget =
  | { where: "equipped"; slot: EquipSlot }
  | { where: "gear_bag"; index: number }
  | { where: "skill"; slot: number }
  | { where: "gem_bag"; index: number };

export function targetItem(save: CharacterSave, t: CraftTarget): GearItem | GemItem | undefined {
  switch (t.where) {
    case "equipped":
      return save.equipment[t.slot];
    case "gear_bag":
      return save.gearBag[t.index];
    case "skill":
      return save.skillBar[t.slot] ?? undefined;
    case "gem_bag":
      return save.gemBag[t.index];
  }
}

/** Every item in the save a currency could target, in display order (worn, gear bag, skill bar, gem bag). */
export function allTargets(save: CharacterSave): CraftTarget[] {
  const out: CraftTarget[] = [];
  for (const slot of Object.keys(save.equipment) as EquipSlot[]) if (save.equipment[slot]) out.push({ where: "equipped", slot });
  save.gearBag.forEach((_, index) => out.push({ where: "gear_bag", index }));
  save.skillBar.forEach((g, slot) => g && out.push({ where: "skill", slot }));
  save.gemBag.forEach((_, index) => out.push({ where: "gem_bag", index }));
  return out;
}

// ---------------------------------------------------------------- effects

const MAGIC_MAX = 2;
const RARE_MAX = 6;

/** Why this currency can't be used on this item, or null if it can. Doesn't roll anything. */
export function currencyProblem(content: CraftingContent, currencyId: string, item: GearItem | GemItem | undefined): string | null {
  const def = content.currencies.find((c) => c.id === currencyId);
  if (!def || def.effect === "none") return "can't be used directly";
  if (!item) return "no item";
  if (def.effect === "gem_level") {
    if (item.kind !== "skill_gem") return "only works on skill gems";
    return item.level >= content.gems.maxLevel ? "gem is max level" : null;
  }
  if (item.kind !== "gear") return "only works on gear";
  if (item.corrupted) return "item is corrupted";
  const r = item.rarity;
  const n = item.mods.length;
  switch (def.effect) {
    case "upgrade_magic":
    case "normal_to_rare":
      return r === "normal" ? null : "needs a normal item";
    case "reroll_magic":
      return r === "magic" ? null : "needs a magic item";
    case "add_magic_mod":
      return r !== "magic" ? "needs a magic item" : n >= MAGIC_MAX ? "item has no room for a mod" : null;
    case "upgrade_rare":
      return r === "magic" ? null : "needs a magic item";
    case "add_rare_mod":
      return r !== "rare" ? "needs a rare item" : n >= RARE_MAX ? "item has no room for a mod" : null;
    case "remove_mod":
      return r !== "magic" && r !== "rare" ? "needs a magic or rare item" : n === 0 ? "item has no mods" : null;
    case "chaos":
      return r !== "rare" ? "needs a rare item" : null;
    case "reroll_values":
      return n > 0 || item.unique ? null : "item has no mods";
    case "corrupt":
      return null;
  }
  return `unknown effect ${def.effect}`;
}

/**
 * Use one of a currency on an item. Returns null on success or why it was refused (nothing is
 * spent when refused). All randomness comes from `rng`.
 */
export function applyCurrency(save: CharacterSave, content: CraftingContent, currencyId: string, target: CraftTarget, rng: Rng): string | null {
  if ((save.currency[currencyId] ?? 0) < 1) return "you have none";
  const item = targetItem(save, target);
  const problem = currencyProblem(content, currencyId, item);
  if (problem) return problem;
  const effect = content.currencies.find((c) => c.id === currencyId)!.effect;
  const refused = item!.kind === "gear" ? gearEffect(content, effect, item!, rng) : (raiseGemLevel(item!, 1, content.gems), null);
  if (refused) return refused;
  save.currency[currencyId]! -= 1;
  return null;
}

function gearEffect(content: CraftingContent, effect: string, item: GearItem, rng: Rng): string | null {
  const base = content.itemBases.find((b) => b.id === item.base);
  if (!base) return "unknown item";
  switch (effect) {
    case "upgrade_magic":
    case "reroll_magic":
      item.rarity = "magic";
      rollMods(content, rng, base, item, "magic");
      return null;
    case "normal_to_rare":
      return makeRare(content, rng, base, item);
    case "upgrade_rare":
      item.rarity = "rare";
      item.name = rareName(content, rng);
      addMod(content, rng, base, item);
      return null;
    case "add_magic_mod":
    case "add_rare_mod":
      return addMod(content, rng, base, item) ? null : "no mod can be added";
    case "remove_mod":
      item.mods.splice(rng.int(0, item.mods.length - 1), 1);
      return null;
    case "chaos":
      if (item.mods.length > 0) item.mods.splice(rng.int(0, item.mods.length - 1), 1);
      addMod(content, rng, base, item);
      return null;
    case "reroll_values":
      rerollValues(content, rng, base, item);
      return null;
    case "corrupt":
      corrupt(content, rng, base, item);
      return null;
  }
  return `unknown effect ${effect}`;
}

function addMod(content: CraftingContent, rng: Rng, base: ItemBase, item: GearItem): boolean {
  const mod = rollAffix(content, rng, base, item, item.rarity === "rare" ? content.gear.maxPerKind.rare : content.gear.maxPerKind.magic);
  if (mod) item.mods.push(mod);
  return !!mod;
}

function makeRare(content: CraftingContent, rng: Rng, base: ItemBase, item: GearItem): null {
  item.rarity = "rare";
  item.name = rareName(content, rng);
  rollMods(content, rng, base, item, "rare");
  return null;
}

/** New numbers within each mod's current tier (and implicits / unique ranges). */
function rerollValues(content: CraftingContent, rng: Rng, base: ItemBase, item: GearItem): void {
  item.implicits = (base.implicits ?? []).map((m) => rollRange(rng, m.value));
  for (const m of item.mods) {
    const tier = content.affixes.find((a) => a.id === m.affix)?.tiers.find((t) => t.tier === m.tier);
    if (tier) m.values = tier.values.map((r) => rollRange(rng, r));
  }
  const u = item.unique ? content.uniques.find((x) => x.id === item.unique) : undefined;
  if (u) item.uniqueValues = u.mods.map((m) => rollRange(rng, m.value));
}

/** Void Pearl: one weighted outcome from crafting.json, then the item is locked. */
function corrupt(content: CraftingContent, rng: Rng, base: ItemBase, item: GearItem): void {
  const outcome = rng.weighted(content.crafting.corruption)?.outcome ?? "nothing";
  const u = item.unique ? content.uniques.find((x) => x.id === item.unique) : undefined;
  if (outcome === "reroll_rare") {
    if (u) rerollValues(content, rng, base, item);
    else makeRare(content, rng, base, item);
  } else if (outcome === "tier_up") {
    if (u) item.uniqueValues = u.mods.map((m) => m.value[1]); // perfect rolls
    else {
      // A random mod that has a better tier moves up one, ignoring item level.
      const better = item.mods
        .map((m) => ({ m, next: content.affixes.find((a) => a.id === m.affix)?.tiers.find((t) => t.tier === m.tier - 1) }))
        .filter((x) => x.next);
      const pick = better[rng.int(0, Math.max(0, better.length - 1))];
      if (pick?.next) {
        pick.m.tier = pick.next.tier;
        pick.m.values = pick.next.values.map((r) => rollRange(rng, r));
      }
    }
  } else if (outcome === "lose_mod" && item.mods.length > 0) {
    item.mods.splice(rng.int(0, item.mods.length - 1), 1);
  }
  item.corrupted = true;
}

// ---------------------------------------------------------------- salvage

/** What salvaging this item gives. */
export function salvageYield(content: CraftingContent, item: GearItem | GemItem): { currency: string; count: number } {
  const rules = content.crafting.salvage;
  if (item.kind === "gear") {
    const y = rules.gear[item.rarity];
    return { currency: y.currency, count: y.count };
  }
  const y = rules[item.kind];
  return { currency: y.currency, count: y.count + (y.perLevel ?? 0) * (item.level - 1) };
}

/** Destroy a bagged item for currency fragments. A skill gem's socketed supports go back to the gem bag. */
export function salvage(save: CharacterSave, content: CraftingContent, bag: "gear" | "gems", index: number): string | null {
  const item = bag === "gear" ? save.gearBag[index] : save.gemBag[index];
  if (!item) return "no item there";
  const y = salvageYield(content, item);
  if (bag === "gear") save.gearBag.splice(index, 1);
  else {
    save.gemBag.splice(index, 1);
    if (item.kind === "skill_gem") save.gemBag.push(...(item.sockets ?? []).filter((s): s is GemItem => !!s));
  }
  addCurrency(save, y.currency, y.count, content);
  return null;
}

export type BulkSalvage = "normal" | "magic" | "rare" | "spare_supports" | "spare_skill_gems";

/**
 * Salvage everything in a group at once. Uniques are never bulk-salvaged. Spare gems keep one
 * support of each kind, and the highest-level copy of each skill gem. Returns how many items went.
 */
export function salvageBulk(save: CharacterSave, content: CraftingContent, what: BulkSalvage): number {
  let count = 0;
  if (what === "normal" || what === "magic" || what === "rare") {
    for (let i = save.gearBag.length - 1; i >= 0; i--) {
      if (save.gearBag[i]!.rarity === what) count += salvage(save, content, "gear", i) === null ? 1 : 0;
    }
    return count;
  }
  const kind = what === "spare_supports" ? "support_gem" : "skill_gem";
  const keep = new Map<string, GemItem>();
  for (const g of save.gemBag) {
    if (g.kind !== kind) continue;
    const best = keep.get(g.defId);
    if (!best || g.level > best.level) keep.set(g.defId, g);
  }
  const kept = new Set(keep.values());
  for (let i = save.gemBag.length - 1; i >= 0; i--) {
    const g = save.gemBag[i]!;
    if (g.kind === kind && !kept.has(g)) count += salvage(save, content, "gems", i) === null ? 1 : 0;
  }
  return count;
}
