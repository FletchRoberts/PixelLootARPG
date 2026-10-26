// Gem levels and socket counts (rules in src/data/gems.json).
// Skill gems level by consuming duplicate copies of themselves (later also a crafting
// currency); support gems don't level, duplicates are just extra copies to socket.

import type { GemRules } from "../data/types";
import type { CharacterSave, GemItem } from "./types";

export function socketCount(level: number, rules: GemRules): number {
  let count = 0;
  for (const step of rules.sockets) if (level >= step.level) count = Math.max(count, step.count);
  return count;
}

/** Set a skill gem's level (capped) and grow its sockets to match. Returns levels gained. */
export function raiseGemLevel(gem: GemItem, levels: number, rules: GemRules): number {
  const before = gem.level;
  gem.level = Math.min(rules.maxLevel, gem.level + levels);
  const sockets = gem.sockets ?? [];
  while (sockets.length < socketCount(gem.level, rules)) sockets.push(null);
  gem.sockets = sockets;
  return gem.level - before;
}

export function makeGem(save: Pick<CharacterSave, "nextUid">, kind: GemItem["kind"], defId: string, rules: GemRules, level = 1): GemItem {
  const gem: GemItem = { uid: save.nextUid++, kind, defId, level };
  if (kind === "skill_gem") gem.sockets = Array.from({ length: socketCount(level, rules) }, () => null);
  return gem;
}
