// The saved character: creation, deriving the skill loadout, death penalty.

import { Rng } from "../core/rng";
import type { GemRules, ItemBase, Progression } from "../data/types";
import type { Loadout } from "../skills/types";
import { xpToNext } from "../stats/character";
import { makeGem } from "./gems";
import type { CairnstoneItem, CharacterSave, GearItem, GemItem } from "./types";

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
    version: 5,
    characterId: hero.id,
    level: 1,
    xp: 0,
    zonesCleared: 0,
    weapon: hero.startingWeapon,
    equipment: {},
    skillBar: Array.from({ length: SKILL_BAR_SIZE }, () => null),
    attackSockets: Array.from({ length: content.gems.attackSockets }, () => null),
    gearBag: [],
    gemBag: [],
    currency: {},
    stoneBag: [],
    bestMapLevel: 0,
    stash: { gear: [], gems: [], stones: [] },
    nextUid: 1,
  };
  const weaponBase = content.itemBases.find((b) => b.weapon === hero.startingWeapon);
  if (weaponBase) save.equipment.weapon = normalItem(weaponBase, save.nextUid++);
  const start = content.skills.find((s) => s.id === "frost_bolt") ?? content.skills[0];
  if (start) save.skillBar[0] = makeGem(save, "skill_gem", start.id, content.gems);
  const rng = new Rng(seed);
  const support = content.supports[Math.floor(rng.next() * content.supports.length)];
  if (support) save.gemBag.push(makeGem(save, "support_gem", support.id, content.gems));
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


/**
 * Bring an older save up to date. v1 had no equipment: its weapon becomes an equipped
 * normal item. v2 had one shared bag: it splits into the gear and gem bags. v3 had no
 * Cairnstones: a player who had cleared zones gets a stone at the level they'd reached. v4 had
 * no stash.
 * Returns null if the data isn't a recognisable save.
 */
export function migrateSave(raw: unknown, content: SaveContent): CharacterSave | null {
  type Old = Omit<CharacterSave, "version" | "stoneBag" | "bestMapLevel" | "stash"> & { version?: number; bag?: (GearItem | GemItem)[]; stoneBag?: CairnstoneItem[]; bestMapLevel?: number; stash?: CharacterSave["stash"] };
  const s = raw as Old;
  if (!s || typeof s !== "object" || !Array.isArray(s.skillBar)) return null;
  if (s.version === 5) return Array.isArray(s.gearBag) && Array.isArray(s.gemBag) && Array.isArray(s.stoneBag) && s.stash ? (s as unknown as CharacterSave) : null;
  if (s.version === 4) return Array.isArray(s.stoneBag) ? { ...(s as unknown as CharacterSave), version: 5, stash: { gear: [], gems: [], stones: [] } } : null;
  let save: Old;
  if (s.version === 3) {
    if (!Array.isArray(s.gearBag) || !Array.isArray(s.gemBag)) return null;
    save = { ...s };
  } else {
    if ((s.version !== 1 && s.version !== 2) || !Array.isArray(s.bag)) return null;
    save = { ...s, equipment: s.equipment ?? {}, nextUid: s.nextUid ?? 1, gearBag: [], gemBag: [], currency: {} };
    delete save.bag;
    for (const item of s.bag) {
      if (item.kind === "gear") save.gearBag.push(item);
      else save.gemBag.push(item);
    }
    if (s.version === 1) {
      const base = content.itemBases.find((b) => b.weapon === save.weapon);
      if (base) save.equipment = { weapon: normalItem(base, save.nextUid++) };
      else save.weapon = "unarmed";
    }
  }
  // v3 → v4: monster level used to be 1 + zones cleared.
  const out: CharacterSave = { ...save, version: 5, stoneBag: [], bestMapLevel: save.zonesCleared, stash: { gear: [], gems: [], stones: [] } };
  if (save.zonesCleared > 0) out.stoneBag.push({ uid: out.nextUid++, kind: "cairnstone", level: save.zonesCleared + 1, rarity: "normal", mods: [] });
  return out;
}
