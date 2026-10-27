// Schemas for the content files in src/data. Content lives in data, not code;
// these types are the contract between the two.

export type Rarity = "normal" | "magic" | "rare" | "unique";
export type AffixKind = "prefix" | "suffix";
export type GearSlot = "weapon" | "helmet" | "body" | "gloves" | "boots" | "belt" | "amulet" | "ring";

/** A modifier whose value is rolled once when the item drops (implicits, unique mods). */
export interface RangedModDef {
  stat: string;
  kind: "flat" | "increased" | "more";
  tags?: string[];
  value: [number, number];
}

export interface ItemBase {
  id: string;
  name: string;
  slot: GearSlot;
  tags: string[]; // affix pools filter on these (e.g. "armour", "helmet", "jewellery", "weapon", "wand")
  dropLevel: number; // minimum item level to drop
  requires?: { level?: number; strength?: number; dexterity?: number; intelligence?: number };
  implicits?: RangedModDef[]; // base armour/evasion and fixed base properties
  weapon?: string; // weapons.json id: damage, speed and the weapon attack it grants
}

export interface AffixTier {
  tier: number; // 1 = best
  itemLevel: number; // minimum ilvl to roll this tier
  weight: number;
  values: [number, number][]; // one [min, max] per mod
}

export interface AffixModDef {
  stat: string;
  kind: "flat" | "increased" | "more";
  tags?: string[];
}

export interface Affix {
  id: string;
  name: string; // magic item naming: prefixes "Healthy …", suffixes "… of the Fox"
  kind: AffixKind;
  group: string; // only one affix per group on an item
  mods: AffixModDef[]; // parallel to AffixTier.values
  text: string; // display template, e.g. "+{0} to maximum Life"
  tags: string[]; // rolls on bases having any of these tags
  tiers: AffixTier[];
}

/** Hand-authored unique: fixed mods (rolled within ranges) and optional support grants. */
export interface UniqueDef {
  id: string;
  name: string;
  base: string;
  weight: number;
  mods: (RangedModDef & { text: string })[]; // text uses {0} for the rolled value
  grants?: { support: string; tags?: string[]; text: string }[]; // support applied to every fitting skill (with the tags)
  flavour?: string;
}

export interface GearRules {
  rarityWeights: Record<Rarity, number>;
  affixCount: { magic: Range; rare: Range };
  maxPerKind: { magic: number; rare: number }; // max prefixes (and suffixes) per rarity
  rareNames: { first: string[]; second: string[] };
  bagSize: number; // gear bag slots (gems have their own bag; currency stacks without limit)
}

/** Crafting currency (src/data/currencies.json). Stacks without limit in the currency stash. */
export interface Currency {
  id: string;
  name: string;
  description: string;
  effect: string; // crafting effect id implemented in sim/items/crafting.ts ("none" for fragments)
  dropWeight: number; // weight among currency drops (0 = never drops on its own)
  dropLevel: number; // lowest monster level that drops it
  combine?: { into: string; count: number }; // fragments: `count` of these become one `into`
  sprite: SpriteSpec;
}

/** What salvaging gives: `count` (+ `perLevel` per skill gem level above 1) of a currency. */
export interface SalvageYield {
  currency: string;
  count: number;
  perLevel?: number;
}

export type CorruptionOutcome = "nothing" | "reroll_rare" | "tier_up" | "lose_mod";

/** Crafting rules (src/data/crafting.json): salvage yields and Void Pearl outcomes. */
export interface CraftingRules {
  salvage: {
    gear: Record<"normal" | "magic" | "rare" | "unique", SalvageYield>;
    skill_gem: SalvageYield;
    support_gem: SalvageYield;
  };
  corruption: { outcome: CorruptionOutcome; weight: number }[];
}

/** PixelGen placeholder sprite params (see tools/pixel-forge.html). Client-only; the sim just carries them. */
export interface SpriteSpec {
  type: string; // PixelGen.types: monster, hero, weapon, potion, currency, ring, floor, wall
  seed: string;
  theme?: string; // PixelGen.themes, default "random"
  size?: number; // source pixels, default 32
}

export type Range = [number, number];
export type DamageTypeId = "physical" | "fire" | "cold" | "lightning" | "chaos";
export type ElementId = "fire" | "cold" | "lightning" | "chaos";

