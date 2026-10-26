// Hit pipeline from docs/combat.md §3–4.
// Attacker: base → added flat → increased/more per type → roll → crit.
// Defender: evasion (entropy) → armour vs physical → resistances → less damage taken.

import type { Rng } from "../core/rng";
import { computeStat, statParts, type Modifier } from "../stats/stats";

export const DAMAGE_TYPES = ["physical", "fire", "cold", "lightning", "chaos"] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];
export const ELEMENTS = ["fire", "cold", "lightning", "chaos"] as const;
export type Element = (typeof ELEMENTS)[number];

export type DamageRange = Partial<Record<DamageType, [number, number]>>;
export type DamageAmounts = Partial<Record<DamageType, number>>;

/** Tunable constants (src/data/combat.json). */
export interface CombatRules {
  armourFactor: number; // DR = A / (A + factor × physical)
  armourCap: number; // 0..1
  hitChance: { scale: number; evasionWeight: number; min: number; max: number };
  resistance: { defaultMax: number; hardMax: number; floor: number };
  critBonusBase: number; // percent added on crit
  ailments: {
    chill: { duration: number; slow: number }; // any cold hit: slow % for duration s
    freeze: { threshold: number; secondsPerPercent: number; min: number; max: number }; // cold hit ≥ threshold % of max life
    ignite: { dpsPercentOfHit: number; duration: number }; // fire hit, chance from ignite_chance
  };
}

export interface Hit {
  damage: DamageAmounts;
  crit: boolean;
  accuracy: number;
  isAttack: boolean; // spells skip the evasion check
  penetration?: Partial<Record<Element, number>>;
}

export interface HitSource {
  base: DamageRange;
  tags: readonly string[]; // e.g. ["attack", "melee"]; damage type tags are added per type
  critChance: number; // base percent
  accuracy: number;
  isAttack: boolean;
  damageEffectiveness?: number; // 1 = full (children of skills use less)
}

/** Tags a hit of one damage type is evaluated with: source tags + type (+ "elemental"). */
function typeTags(src: HitSource, type: DamageType): string[] {
  return type === "physical" || type === "chaos" ? [...src.tags, type] : [...src.tags, type, "elemental"];
}

/**
 * Final min–max for one damage type before the roll. Added flat damage comes from
 * `added_<type>_min` / `added_<type>_max`; increased from generic `damage` and
 * `<type>_damage` share one bucket; each more multiplies. Returns null if none.
 */
export function scaledRange(src: HitSource, mods: readonly Modifier[], type: DamageType): [number, number] | null {
  const eff = src.damageEffectiveness ?? 1;
  const tags = typeTags(src, type);
  const [bMin, bMax] = src.base[type] ?? [0, 0];
  const min = bMin + computeStat(`added_${type}_min`, 0, mods, tags) * eff;
  const max = bMax + computeStat(`added_${type}_max`, 0, mods, tags) * eff;
  if (max <= 0) return null;
  const g = statParts("damage", mods, tags);
  const t = statParts(`${type}_damage`, mods, tags);
  const scale = Math.max(0, 1 + (g.increased + t.increased) / 100) * g.more * t.more;
  return [min * scale, max * scale];
}

export function critStats(src: HitSource, mods: readonly Modifier[], rules: CombatRules): { chance: number; bonus: number } {
  return {
    chance: Math.min(100, computeStat("crit_chance", src.critChance, mods, src.tags)),
    bonus: computeStat("crit_bonus", rules.critBonusBase, mods, src.tags),
  };
}

/** Roll an outgoing hit (docs/combat.md §3). */
export function rollHit(src: HitSource, mods: readonly Modifier[], rules: CombatRules, rng: Rng): Hit {
  const damage: DamageAmounts = {};
  for (const type of DAMAGE_TYPES) {
    const r = scaledRange(src, mods, type);
    if (r) damage[type] = r[0] + rng.next() * (r[1] - r[0]);
  }
  const { chance, bonus } = critStats(src, mods, rules);
  const crit = rng.next() * 100 < chance;
  if (crit) for (const t of DAMAGE_TYPES) if (damage[t] !== undefined) damage[t] = damage[t]! * (1 + bonus / 100);
  return { damage, crit, accuracy: src.accuracy, isAttack: src.isAttack };
}

