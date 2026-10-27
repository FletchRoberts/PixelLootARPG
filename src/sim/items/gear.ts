// Gear: rolling items (base → rarity → implicits → affixes by tier/item level), turning
// equipped gear into stat modifiers and support grants, and tooltip text.

import type { Rng } from "../core/rng";
import type { Affix, GearRules, GearSlot, ItemBase, RangedModDef, UniqueDef } from "../data/types";
import type { Modifier } from "../stats/stats";
import type { CharacterSave, EquipSlot, GearItem, Rarity, RolledMod } from "./types";

export interface GearContent {
  itemBases: ItemBase[];
  affixes: Affix[];
  uniques: UniqueDef[];
  gear: GearRules;
}

export interface RollOptions {
  base?: string; // force a base
  rarity?: Rarity; // force a rarity (unique picks a unique; falls back to rare if none fits)
  unique?: string; // force a specific unique
}

export const rollRange = (rng: Rng, [lo, hi]: [number, number]) => rng.int(lo, hi);

/** Roll a new item at an item level. Deterministic for a given rng state. */
export function rollGear(content: GearContent, rng: Rng, ilvl: number, uid: number, opts: RollOptions = {}): GearItem | null {
  // Uniques pick their own base.
  const rarity = opts.unique ? "unique" : (opts.rarity ?? (rng.weighted(Object.entries(content.gear.rarityWeights).map(([id, weight]) => ({ id: id as Rarity, weight })))?.id ?? "normal"));
  if (rarity === "unique") {
    const pool = content.uniques.filter((u) => (opts.unique ? u.id === opts.unique : (dropLevel(content, u.base) ?? Infinity) <= ilvl));
    const u = rng.weighted(pool);
    if (u) return rollUnique(content, rng, ilvl, uid, u);
    if (opts.unique) return null;
  }
  const bases = content.itemBases.filter((b) => (opts.base ? b.id === opts.base : b.dropLevel <= ilvl));
  const base = bases[Math.floor(rng.next() * bases.length)];
  if (!base) return null;
  const item: GearItem = {
    uid,
    kind: "gear",
    base: base.id,
    rarity: rarity === "unique" ? "rare" : rarity,
    ilvl,
    implicits: (base.implicits ?? []).map((m) => rollRange(rng, m.value)),
    mods: [],
  };
  if (item.rarity === "magic" || item.rarity === "rare") {
    rollMods(content, rng, base, item, item.rarity);
    if (item.mods.length === 0) item.rarity = "normal";
    if (item.rarity === "rare") item.name = rareName(content, rng);
  }
  return item;
}

/** Fill an item with a fresh set of mods for a rarity (magic 1–2, rare 4–6 by default). */
export function rollMods(content: Pick<GearContent, "affixes" | "gear">, rng: Rng, base: Pick<ItemBase, "tags">, item: { mods: RolledMod[]; ilvl: number }, rarity: "magic" | "rare"): void {
  item.mods.length = 0; // in place: callers may pass a view sharing the mods array
  const target = rng.int(content.gear.affixCount[rarity][0], content.gear.affixCount[rarity][1]);
  for (let i = 0; i < target; i++) {
    const mod = rollAffix(content, rng, base, item, content.gear.maxPerKind[rarity]);
    if (mod) item.mods.push(mod);
  }
}

export const rareName = (content: Pick<GearContent, "gear">, rng: Rng) => `${pick(rng, content.gear.rareNames.first)} ${pick(rng, content.gear.rareNames.second)}`;

function dropLevel(content: GearContent, baseId: string): number | undefined {
  return content.itemBases.find((b) => b.id === baseId)?.dropLevel;
}

function pick<T>(rng: Rng, list: T[]): T {
  return list[Math.floor(rng.next() * list.length)]!;
}

function rollUnique(content: GearContent, rng: Rng, ilvl: number, uid: number, u: UniqueDef): GearItem | null {
  const base = content.itemBases.find((b) => b.id === u.base);
  if (!base) return null;
  return {
    uid,
    kind: "gear",
    base: base.id,
    rarity: "unique",
    ilvl,
    name: u.name,
    implicits: (base.implicits ?? []).map((m) => rollRange(rng, m.value)),
    mods: [],
    unique: u.id,
    uniqueValues: u.mods.map((m) => rollRange(rng, m.value)),
  };
}

