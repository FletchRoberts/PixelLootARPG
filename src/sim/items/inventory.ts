// Inventory commands on the saved character: equip gear and skill gems, socket supports.
// Gear, gems and currency live in separate places: gearBag, gemBag and the currency stash.
// Each returns null on success or a short reason it was refused. Pure: no world access.

import { supportFits, weaponAttackSkill } from "../skills/compile";
import type { SkillDef, SupportDef } from "../skills/types";
import type { CairnstoneRules, Currency, GearRules, GemRules, HideoutDef, ItemBase, WeaponDef } from "../data/types";
import { addCurrency } from "./crafting";
import { requirementProblem, slotAccepts, slotFor } from "./gear";
import { raiseGemLevel } from "./gems";
import type { CharacterSave, EquipSlot, GemItem, Item, SocketTarget } from "./types";

export interface InventoryContent {
  itemBases: ItemBase[];
  gems: GemRules;
  gear: GearRules;
  currencies: Currency[];
  cairnstones: CairnstoneRules;
  hideout: HideoutDef;
  skills: SkillDef[];
  supports: SupportDef[];
  weapons: WeaponDef[];
}

/** Put an item where it belongs: gear bag, gem bag, or the currency stash (never full). */
export function addToBag(save: CharacterSave, item: Item, content: InventoryContent): boolean {
  if (item.kind === "currency") {
    addCurrency(save, item.id, item.count, content);
    return true;
  }
  if (item.kind === "gear") {
    if (save.gearBag.length >= content.gear.bagSize) return false;
    save.gearBag.push(item);
    return true;
  }
  if (item.kind === "cairnstone") {
    if (save.stoneBag.length >= content.cairnstones.bagSize) return false;
    save.stoneBag.push(item);
    return true;
  }
  if (save.gemBag.length >= content.gems.bagSize) return false;
  save.gemBag.push(item);
  return true;
}

/** Which bag an item would go into, for "gem bag is full" messages. */
export const bagOf = (item: Item): "gear" | "gems" | "currency" | "stones" =>
  item.kind === "gear" ? "gear" : item.kind === "currency" ? "currency" : item.kind === "cairnstone" ? "stones" : "gems";

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
  const item = save.gearBag[bagIndex];
  if (!item) return "not equipment";
  const base = content.itemBases.find((b) => b.id === item.base);
  if (!base) return "unknown item";
  const target = slot ?? slotFor(base, save.equipment);
  if (!slotAccepts(target, base)) return `doesn't go in ${target}`;
  const problem = requirementProblem(base, character.level, character);
  if (problem) return problem;
  const old = save.equipment[target];
  save.equipment[target] = item;
  if (old) save.gearBag[bagIndex] = old;
  else save.gearBag.splice(bagIndex, 1);
  syncWeapon(save, content);
  return null;
}

export function unequipGear(save: CharacterSave, slot: EquipSlot, content: InventoryContent): string | null {
  const item = save.equipment[slot];
  if (!item) return "slot is empty";
  if (!addToBag(save, item, content)) return "gear bag is full";
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
  const gem = save.gemBag[bagIndex];
  if (!gem || gem.kind !== "skill_gem") return "not a skill gem";
  if (slot < 0 || slot >= save.skillBar.length) return "no such slot";
  const old = save.skillBar[slot];
  const freed = old?.sockets?.filter(Boolean).length ?? 0;
  if (save.gemBag.length + freed > content.gems.bagSize) return "gem bag is full";
  save.skillBar[slot] = gem;
  if (old) {
    save.gemBag[bagIndex] = old;
    save.gemBag.push(...emptySockets(old));
  } else save.gemBag.splice(bagIndex, 1);
  return null;
}

/** Take a skill gem off the bar; it and its socketed supports go back into the bag. */
export function unequipSkill(save: CharacterSave, slot: number, content: InventoryContent): string | null {
  const gem = save.skillBar[slot];
  if (!gem) return "slot is empty";
  const freed = gem.sockets?.filter(Boolean).length ?? 0;
  if (save.gemBag.length + 1 + freed > content.gems.bagSize) return "gem bag is full";
  save.gemBag.push(gem, ...emptySockets(gem));
  save.skillBar[slot] = null;
  return null;
}

/**
 * Level an equipped skill gem by consuming a duplicate copy from the bag. The copy adds its
 * own level (so levelled copies aren't wasted), up to the max level.
 */
export function levelSkillGem(save: CharacterSave, slot: number, copyBagIndex: number, content: InventoryContent): string | null {
  const gem = save.skillBar[slot];
  const copy = save.gemBag[copyBagIndex];
  if (!gem) return "no skill gem there";
  if (!copy || copy.kind !== "skill_gem" || copy.defId !== gem.defId) return "needs a copy of the same skill gem";
  if (gem.level >= content.gems.maxLevel) return "already max level";
  save.gemBag.splice(copyBagIndex, 1);
  save.gemBag.push(...emptySockets(copy)); // supports left in the copy aren't destroyed
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
  const gem = save.gemBag[bagIndex];
  if (!gem || gem.kind !== "support_gem") return "not a support gem";
  const sockets = socketsOf(save, target);
  if (!sockets) return "no skill there";
  if (socket < 0 || socket >= sockets.length) return "no such socket";
  if (!supportFitsTarget(save, gem.defId, target, content)) return "doesn't fit this skill";
  const old = sockets[socket];
  sockets[socket] = gem;
  if (old) save.gemBag[bagIndex] = old;
  else save.gemBag.splice(bagIndex, 1);
  return null;
}

export function unsocket(save: CharacterSave, target: SocketTarget, socket: number, content: InventoryContent): string | null {
  const sockets = socketsOf(save, target);
  const gem = sockets?.[socket];
  if (!sockets || !gem) return "socket is empty";
  if (!addToBag(save, gem, content)) return "gem bag is full";
  sockets[socket] = null;
  return null;
}

// ---------------------------------------------------------------- stash

export type StashTab = "gear" | "gems" | "stones";

const bagFor = (save: CharacterSave, tab: StashTab) => (tab === "gear" ? save.gearBag : tab === "gems" ? save.gemBag : save.stoneBag) as Item[];
const bagSize = (tab: StashTab, c: InventoryContent) => (tab === "gear" ? c.gear.bagSize : tab === "gems" ? c.gems.bagSize : c.cairnstones.bagSize);

/** Move a bag item into the hideout stash (or back out with `take`). */
export function moveStash(save: CharacterSave, tab: StashTab, index: number, take: boolean, content: InventoryContent): string | null {
  const bag = bagFor(save, tab);
  const stash = save.stash[tab] as Item[];
  const from = take ? stash : bag;
  const to = take ? bag : stash;
  const item = from[index];
  if (!item) return "nothing there";
  const room = take ? bagSize(tab, content) : content.hideout.stashSize[tab];
  if (to.length >= room) return take ? "bag is full" : "stash tab is full";
  from.splice(index, 1);
  to.push(item);
  return null;
}
