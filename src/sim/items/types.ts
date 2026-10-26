// Items and the saved character. Plain data: everything here is serialised to the
// browser save and (later) sent over the network.

/** A skill or support gem. Skill gems carry their own support sockets (PoE2-style). */
export interface GemItem {
  uid: number;
  kind: "skill_gem" | "support_gem";
  defId: string; // skills.json / supports.json id
  level: number; // skill gems level by consuming duplicates; supports stay at 1
  sockets?: (GemItem | null)[]; // skill gems only; length = current socket count
}

/** One rolled affix on a gear item. */
export interface RolledMod {
  affix: string; // affixes.json id
  tier: number;
  values: number[]; // parallel to the affix's mods
}

export type Rarity = "normal" | "magic" | "rare" | "unique";

/** Equipment. Everything rolled at drop time is stored, so an item never changes unless crafted. */
export interface GearItem {
  uid: number;
  kind: "gear";
  base: string; // item-bases.json id
  rarity: Rarity;
  ilvl: number;
  name?: string; // rare and unique names
  implicits: number[]; // rolled values, parallel to the base's implicits
  mods: RolledMod[]; // prefixes and suffixes (magic/rare)
  unique?: string; // uniques.json id
  uniqueValues?: number[]; // rolled values, parallel to the unique's mods
}

export type Item = GemItem | GearItem; // currency and Cairnstones join this union later

export type EquipSlot = "weapon" | "helmet" | "body" | "gloves" | "boots" | "belt" | "amulet" | "ring1" | "ring2";
export const EQUIP_SLOTS: EquipSlot[] = ["weapon", "helmet", "body", "gloves", "boots", "belt", "amulet", "ring1", "ring2"];

/** Something lying on the zone floor. */
export interface GroundItem {
  id: number;
  item: Item;
  pos: { x: number; y: number };
}

/** Where a support gem goes: a skill on the bar, or the weapon attack. */
export type SocketTarget = { kind: "skill"; slot: number } | { kind: "attack" };

/** Everything that persists between zones and browser sessions. */
export interface CharacterSave {
  version: 2;
  characterId: string;
  level: number;
  xp: number;
  zonesCleared: number;
  weapon: string; // weapons.json id of the equipped weapon ("unarmed" if none); kept in sync with equipment
  equipment: Partial<Record<EquipSlot, GearItem>>;
  skillBar: (GemItem | null)[]; // one skill gem per button
  attackSockets: (GemItem | null)[]; // supports for the weapon attack
  bag: Item[];
  nextUid: number;
}