/** Add one affix the item doesn't have a group for; prefix/suffix limits respected. Weighted by eligible tiers. */
export function rollAffix(content: Pick<GearContent, "affixes">, rng: Rng, base: Pick<ItemBase, "tags">, item: { mods: RolledMod[]; ilvl: number }, maxPerKind: number): RolledMod | null {
  const have = item.mods.map((m) => content.affixes.find((a) => a.id === m.affix)).filter((a): a is Affix => !!a);
  const count = (kind: Affix["kind"]) => have.filter((a) => a.kind === kind).length;
  const groups = new Set(have.map((a) => a.group));
  const pool = content.affixes
    .filter((a) => count(a.kind) < maxPerKind && !groups.has(a.group) && a.tags.some((t) => base.tags.includes(t)))
    .map((a) => ({ affix: a, tiers: a.tiers.filter((t) => t.itemLevel <= item.ilvl) }))
    .filter((e) => e.tiers.length > 0)
    .map((e) => ({ ...e, weight: e.tiers.reduce((sum, t) => sum + t.weight, 0) }));
  const chosen = rng.weighted(pool);
  if (!chosen) return null;
  const tier = rng.weighted(chosen.tiers)!;
  return { affix: chosen.affix.id, tier: tier.tier, values: tier.values.map((r) => rollRange(rng, r)) };
}

// ---------------------------------------------------------------- equipping

/** Which slot an item goes in (rings: first free ring slot, else ring1). */
export function slotFor(base: ItemBase, equipment: CharacterSave["equipment"]): EquipSlot {
  const s: GearSlot = base.slot;
  if (s !== "ring") return s;
  return !equipment.ring1 ? "ring1" : !equipment.ring2 ? "ring2" : "ring1";
}

export function slotAccepts(slot: EquipSlot, base: ItemBase): boolean {
  return slot === base.slot || ((slot === "ring1" || slot === "ring2") && base.slot === "ring");
}

/** Why the character can't equip this, or null. Attributes are checked against current totals. */
export function requirementProblem(base: ItemBase, level: number, attributes: { strength: number; dexterity: number; intelligence: number }): string | null {
  const r = base.requires ?? {};
  if ((r.level ?? 0) > level) return `needs level ${r.level}`;
  for (const a of ["strength", "dexterity", "intelligence"] as const) {
    if ((r[a] ?? 0) > attributes[a]) return `needs ${r[a]} ${a}`;
  }
  return null;
}

// ---------------------------------------------------------------- stats

const ranged = (defs: RangedModDef[] | undefined, values: number[] | undefined, source: string): Modifier[] =>
  (defs ?? []).map((m, i) => ({ stat: m.stat, kind: m.kind, value: values?.[i] ?? m.value[0], tags: m.tags, source }));

/** Every stat modifier an item grants: implicits, affixes, unique mods. */
export function itemModifiers(content: GearContent, item: GearItem): Modifier[] {
  const base = content.itemBases.find((b) => b.id === item.base);
  const source = item.name ?? base?.name ?? item.base;
  const out = ranged(base?.implicits, item.implicits, source);
  for (const m of item.mods) {
    const affix = content.affixes.find((a) => a.id === m.affix);
    affix?.mods.forEach((def, i) => out.push({ stat: def.stat, kind: def.kind, value: m.values[i] ?? 0, tags: def.tags, source }));
  }
  if (item.unique) {
    const u = content.uniques.find((x) => x.id === item.unique);
    out.push(...ranged(u?.mods, item.uniqueValues, source));
  }
  return out;
}

export function equipmentModifiers(content: GearContent, equipment: CharacterSave["equipment"]): Modifier[] {
  return Object.values(equipment).flatMap((item) => (item ? itemModifiers(content, item) : []));
}

/** Supports granted by equipped uniques, with the skill tags they need. */
export function equipmentGrants(content: GearContent, equipment: CharacterSave["equipment"]): { support: string; tags: string[] }[] {
  return Object.values(equipment).flatMap((item) => {
    const u = item?.unique ? content.uniques.find((x) => x.id === item.unique) : undefined;
    return (u?.grants ?? []).map((g) => ({ support: g.support, tags: g.tags ?? [] }));
  });
}

// ---------------------------------------------------------------- text

export const fill = (template: string, values: number[]) => template.replace(/\{(\d+)\}/g, (_, i: string) => String(values[Number(i)] ?? "?"));

const STAT_LABEL: Record<string, string> = {
  life: "maximum Life",
  mana: "maximum Mana",
  mana_regen: "Mana Regeneration per second",
  projectile_count: "Projectiles",
  crit_bonus: "Critical Strike Multiplier",
  added_physical_min: "minimum Physical Damage to Attacks",
  added_physical_max: "maximum Physical Damage to Attacks",
};

