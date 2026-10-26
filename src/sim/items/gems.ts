// Gem levels, XP and socket counts (rules in src/data/gems.json).

import type { GemRules } from "../data/types";
import type { CharacterSave, GemItem } from "./types";

export function socketCount(level: number, rules: GemRules): number {
  let count = 0;
  for (const step of rules.sockets) if (level >= step.level) count = Math.max(count, step.count);
  return count;
}

export function gemXpToNext(level: number, rules: GemRules): number {
  if (level >= rules.maxLevel) return Infinity;
  return Math.round(rules.xpToNext.base * Math.pow(rules.xpToNext.growth, level - 1));
}

/** Add XP to a gem; grows its sockets on level up. Returns levels gained. */
export function gainGemXp(gem: GemItem, amount: number, rules: GemRules): number {
  gem.xp += amount;
  let gained = 0;
  while (gem.level < rules.maxLevel && gem.xp >= gemXpToNext(gem.level, rules)) {
    gem.xp -= gemXpToNext(gem.level, rules);
    gem.level++;
    gained++;
  }
  if (gem.level >= rules.maxLevel) gem.xp = 0;
  if (gem.kind === "skill_gem") {
    const sockets = gem.sockets ?? [];
    while (sockets.length < socketCount(gem.level, rules)) sockets.push(null);
    gem.sockets = sockets;
  }
  return gained;
}

export function makeGem(save: Pick<CharacterSave, "nextUid">, kind: GemItem["kind"], defId: string, rules: GemRules, level = 1): GemItem {
  const gem: GemItem = { uid: save.nextUid++, kind, defId, level, xp: 0 };
  if (kind === "skill_gem") gem.sockets = Array.from({ length: socketCount(level, rules) }, () => null);
  return gem;
}
