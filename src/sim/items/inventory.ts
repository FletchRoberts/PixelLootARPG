// Inventory commands on the saved character: equip skill gems, socket supports.
// Each returns null on success or a short reason it was refused. Pure: no world access.

import { supportFits, weaponAttackSkill } from "../skills/compile";
import type { SkillDef, SupportDef } from "../skills/types";
import type { ItemBase, WeaponDef } from "../data/types";
import { requirementProblem, slotAccepts, slotFor } from "./gear";
import type { CharacterSave, EquipSlot, GemItem, Item, SocketTarget } from "./types";

export interface InventoryContent {
  itemBases: ItemBase[];
  skills: SkillDef[];
  supports: SupportDef[];
  weapons: WeaponDef[];
  gems: { bagSize: number };
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

/** Put a skill gem from the bag on a skill button; whatever was there goes back to the bag. */
export function equipSkill(save: CharacterSave, bagIndex: number, slot: number): string | null {
  const gem = save.bag[bagIndex];
  if (!gem || gem.kind !== "skill_gem") return "not a skill gem";
  if (slot < 0 || slot >= save.skillBar.length) return "no such slot";
  const old = save.skillBar[slot];
  save.skillBar[slot] = gem;
  if (old) save.bag[bagIndex] = old;
  else save.bag.splice(bagIndex, 1);
  return null;
}

/** Take a skill gem (with its supports still socketed) off the bar into the bag. */
export function unequipSkill(save: CharacterSave, slot: number, content: InventoryContent): string | null {
  const gem = save.skillBar[slot];
  if (!gem) return "slot is empty";
  if (!addToBag(save, gem, content)) return "bag is full";
  save.skillBar[slot] = null;
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