/** "fire_resistance" → "Fire Resistance" unless there's a better label above. */
const statLabel = (stat: string) => STAT_LABEL[stat] ?? stat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Any modifier as a line of text: "+12 to maximum Life", "10% increased Spell Damage",
 * "35% less Projectile Damage". Tags become a prefix on the stat name.
 */
export function modifierText(m: { stat: string; kind: "flat" | "increased" | "more"; value: number; tags?: string[] }): string {
  const scope = (m.tags ?? []).map((t) => t[0]!.toUpperCase() + t.slice(1)).join(" ");
  const label = [scope, statLabel(m.stat)].filter(Boolean).join(" ");
  const pct = m.stat.endsWith("resistance") || m.stat.endsWith("leech") || m.stat === "crit_bonus" || m.stat === "ignite_chance";
  if (m.kind === "flat") return `${m.value >= 0 ? "+" : ""}${m.value}${pct ? "%" : ""} to ${label}`;
  if (m.kind === "increased") return `${Math.abs(m.value)}% ${m.value >= 0 ? "increased" : "reduced"} ${label}`;
  return `${Math.abs(m.value)}% ${m.value >= 0 ? "more" : "less"} ${label}`;
}

function rangedText(m: RangedModDef, value: number): string {
  const label = statLabel(m.stat);
  if (m.kind === "flat") return `${m.stat.endsWith("resistance") ? `+${value}%` : `+${value}`} to ${label}`;
  return `${value}% ${m.kind === "increased" ? "increased" : "more"} ${label}`;
}

export interface ItemText {
  name: string; // display name (rare/unique name, or "Magic Iron Cap" style)
  baseName: string;
  rarity: Rarity;
  requires: string | null;
  implicits: string[];
  mods: string[]; // with tier tags, e.g. "+42 to maximum Life  (T3)"
  grants: string[];
  flavour?: string;
  corrupted: boolean;
}

export function itemText(content: GearContent, item: GearItem): ItemText {
  const base = content.itemBases.find((b) => b.id === item.base);
  const baseName = base?.name ?? item.base;
  const req = base?.requires;
  const reqParts = req ? [req.level && `Level ${req.level}`, req.strength && `${req.strength} Str`, req.dexterity && `${req.dexterity} Dex`, req.intelligence && `${req.intelligence} Int`].filter(Boolean) : [];
  // Two Iron Ring implicits read better as one "Adds 1 to 4 ..." line.
  const imps = base?.implicits ?? [];
  let implicits = imps.map((m, i) => rangedText(m, item.implicits[i] ?? m.value[0]));
  if (imps.length === 2 && imps[0]!.stat.endsWith("_min") && imps[1]!.stat.endsWith("_max")) {
    const type = imps[0]!.stat.replace(/^added_/, "").replace(/_min$/, "");
    implicits = [`Adds ${item.implicits[0]} to ${item.implicits[1]} ${statLabel(type)} Damage to Attacks`];
  }
  const mods = item.mods.map((m) => {
    const affix = content.affixes.find((a) => a.id === m.affix);
    return affix ? `${fill(affix.text, m.values)}  (T${m.tier}${affix.kind === "prefix" ? " prefix" : " suffix"})` : m.affix;
  });
  const u = item.unique ? content.uniques.find((x) => x.id === item.unique) : undefined;
  if (u) u.mods.forEach((m, i) => mods.push(fill(m.text, [item.uniqueValues?.[i] ?? m.value[0]])));
  return {
    name: item.name ?? (item.rarity === "magic" ? magicName(content, item, baseName) : baseName),
    baseName,
    rarity: item.rarity,
    requires: reqParts.length ? `Requires ${reqParts.join(", ")}` : null,
    implicits,
    mods,
    grants: (u?.grants ?? []).map((g) => g.text),
    flavour: u?.flavour,
    corrupted: !!item.corrupted,
  };
}

/** Magic items are named after their mods, PoE-style: "Healthy Iron Cap of the Fox". */
function magicName(content: GearContent, item: GearItem, baseName: string): string {
  const affix = (kind: "prefix" | "suffix") => item.mods.map((m) => content.affixes.find((a) => a.id === m.affix)).find((a) => a?.kind === kind);
  return [affix("prefix")?.name, baseName, affix("suffix")?.name].filter(Boolean).join(" ");
}
