// Inventory commands on the saved character: equip skill gems, socket supports.
// Each returns null on success or a short reason it was refused. Pure: no world access.

import { supportFits, weaponAttackSkill } from "../skills/compile";
import type { SkillDef, SupportDef } from "../skills/types";
import type { GemRules, ItemBase, WeaponDef } from "../data/types";
import { requirementProblem, slotAccepts, slotFor } from "./gear";
import { raiseGemLevel } from "./gems";
import type { CharacterSave, EquipSlot, GemItem, Item, SocketTarget } from "./types";

export interface InventoryContent {
  itemBases: ItemBase[];
  gems: GemRules;
  skills: SkillDef[];
  supports: SupportDef[];
  weapons: WeaponDef[];
}

export function addToBag(save: CharacterSave, item: Item, content: InventoryContent): boolean {
  if (save.bag.length >= content.gems.bagSize) return false;
  save.bag.push(item);
  return true;
}

/** The weapon attack follows the equipped weapon; no weapon = fists. */
function syncWeapon(save: CharacterSave, content: InventoryContent): void {
  const w = save.equipment.weapon;
  save.weapon = (w && content.itemBases.find((b) => b.id === w.base)?.weapon) ?? "unarmed";
}

/** Equip gear from the bag (into `slot`, or the natural slot); whatever was there goes back to the bag. */
export function equipGear(
  save: CharacterSave,
  bagIndex: number,
  slot: EquipSlot | undefined,
  character: { level: number; strength: number; dexterity: number; intelligence: number },
  content: InventoryContent,
): string | null {
  const item = save.bag[bagIndex];
  if (!item || item.kind !== "gear") return "not equipment";
  const base = content.itemBases.find((b) => b.id === item.base);
  if (!base) return "unknown item";
  const target = slot ?? slotFor(base, save.equipment);
  if (!slotAccepts(target, base)) return `doesn't go in ${target}`;
  const problem = requirementProblem(base, character.level, character);
  if (problem) return problem;
  const old = save.equipment[target];
  save.equipment[target] = item;
  if (old) save.bag[bagIndex] = old;
  else save.bag.splice(bagIndex, 1);
  syncWeapon(save, content);
  return null;
}

export function unequipGear(save: CharacterSave, slot: EquipSlot, content: InventoryContent): string | null {
  const item = save.equipment[slot];
  if (!item) return "slot is empty";
  if (!addToBag(save, item, content)) return "bag is full";
  delete save.equipment[slot];
  syncWeapon(save, content);
  return null;
}

/** Pull the supports out of a skill gem (they go to the bag separately). */
function emptySockets(gem: GemItem): GemItem[] {
  const out = (gem.sockets ?? []).filter((s): s is GemItem => !!s);
  gem.sockets = (gem.sockets ?? []).map(() => null);
  return out;
}

/**
 * Put a skill gem from the bag on a skill button. Whatever was there goes back to the bag,
 * and its socketed supports come out into the bag too.
 */
export function equipSkill(save: CharacterSave, bagIndex: number, slot: number, content: InventoryContent): string | null {
  const gem = save.bag[bagIndex];
  if (!gem || gem.kind !== "skill_gem") return "not a skill gem";
  if (slot < 0 || slot >= save.skillBar.length) return "no such slot";
  const old = save.skillBar[slot];
  const freed = old?.sockets?.filter(Boolean).length ?? 0;
  if (save.bag.length + freed > content.gems.bagSize) return "bag is full";
  save.skillBar[slot] = gem;
  if (old) {
    save.bag[bagIndex] = old;
    save.bag.push(...emptySockets(old));
  } else save.bag.splice(bagIndex, 1);
  return null;
}

/** Take a skill gem off the bar; it and its socketed supports go back into the bag. */
export function unequipSkill(save: CharacterSave, slot: number, content: InventoryContent): string | null {
  const gem = save.skillBar[slot];
  if (!gem) return "slot is empty";
  const freed = gem.sockets?.filter(Boolean).length ?? 0;
  if (save.bag.length + 1 + freed > content.gems.bagSize) return "bag is full";
  save.bag.push(gem, ...emptySockets(gem));
  save.skillBar[slot] = null;
  return null;
}

/**
 * Level an equipped skill gem by consuming a duplicate copy from the bag. The copy adds its
 * own level (so levelled copies aren't wasted), up to the max level.
 */
export function levelSkillGem(save: CharacterSave, slot: number, copyBagIndex: number, content: InventoryContent): string | null {
  const gem = save.skillBar[slot];
  const copy = save.bag[copyBagIndex];
  if (!gem) return "no skill gem there";
  if (!copy || copy.kind !== "skill_gem" || copy.defId !== gem.defId) return "needs a copy of the same skill gem";
  if (gem.level >= content.gems.maxLevel) return "already max level";
  save.bag.splice(copyBagIndex, 1);
  save.bag.push(...emptySockets(copy)); // supports left in the copy aren't destroyed
  raiseGemLevel(gem, copy.level, content.gems);
  return null;
}

function socketsOf(save: CharacterSave, target: SocketTarget): (GemItem | null)[] | null {
  if (target.kind === "attack") return save.attackSockets;
  return save.skillBar[target.slot]?.sockets ?? null;
}

/** Can this support go into this target (skill gem or weapon attack)? */
export function supportFitsTarget(save: CharacterSave, supportId: string, target: SocketTarget, content: InventoryContent): boolean {
  const support = content.supports.find((s) => s.id === supportId);
  if (!support) return false;
  if (target.kind === "attack") {
    const weapon = content.weapons.find((w) => w.id === save.weapon);
    return !!weapon && supportFits(support, weaponAttackSkill(weapon));
  }
  const gem = save.skillBar[target.slot];
  const skill = gem && content.skills.find((s) => s.id === gem.defId);
  return !!skill && supportFits(support, skill);
}

/** Socket a support gem from the bag; whatever was in that socket goes back to the bag. */
export function socketSupport(save: CharacterSave, bagIndex: number, target: SocketTarget, socket: number, content: InventoryContent): string | null {
  const gem = save.bag[bagIndex];
  if (!gem || gem.kind !== "support_gem") return "not a support gem";
  const sockets = socketsOf(save, target);
  if (!sockets) return "no skill there";
  if (socket < 0 || socket >= sockets.length) return "no such socket";
  if (!supportFitsTarget(save, gem.defId, target, content)) return "doesn't fit this skill";
  const old = sockets[socket];
  sockets[socket] = gem;
  if (old) save.bag[bagIndex] = old;
  else save.bag.splice(bagIndex, 1);
  return null;
}

export function unsocket(save: CharacterSave, target: SocketTarget, socket: number, content: InventoryContent): string | null {
  const sockets = socketsOf(save, target);
  const gem = sockets?.[socket];
  if (!sockets || !gem) return "socket is empty";
  if (!addToBag(save, gem, content)) return "bag is full";
  sockets[socket] = null;
  return null;
}
