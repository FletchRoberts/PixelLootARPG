// Skill system data model (docs/skills.md). Skills are trees of deliveries; supports
// change them through tag-scoped modifiers and generic trigger additions.

import type { DamageRange } from "../combat/damage";
import type { Modifier } from "../stats/stats";

export type DeliveryKind = "projectile" | "melee";
export type TriggerEvent = "hit" | "end" | "kill";
export type Pattern = "spread" | "ring";
export type Scope = "all" | "root" | "children";

/** One delivery in a skill's tree, as written in data. Numbers are base values before modifiers. */
export interface DeliveryDef {
  kind: DeliveryKind;
  tags: string[];
  damage?: DamageRange; // omit to use the weapon's damage (attacks) or inherit the parent's (children)
  damageEffectiveness?: number; // multiplies damage relative to the parent (children)
  procCoefficient?: number; // relative to the parent; scales trigger chances later
  knockback?: number;
  // projectile
  count?: number;
  pattern?: Pattern;
  spreadDegrees?: number; // total cone for "spread"
  speed?: number; // px/s
  range?: number; // px travelled before it ends
  radius?: number; // px
  pierce?: number;
  chain?: number;
  fork?: number;
  // melee
  arcDegrees?: number;
  reach?: number; // px from the caster's edge
  on?: Partial<Record<TriggerEvent, DeliveryDef[]>>;
}

export interface SkillDef {
  id: string;
  name: string;
  attribute: "strength" | "dexterity" | "intelligence";
  tags: string[]; // e.g. ["spell", "projectile", "cold"]; attacks include "attack"
  cost: number; // mana
  castTime: number; // seconds (spells); attacks use the weapon's speed
  critChance: number; // percent (spells); attacks use the weapon's
  root: DeliveryDef;
}

/** Modifier in support data, with an optional scope inside the skill tree. */
export interface SupportModDef extends Omit<Modifier, "source"> {
  scope?: Scope;
}

export interface SupportDef {
  id: string;
  name: string;
  description: string;
  requires: string[]; // skill must have at least one of these tags (on any node)
  costMultiplier: number;
  mods?: SupportModDef[];
  add?: {
    to: string[]; // nodes having all of these tags
    scope: Scope;
    on: TriggerEvent;
    spawn: DeliveryDef;
  };
}

/** The player's chosen skills and supports. Plain data; a command changes it. */
export interface Loadout {
  weapon: string;
  autoSupports: string[];
  slots: { skill: string | null; supports: string[] }[];
}

/** A delivery after compiling: final numbers, its own modifier list, flattened children. */
export interface CompiledNode {
  kind: DeliveryKind;
  tags: string[];
  depth: number;
  base: DamageRange; // after effectiveness
  effectiveness: number; // cumulative, for added damage
  procCoefficient: number; // cumulative
  mods: Modifier[]; // player + support modifiers that reach this node (for rollHit)
  knockback: number;
  count: number;
  pattern: Pattern;
  spread: number; // radians
  speed: number;
  range: number;
  radius: number;
  pierce: number;
  chain: number;
  fork: number;
  arc: number; // radians
  reach: number;
  on: Partial<Record<TriggerEvent, number[]>>; // indices into CompiledSkill.nodes
}

export interface CompiledSkill {
  id: string; // skill id, or "auto:<weapon>"
  name: string;
  isAttack: boolean;
  cost: number;
  interval: number; // seconds per use (cast time or attack interval)
  critChance: number;
  nodes: CompiledNode[]; // nodes[0] is the root
  supports: string[];
}