export interface HitSummary {
  ranges: Partial<Record<DamageType, [number, number]>>;
  average: number; // average non-crit hit, all types
  critChance: number;
  critBonus: number;
  averageWithCrit: number;
}

/** Tooltip numbers for a hit source, from the same functions rollHit uses. */
export function expectedHit(src: HitSource, mods: readonly Modifier[], rules: CombatRules): HitSummary {
  const ranges: HitSummary["ranges"] = {};
  let average = 0;
  for (const type of DAMAGE_TYPES) {
    const r = scaledRange(src, mods, type);
    if (!r) continue;
    ranges[type] = r;
    average += (r[0] + r[1]) / 2;
  }
  const { chance, bonus } = critStats(src, mods, rules);
  return { ranges, average, critChance: chance, critBonus: bonus, averageWithCrit: average * (1 + (chance / 100) * (bonus / 100)) };
}

export interface Defences {
  armour: number;
  evasion: number;
  resist: Partial<Record<Element, number>>; // percent, before caps
  maxResist?: Partial<Record<Element, number>>; // percent; defaults to rules.resistance.defaultMax
  damageTakenLess?: number; // percent, combined "less damage taken"
}

export interface HitResult {
  evaded: boolean;
  byType: DamageAmounts;
  total: number;
}

/** PoE2 chance to hit: clamp(scale × acc / (acc + weight × eva), min, max). */
export function chanceToHit(accuracy: number, evasion: number, rules: CombatRules): number {
  const h = rules.hitChance;
  if (evasion <= 0) return h.max;
  const raw = (h.scale * accuracy) / (accuracy + h.evasionWeight * evasion);
  return Math.min(h.max, Math.max(h.min, raw));
}

/** Armour reduction against one physical hit, capped. */
export function armourReduction(armour: number, physical: number, rules: CombatRules): number {
  if (armour <= 0 || physical <= 0) return 0;
  return Math.min(rules.armourCap, armour / (armour + rules.armourFactor * physical));
}

/** Effective resistance after cap, floor and penetration (penetration applies to the capped value). */
export function effectiveResist(element: Element, def: Defences, rules: CombatRules, penetration = 0): number {
  const max = Math.min(rules.resistance.hardMax, def.maxResist?.[element] ?? rules.resistance.defaultMax);
  const capped = Math.max(rules.resistance.floor, Math.min(max, def.resist[element] ?? 0));
  return capped - penetration;
}

/**
 * Entropy evasion (docs/combat.md §4.1): the counter accumulates hit chance;
 * the attack lands when it reaches 1. Returns the new counter and whether it hit.
 */
export function entropyRoll(counter: number, hitChance: number): { counter: number; hit: boolean } {
  const next = counter + hitChance;
  if (next >= 1) return { counter: next - 1, hit: true };
  return { counter: next, hit: false };
}

/** Apply a hit to a defender. `entropy` is the defender's evasion counter (updated in place by the caller). */
export function applyHit(hit: Hit, def: Defences, rules: CombatRules, entropy: { value: number }): HitResult {
  if (hit.isAttack) {
    const roll = entropyRoll(entropy.value, chanceToHit(hit.accuracy, def.evasion, rules));
    entropy.value = roll.counter;
    if (!roll.hit) return { evaded: true, byType: {}, total: 0 };
  }

  const byType: DamageAmounts = {};
  let total = 0;
  for (const type of DAMAGE_TYPES) {
    let d = hit.damage[type];
    if (!d) continue;
    if (type === "physical") d *= 1 - armourReduction(def.armour, d, rules);
    else d *= 1 - effectiveResist(type, def, rules, hit.penetration?.[type] ?? 0) / 100;
    d *= 1 - (def.damageTakenLess ?? 0) / 100;
    byType[type] = d;
    total += d;
  }
  return { evaded: false, byType, total };
}