export interface Monster {
  id: string;
  name: string;
  life: number; // at level 1; scaled by monster-scaling.json
  damage: Partial<Record<DamageTypeId, Range>>; // contact hit at level 1
  accuracy: number;
  evasion: number;
  armour: number;
  resist?: Partial<Record<ElementId, number>>;
  xp: number; // at level 1
  speed: number; // px/s
  radius: number; // px, collision circle
  contactCooldown: number; // seconds between contact hits on the same target
  aggroRange: number; // tiles of walking distance at which it wakes up
  dropTable: string;
  sprite?: SpriteSpec;
}

/** Inline modifier in data files (same shape as sim/stats Modifier). */
export interface ModifierDef {
  stat: string;
  kind: "flat" | "increased" | "more";
  value: number;
  tags?: string[];
}

/** A weapon base and the attack it grants (an attack skill using the weapon's damage, used with R2 / left click). */
export interface WeaponDef {
  id: string;
  name: string;
  type: string; // sword, bow, wand, …
  damage: Partial<Record<DamageTypeId, Range>>;
  attacksPerSecond: number;
  critChance: number; // percent
  attack: {
    name: string;
    tags: string[]; // skill tags, e.g. ["attack", "melee", "physical"]
    root: import("../skills/types").DeliveryDef;
  };
}

/** PoE2-style dodge roll. */
export interface DodgeDef {
  distance: number; // px
  duration: number; // s
  cooldown: number; // s after the roll ends
  invulnerable: boolean; // ignore contact hits while rolling
}

export interface Character {
  id: string;
  name: string;
  speed: number;
  radius: number;
  base: Record<string, number>; // stat id -> base value at level 1 (life, mana, strength, …)
  startingWeapon: string;
  dodge: DodgeDef;
  sprite?: SpriteSpec;
}

export interface Progression {
  maxLevel: number;
  xpToNext: { base: number; growth: number }; // xp for level L→L+1 = base × growth^(L-1)
  perLevel: ModifierDef[]; // granted once per level above 1
  passivePointsPerLevel: number;
  deathXpPenalty: number; // % of the current level's XP requirement lost on death (never below 0)
  xpPenalty: { freeLevels: number; perLevel: number; min: number }; // when levels differ a lot
}

/** Small bonuses per attribute point (docs/skills.md). */
export type AttributeBonuses = Record<"strength" | "dexterity" | "intelligence", ModifierDef[]>;

/** Per-level exponential growth for monsters: value × rate^(level-1). */
export type MonsterScaling = Record<"life" | "damage" | "accuracy" | "evasion" | "armour" | "xp", number>;

export interface CombatRulesDef {
  armourFactor: number;
  armourCap: number;
  hitChance: { scale: number; evasionWeight: number; min: number; max: number };
  resistance: { defaultMax: number; hardMax: number; floor: number };
  critBonusBase: number;
  ailments: {
    chill: { duration: number; slow: number }; // any cold hit: slow % for duration s
    freeze: { threshold: number; secondsPerPercent: number; min: number; max: number }; // cold hit ≥ threshold % of max life
    ignite: { dpsPercentOfHit: number; duration: number }; // fire hit, chance from ignite_chance
  };
  leech: { maxRate: number }; // % of max life/mana recoverable per second from leech
}

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
  endPackDropTable: string; // the end-arena pack drops from this instead of its own table
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
  // skill_gem / support_gem: a specific gem if `ref` is set, otherwise any gem of that kind.
  // table: roll another table (`ref`). currency: a random currency by dropWeight/dropLevel (or `ref`), `count` of it.
  // item: random gear (or base `ref`) with rolled rarity; unique: a random unique (or `ref`).
  kind: "nothing" | "table" | "skill_gem" | "support_gem" | "item" | "unique" | "currency";
  ref?: string;
  count?: Range; // currency stack size (default 1)
}

export interface DropTable {
  id: string;
  rolls: number;
  entries: DropEntry[];
}

/** Gem progression and inventory rules (src/data/gems.json). */
export interface GemRules {
  maxLevel: number; // skill gems level by consuming copies (each copy adds its own level)
  damagePerLevel: number; // increased damage % per skill gem level above 1
  sockets: { level: number; count: number }[]; // skill gem support sockets by level
  attackSockets: number; // support sockets for the weapon attack
  bagSize: number;
  pickupRange: number; // px
}
