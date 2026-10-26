// Stats and modifiers: one aggregation used by combat and tooltips alike.
// final = (base + Σ flat) × (1 + Σ increased / 100) × Π (1 + more / 100)
// See docs/combat.md §1.

export type StatId = string;
export type ModKind = "flat" | "increased" | "more";

export interface Modifier {
  stat: StatId;
  kind: ModKind;
  value: number; // flat amount, or percent for increased/more (negative = reduced/less)
  tags?: string[]; // only applies when the context has all of these tags
  source?: string; // for tooltips/debugging: "level", "attribute:str", item id, …
}

export type StatBlock = Record<StatId, number>;

/** A modifier applies when every one of its tags is present in the context. */
export function appliesTo(mod: Modifier, contextTags: readonly string[]): boolean {
  return !mod.tags || mod.tags.every((t) => contextTags.includes(t));
}

export interface StatParts {
  flat: number;
  increased: number; // summed percent
  more: number; // product multiplier (1 = none)
}

export function statParts(stat: StatId, mods: readonly Modifier[], contextTags: readonly string[] = []): StatParts {
  let flat = 0;
  let increased = 0;
  let more = 1;
  for (const m of mods) {
    if (m.stat !== stat || !appliesTo(m, contextTags)) continue;
    if (m.kind === "flat") flat += m.value;
    else if (m.kind === "increased") increased += m.value;
    else more *= 1 + m.value / 100;
  }
  return { flat, increased, more };
}

/** Final value of one stat. Increased can't drive a stat below zero. */
export function computeStat(stat: StatId, base: number, mods: readonly Modifier[], contextTags: readonly string[] = []): number {
  const p = statParts(stat, mods, contextTags);
  return (base + p.flat) * Math.max(0, 1 + p.increased / 100) * p.more;
}

/**
 * Final values for every stat that has a base or a modifier.
 * Context tags select scoped modifiers (e.g. ["attack", "melee"]); untagged ones always apply.
 */
export function computeStats(base: StatBlock, mods: readonly Modifier[], contextTags: readonly string[] = []): StatBlock {
  const ids = new Set<StatId>([...Object.keys(base), ...mods.map((m) => m.stat)]);
  const out: StatBlock = {};
  for (const id of ids) out[id] = computeStat(id, base[id] ?? 0, mods, contextTags);
  return out;
}

/** Convenience: build N copies of per-point modifiers (e.g. attribute bonuses × points). */
export function scaleMods(mods: readonly Modifier[], times: number, source: string): Modifier[] {
  if (times === 0) return [];
  return mods.map((m) => ({ ...m, value: m.value * times, source }));
}
