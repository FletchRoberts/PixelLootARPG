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

/** PixelGen placeholder sprite params (see tools/pixel-forge.html). Client-only; the sim just carries them. */
export interface SpriteSpec {
  type: string; // PixelGen.types: monster, hero, weapon, potion, currency, ring, floor, wall
  seed: string;
  theme?: string; // PixelGen.themes, default "random"
  size?: number; // source pixels, default 32
}

export interface Monster {
  id: string;
  name: string;
  life: number;
  damage: number; // contact damage per hit
  speed: number; // px/s
  radius: number; // px, collision circle
  contactCooldown: number; // seconds between contact hits on the same target
  aggroRange: number; // tiles of walking distance at which it wakes up
  dropTable: string;
  sprite?: SpriteSpec;
}

export interface MeleeAttack {
  damage: [number, number];
  range: number; // px from the attacker's edge
  arcDegrees: number;
  cooldown: number; // seconds
  knockback: number; // px/s impulse
}

export interface Character {
  id: string;
  name: string;
  life: number;
  speed: number;
  radius: number;
  attack: MeleeAttack;
  sprite?: SpriteSpec;
}

export type Range = [number, number];

export interface WeightedRef {
  id: string;
  weight: number;
}

/** Tuning for the zone generator. Distances are in tiles. */
export interface ZoneGenConfig {
  tileSize: number; // px per tile
  margin: number; // solid tiles around the layout
  mainPath: {
    segments: Range;
    segmentLength: Range;
    halfWidth: Range;
    maxTurnDegrees: number; // heading change per segment
    maxHeadingDegrees: number; // max deviation from the zone's overall direction
    clearingChance: number;
    clearingRadius: Range;
  };
  branches: {
    chance: number; // per eligible main-path node
    segments: Range;
    segmentLength: Range;
    halfWidth: Range;
    angleDegrees: Range; // off the main heading
    maxTurnDegrees: number;
    endRadius: Range;
  };
  gap: number; // min solid tiles between non-adjacent corridors
  edgeRoughness: number;
  startRadius: number;
  endRadius: number;
  packs: {
    spacing: Range; // tiles of main path between packs
    size: Range;
    spread: number; // radius of a pack, tiles
    safeStartDistance: number;
    branchChance: number;
    branchSize: Range;
    endSize: Range;
  };
  monsterPool: WeightedRef[];
  biomes: WeightedRef[];
}

/** Visual set for a zone. Client-only; the sim just picks one by id. */
export interface Biome {
  id: string;
  name: string;
  floor: SpriteSpec;
  wall: SpriteSpec;
  variants: number; // seeds per tile kind, for variety
  void: string; // colour outside walls
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
