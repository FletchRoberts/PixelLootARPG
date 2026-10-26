// Compile skill + supports + player modifiers into a flat tree of final numbers.
// Recompiled when loadout, level or (later) gear changes; the runtime only reads it.

import type { DamageRange } from "../combat/damage";
import type { WeaponDef } from "../data/types";
import { computeStat, type Modifier } from "../stats/stats";
import type { CompiledNode, CompiledSkill, DeliveryDef, Scope, SkillDef, SupportDef, TriggerEvent } from "./types";

export const MAX_DEPTH = 3; // generations of triggered children (docs/skills.md limits)
const DEG = Math.PI / 180;
const DEFAULT_SPREAD_PER_EXTRA = 12; // degrees between extra projectiles in a spread
const KIND_TAGS = ["spell", "attack"]; // children inherit these from their parent

const inScope = (scope: Scope | undefined, depth: number) => !scope || scope === "all" || (scope === "root" ? depth === 0 : depth > 0);

/** Every tag used anywhere in a delivery tree. */
function treeTags(def: DeliveryDef, out = new Set<string>()): Set<string> {
  for (const t of def.tags) out.add(t);
  for (const list of Object.values(def.on ?? {})) for (const child of list ?? []) treeTags(child, out);
  return out;
}

/** Can this support go in this skill? It needs at least one of its required tags somewhere in the skill. */
export function supportFits(support: SupportDef, skill: Pick<SkillDef, "tags" | "root">): boolean {
  const tags = treeTags(skill.root, new Set(skill.tags));
  return support.requires.some((t) => tags.has(t));
}

function scaleRange(r: DamageRange, k: number): DamageRange {
  const out: DamageRange = {};
  for (const [t, v] of Object.entries(r) as [keyof DamageRange, [number, number]][]) out[t] = [v[0] * k, v[1] * k];
  return out;
}

interface CompileInput {
  skill: Pick<SkillDef, "id" | "name" | "tags" | "cost" | "castTime" | "critChance" | "root">;
  supports: SupportDef[];
  playerMods: readonly Modifier[];
  weapon?: WeaponDef; // attacks take damage, speed and crit from the weapon
}

export function compileSkill({ skill, supports, playerMods, weapon }: CompileInput): CompiledSkill {
  const fitting = supports.filter((s) => supportFits(s, skill));
  const isAttack = skill.tags.includes("attack");
  const nodes: CompiledNode[] = [];

  const modsAt = (depth: number): Modifier[] => [
    ...playerMods,
    ...fitting.flatMap((s) => (s.mods ?? []).filter((m) => inScope(m.scope, depth)).map(({ scope: _scope, ...m }) => ({ ...m, source: s.id }))),
  ];

  function compile(def: DeliveryDef, depth: number, parent: { raw: DamageRange; eff: number; proc: number; tags: string[] } | null): number {
    const tags = [...new Set([...def.tags, ...(parent ? parent.tags.filter((t) => KIND_TAGS.includes(t)) : skill.tags.filter((t) => KIND_TAGS.includes(t)))])];
    const raw = def.damage ?? parent?.raw ?? weapon?.damage ?? {};
    const eff = (parent?.eff ?? 1) * (def.damageEffectiveness ?? 1);
    const proc = (parent?.proc ?? 1) * (def.procCoefficient ?? 1);
    const mods = modsAt(depth);
    const stat = (id: string, base: number) => computeStat(id, base, mods, tags);

    const count = Math.max(1, Math.round(stat("projectile_count", def.count ?? 1)));
    const extra = count - 1;
    const node: CompiledNode = {
      kind: def.kind,
      tags,
      depth,
      base: scaleRange(raw, eff),
      effectiveness: eff,
      procCoefficient: proc,
      mods,
      knockback: def.knockback ?? 0,
      count,
      pattern: def.pattern ?? "spread",
      spread: (def.spreadDegrees ?? DEFAULT_SPREAD_PER_EXTRA * extra) * DEG,
      speed: stat("projectile_speed", def.speed ?? 0),
      range: stat("projectile_range", def.range ?? 0),
      radius: def.radius ?? 0,
      pierce: Math.round(stat("pierce", def.pierce ?? 0)),
      chain: Math.round(stat("chain", def.chain ?? 0)),
      fork: Math.round(stat("fork", def.fork ?? 0)),
      arc: (def.arcDegrees ?? 0) * DEG,
      reach: def.reach ?? 0,
      on: {},
    };
    const index = nodes.push(node) - 1;
    if (depth >= MAX_DEPTH) return index;

    const children: Partial<Record<TriggerEvent, DeliveryDef[]>> = {};
    for (const [event, list] of Object.entries(def.on ?? {}) as [TriggerEvent, DeliveryDef[]][]) children[event] = [...list];
    for (const s of fitting) {
      const add = s.add;
      if (!add || !inScope(add.scope, depth) || !add.to.every((t) => tags.includes(t))) continue;
      (children[add.on] ??= []).push(add.spawn);
    }
    for (const [event, list] of Object.entries(children) as [TriggerEvent, DeliveryDef[]][]) {
      node.on[event] = list.map((child) => compile(child, depth + 1, { raw, eff, proc, tags }));
    }
    return index;
  }

  compile(skill.root, 0, null);

  const rootMods = nodes[0]!.mods;
  const cost = skill.cost * fitting.reduce((m, s) => m * s.costMultiplier, 1);
  const interval = isAttack
    ? 1 / computeStat("attack_speed", weapon?.attacksPerSecond ?? 1, rootMods, skill.tags)
    : skill.castTime / computeStat("cast_speed", 1, rootMods, skill.tags);
  return {
    id: skill.id,
    name: skill.name,
    isAttack,
    cost,
    interval,
    critChance: isAttack ? (weapon?.critChance ?? 0) : skill.critChance,
    nodes,
    supports: fitting.map((s) => s.id),
  };
}

/** The weapon's attack as a skill definition. */
export function weaponAttackSkill(weapon: WeaponDef): CompileInput["skill"] {
  return {
    id: `weapon:${weapon.id}`,
    name: weapon.attack.name,
    tags: weapon.attack.tags,
    cost: 0,
    castTime: 0,
    critChance: weapon.critChance,
    root: weapon.attack.root,
  };
}
