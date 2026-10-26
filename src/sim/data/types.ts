// Schemas for the content files in src/data. Content lives in data, not code;
// these types are the contract between the two.

export type Rarity = "normal" | "magic" | "rare" | "unique";
export type AffixKind = "prefix" | "suffix";

export interface ItemBase {
  id: string;
  name: string;
  slot: string; // e.g. "helmet", "body", "weapon_1h"
  tags: string[]; // affix pools filter on these
  dropLevel: number;
  implicits?: string[]; // affix ids
}

export interface AffixTier {
  tier: number; // 1 = best
  itemLevel: number; // minimum ilvl to roll this tier
  weight: number;
  values: [number, number][]; // one [min, max] per stat
}

export interface Affix {
  id: string;
  kind: AffixKind;
  group: string; // only one affix per group on an item
  stats: string[]; // stat ids, parallel to AffixTier.values
  text: string; // display template, e.g. "+{0} to maximum Life"
  tags: string[]; // which base tags can roll it
  tiers: AffixTier[];
}

export interface Currency {
  id: string;
  name: string;
  description: string;
  effect: string; // id of the crafting/map-modifying operation in sim
  stackSize: number;
}

export interface Monster {
  id: string;
  name: string;
  life: number;
  damage: number;
  speed: number;
  dropTable: string;
  sprite?: { seed: number; kind: string }; // PixelGen placeholder params
}

export interface DropEntry {
  weight: number;
  kind: "item" | "currency" | "table" | "nothing";
  ref?: string;
}

export interface DropTable {
  id: string;
  rolls: number;
  entries: DropEntry[];
}
