// Cairnstones (map items): rolling them, their text, the map they open, and the map stats
// their mods add up to. Map mods use the affix format (src/data/map-mods.json) with tiers
// gated by the stone's level, so the crafting currencies work on stones unchanged.

import { Rng } from "../core/rng";
import type { Affix, CairnstoneRules, GearRules } from "../data/types";
import { fill, rareName, rollAffix, rollMods } from "./gear";
import type { CairnstoneItem, CharacterSave, MapRun, RolledMod } from "./types";

export interface CairnstoneContent {
  mapMods: Affix[];
  cairnstones: CairnstoneRules;
  gear: GearRules; // affix counts per rarity and rare names are shared with gear
}

/** What affix rolling sees: map mods instead of gear affixes, and a base that only takes them. */
export const STONE_BASE = { tags: ["cairnstone"] };
export const mapAffixes = (content: CairnstoneContent) => ({ affixes: content.mapMods, gear: content.gear });
export const stoneView = (stone: CairnstoneItem) => ({ mods: stone.mods, ilvl: stone.level });

/** A new Cairnstone around `level` (sometimes one higher, unless `exact`). */
export function rollCairnstone(
  content: CairnstoneContent,
  rng: Rng,
  level: number,
  uid: number,
  opts: { rarity?: CairnstoneItem["rarity"]; exact?: boolean } = {},
): CairnstoneItem {
  const rules = content.cairnstones;
  const bump = !opts.exact && rng.next() * 100 < rules.levelUpChance ? 1 : 0;
  const weights = Object.entries(rules.rarityWeights).map(([id, weight]) => ({ id: id as CairnstoneItem["rarity"], weight }));
  const rarity = opts.rarity ?? rng.weighted(weights)?.id ?? "normal";
  const stone: CairnstoneItem = { uid, kind: "cairnstone", level: Math.max(1, level + bump), rarity, mods: [] };
  if (rarity !== "normal") {
    rollMods(mapAffixes(content), rng, STONE_BASE, stoneView(stone), rarity);
    if (stone.mods.length === 0) stone.rarity = "normal";
    if (stone.rarity === "rare") stone.name = rareName(content, rng);
  }
  return stone;
}

/** Map stats from mods: each stat summed (e.g. monster_life 35, item_quantity 9). */
export function mapStats(content: Pick<CairnstoneContent, "mapMods">, mods: RolledMod[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of mods) {
    content.mapMods.find((a) => a.id === m.affix)?.mods.forEach((def, i) => (out[def.stat] = (out[def.stat] ?? 0) + (m.values[i] ?? 0)));
  }
  return out;
}

/** "Hardy Cairnstone of Shadows" for magic, the rolled name for rares, "Cairnstone" otherwise. */
export function stoneName(content: Pick<CairnstoneContent, "mapMods">, stone: CairnstoneItem): string {
  if (stone.name) return stone.name;
  if (stone.rarity !== "magic") return "Cairnstone";
  const affix = (kind: "prefix" | "suffix") => stone.mods.map((m) => content.mapMods.find((a) => a.id === m.affix)).find((a) => a?.kind === kind);
  return [affix("prefix")?.name, "Cairnstone", affix("suffix")?.name].filter(Boolean).join(" ");
}

/** One line per mod, with its tier, e.g. "Monsters have 34% increased Life  (+5% item quantity)  (T3)". */
export function mapModLines(content: Pick<CairnstoneContent, "mapMods">, mods: RolledMod[]): string[] {
  return mods.map((m) => {
    const affix = content.mapMods.find((a) => a.id === m.affix);
    return affix ? `${fill(affix.text, m.values)}  (T${m.tier})` : m.affix;
  });
}

/** Rewards summary for a set of mods: "+12% item quantity, +8% item rarity". */
export function rewardLine(content: Pick<CairnstoneContent, "mapMods">, mods: RolledMod[]): string {
  const s = mapStats(content, mods);
  const parts = [s.item_quantity && `+${s.item_quantity}% item quantity`, s.item_rarity && `+${s.item_rarity}% item rarity`, s.pack_size && `+${s.pack_size}% pack size`].filter(Boolean);
  return parts.length ? parts.join(", ") : "no bonus rewards";
}

// ---------------------------------------------------------------- maps

/** A map with no mods (tests, and the default when no map is given). */
export function plainMap(seed: number, level: number): MapRun {
  return { seed, level, mods: [], name: "Zone", free: true, deaths: 0 };
}

export function freeMapLevel(content: CairnstoneContent, save: Pick<CharacterSave, "bestMapLevel">): number {
  return Math.max(1, save.bestMapLevel - content.cairnstones.freeMap.levelsBelowBest);
}

/** Running without a stone: a bit below your best level, with a few lowest-tier mods. */
export function freeMap(content: CairnstoneContent, save: Pick<CharacterSave, "bestMapLevel">, seed: number): MapRun {
  const rules = content.cairnstones.freeMap;
  const rng = new Rng((seed ^ 0x5bd1e995) >>> 0);
  const view = { mods: [] as RolledMod[], ilvl: 1 }; // item level 1: only the lowest tiers
  const count = rng.int(rules.modCount[0], rules.modCount[1]);
  for (let i = 0; i < count; i++) {
    const mod = rollAffix(mapAffixes(content), rng, STONE_BASE, view, content.gear.maxPerKind.rare);
    if (mod) view.mods.push(mod);
  }
  return { seed, level: freeMapLevel(content, save), mods: view.mods, name: rules.name, free: true, deaths: 0, maxDeaths: content.cairnstones.maxDeaths };
}

export function stoneMap(content: CairnstoneContent, stone: CairnstoneItem, seed: number): MapRun {
  return { seed, level: stone.level, mods: stone.mods.map((m) => ({ ...m, values: [...m.values] })), name: stoneName(content, stone), free: false, deaths: 0, maxDeaths: content.cairnstones.maxDeaths };
}

/** Has this map run out of retries? Never while maxDeaths is unset. */
export const mapLost = (map: MapRun) => map.maxDeaths !== undefined && map.deaths >= map.maxDeaths;
