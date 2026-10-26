// Player stat building and progression: level, XP, attributes.
// Stats = character base + per-level gains + attribute bonuses (+ gear/passives later).

import type { AttributeBonuses, Character, MonsterScaling, Progression } from "../data/types";
import { computeStat, computeStats, scaleMods, type Modifier, type StatBlock } from "./stats";

export const ATTRIBUTES = ["strength", "dexterity", "intelligence"] as const;

export interface StatContent {
  progression: Progression;
  attributes: AttributeBonuses;
}

/** Every modifier the player has, in two passes: attributes first, then what attributes grant. */
export function playerModifiers(character: Character, level: number, content: StatContent, extra: readonly Modifier[] = []): Modifier[] {
  const levelMods = scaleMods(content.progression.perLevel, level - 1, "level");
  const pre = [...levelMods, ...extra];
  const attrMods: Modifier[] = [];
  for (const attr of ATTRIBUTES) {
    const points = computeStat(attr, character.base[attr] ?? 0, pre);
    attrMods.push(...scaleMods(content.attributes[attr], points, `attribute:${attr}`));
  }
  return [...pre, ...attrMods];
}

/** Untagged (global) stats for the sheet and defences. Tagged stats are evaluated per hit. */
export function playerStats(character: Character, level: number, content: StatContent, extra: readonly Modifier[] = []): StatBlock {
  return computeStats(character.base, playerModifiers(character, level, content, extra));
}

export function xpToNext(level: number, p: Progression): number {
  if (level >= p.maxLevel) return Infinity;
  return Math.round(p.xpToNext.base * Math.pow(p.xpToNext.growth, level - 1));
}

/** XP for a kill: scaled by monster level, reduced when levels are far apart. */
export function xpForKill(baseXp: number, monsterLevel: number, playerLevel: number, p: Progression, scaling: MonsterScaling): number {
  const raw = baseXp * Math.pow(scaling.xp, monsterLevel - 1);
  const gap = Math.max(0, Math.abs(playerLevel - monsterLevel) - p.xpPenalty.freeLevels);
  const mult = Math.max(p.xpPenalty.min, 1 - gap * p.xpPenalty.perLevel);
  return raw * mult;
}

/** Apply XP; returns the number of levels gained. */
export function gainXp(state: { level: number; xp: number }, amount: number, p: Progression): number {
  state.xp += amount;
  let gained = 0;
  while (state.level < p.maxLevel && state.xp >= xpToNext(state.level, p)) {
    state.xp -= xpToNext(state.level, p);
    state.level++;
    gained++;
  }
  if (state.level >= p.maxLevel) state.xp = 0;
  return gained;
}

export function monsterScale(stat: keyof MonsterScaling, level: number, scaling: MonsterScaling): number {
  return Math.pow(scaling[stat], level - 1);
}
