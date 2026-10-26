// The saved character: creation, deriving the skill loadout, death penalty.

import { Rng } from "../core/rng";
import type { GemRules, ItemBase, Progression } from "../data/types";
import type { Loadout } from "../skills/types";
import { xpToNext } from "../stats/character";
import { makeGem } from "./gems";
import type { CharacterSave, GearItem, GemItem } from "./types";

export const SKILL_BAR_SIZE = 4;

export interface SaveContent {
  characters: { id: string; startingWeapon: string }[];
  itemBases: ItemBase[];
  supports: { id: string }[];
  skills: { id: string }[];
  gems: GemRules;
}

/** A plain (normal rarity) item of a base, implicits at their minimum. Used for starting gear. */
export function normalItem(base: ItemBase, uid: number, ilvl = 1): GearItem {
  return { uid, kind: "gear", base: base.id, rarity: "normal", ilvl, implicits: (base.implicits ?? []).map((m) => m.value[0]), mods: [] };
}

/** Fresh level-1 character: starting weapon equipped, Frost Bolt on the first button, one random support in the bag. */
export function newCharacter(content: SaveContent, seed: number, characterId = "hero"): CharacterSave {
  const hero = content.characters.find((c) => c.id === characterId) ?? content.characters[0]!;
  const save: CharacterSave = {
    version: 2,
    characterId: hero.id,
    level: 1,
    xp: 0,
    zonesCleared: 0,
    weapon: hero.startingWeapon,
    equipment: {},
    skillBar: Array.from({ length: SKILL_BAR_SIZE }, () => null),
    attackSockets: Array.from({ length: content.gems.attackSockets }, () => null),
    bag: [],
    nextUid: 1,
  };
  const weaponBase = content.itemBases.find((b) => b.weapon === hero.startingWeapon);
  if (weaponBase) save.equipment.weapon = normalItem(weaponBase, save.nextUid++);
  const start = content.skills.find((s) => s.id === "frost_bolt") ?? content.skills[0];
  if (start) save.skillBar[0] = makeGem(save, "skill_gem", start.id, content.gems);
  const rng = new Rng(seed);
  const support = content.supports[Math.floor(rng.next() * content.supports.length)];
  if (support) save.bag.push(makeGem(save, "support_gem", support.id, content.gems));
  return save;
}

const ids = (gems: (GemItem | null)[] | undefined) => (gems ?? []).filter((g): g is GemItem => !!g).map((g) => g.defId);

/** The compiler's view of the character's equipped gems. */
export function loadoutOf(save: CharacterSave): Loadout {
  return {
    weapon: save.weapon,
    attackSupports: ids(save.attackSockets),
    slots: save.skillBar.map((gem) => ({ skill: gem?.defId ?? null, supports: ids(gem?.sockets), level: gem?.level ?? 1 })),
  };
}

/** Lose a share of the current level's XP requirement; never drop a level. */
export function applyDeathPenalty(save: CharacterSave, progression: Progression): void {
  const need = xpToNext(save.level, progression);
  if (!Number.isFinite(need)) return;
  save.xp = Math.max(0, save.xp - (need * progression.deathXpPenalty) / 100);
}

/** Every gem the character has equipped (skill gems and their socketed supports). */
export function equippedSkillGems(save: CharacterSave): GemItem[] {
  return save.skillBar.filter((g): g is GemItem => !!g);
}

/**
 * Bring an older save up to date. v1 had no equipment: its weapon becomes an equipped
 * normal item. Returns null if the data isn't a recognisable save.
 */
export function migrateSave(raw: unknown, content: SaveContent): CharacterSave | null {
  const s = raw as Partial<CharacterSave> & { version?: number };
  if (!s || typeof s !== "object" || !Array.isArray(s.skillBar) || !Array.isArray(s.bag)) return null;
  if (s.version === 2) return s as CharacterSave;
  if (s.version !== 1) return null;
  const save = { ...(s as unknown as CharacterSave), version: 2 as const, equipment: {}, nextUid: s.nextUid ?? 1 };
  const base = content.itemBases.find((b) => b.weapon === save.weapon);
  if (base) save.equipment = { weapon: normalItem(base, save.nextUid++) };
  else save.weapon = "unarmed";
  return save;
}
