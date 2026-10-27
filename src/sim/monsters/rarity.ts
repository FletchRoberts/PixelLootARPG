// Monster rarity and monster mods. Packs roll a rarity (monster-rarity.json): magic packs
// share mods; rare and Legendary ("unique") packs have a named leader with its own mods and
// magic minions. Mods (monster-mods.json) are data: summed stats, granted attacks, on-death
// attacks. Rarity multiplies life, damage, XP and loot.

import type { Rng } from "../core/rng";
import type { MonsterAttackDef, MonsterModDef, MonsterRarity, MonsterRarityRules } from "../data/types";
import type { MonsterState } from "../world";

export interface RarityContent {
  monsterMods: MonsterModDef[];
  monsterRarity: MonsterRarityRules;
  gear: { rareNames: { first: string[]; second: string[] } };
}

/** Rarity of a pack. `boost` (map mods, later) multiplies the magic/rare/unique weights. */
export function rollPackRarity(content: RarityContent, rng: Rng, boost = 1): MonsterRarity {
  const w = content.monsterRarity.packWeights;
  const entries = (Object.keys(w) as MonsterRarity[]).map((id) => ({ id, weight: id === "normal" ? w[id] : w[id] * boost }));
  return rng.weighted(entries)?.id ?? "normal";
}

/** `count` different mods, avoiding `except`. */
export function rollMonsterMods(content: RarityContent, rng: Rng, count: number, except: string[] = []): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const pool = content.monsterMods.filter((m) => !out.includes(m.id) && !except.includes(m.id));
    const pick = rng.weighted(pool);
    if (pick) out.push(pick.id);
  }
  return out;
}

export function modCount(content: RarityContent, rng: Rng, rarity: MonsterRarity): number {
  const [lo, hi] = content.monsterRarity.rarities[rarity].mods;
  return rng.int(lo, hi);
}

/** Mod stats summed (life, damage, speed, regen, …). */
export function modStats(content: RarityContent, mods: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of mods) {
    const def = content.monsterMods.find((m) => m.id === id);
    for (const [k, v] of Object.entries(def?.stats ?? {})) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

/** Its def's attacks plus any its mods grant (cooldowns are indexed by this list). */
export function attacksOf(content: RarityContent, m: MonsterState, defAttacks: MonsterAttackDef[] | undefined): MonsterAttackDef[] {
  const extra = m.mods.map((id) => content.monsterMods.find((d) => d.id === id)?.attack).filter((a): a is MonsterAttackDef => !!a);
  return extra.length ? [...(defAttacks ?? []), ...extra] : (defAttacks ?? []);
}

/** Attacks that go off where the monster died (Volatile). */
export function deathAttacks(content: RarityContent, m: MonsterState): MonsterAttackDef[] {
  return m.mods.map((id) => content.monsterMods.find((d) => d.id === id)?.onDeath).filter((a): a is MonsterAttackDef => !!a);
}

export function rareMonsterName(content: RarityContent, rng: Rng): string {
  const { first, second } = content.gear.rareNames;
  return `${first[Math.floor(rng.next() * first.length)]} ${second[Math.floor(rng.next() * second.length)]}`;
}

/**
 * Make a freshly spawned (normal) monster this rarity with these mods: life, damage and the
 * summed mod stats. Its attack cooldowns are re-made to include mod attacks.
 */
export function applyRarity(
  content: RarityContent,
  m: MonsterState,
  rarity: MonsterRarity,
  mods: string[],
  defAttacks: MonsterAttackDef[] | undefined,
  rng: Rng,
  mult: { life: number; damage: number } = content.monsterRarity.rarities[rarity], // bosses pass milder ones
): void {
  const r = mult;
  m.rarity = rarity;
  m.mods = mods;
  m.mstats = modStats(content, mods);
  const life = m.maxLife * r.life * (1 + (m.mstats.life ?? 0) / 100);
  m.maxLife = life;
  m.life = life;
  m.damageMult *= r.damage * (1 + (m.mstats.damage ?? 0) / 100);
  m.cooldowns = attacksOf(content, m, defAttacks).map((a) => rng.range(0.3, 1) * a.cooldown);
}
