// The character passive tree: points, allocating and refunding nodes, and the modifiers and
// support grants the allocated nodes give. The tree itself is data (passive-tree.json).
// A node can be allocated when it touches the start node or an allocated node; it can be
// refunded only if everything else stays connected to the start.

import type { PassiveNodeDef, PassiveTreeDef, Progression } from "../data/types";
import type { Modifier } from "../stats/stats";
import type { CharacterSave } from "../items/types";

export interface PassiveContent {
  passiveTree: PassiveTreeDef;
  progression: Progression;
}

const byId = new WeakMap<PassiveTreeDef, Map<string, PassiveNodeDef>>();

/** Node lookup (cached per tree). */
export function passiveNode(tree: PassiveTreeDef, id: string): PassiveNodeDef | undefined {
  let map = byId.get(tree);
  if (!map) {
    map = new Map(tree.nodes.map((n) => [n.id, n]));
    byId.set(tree, map);
  }
  return map.get(id);
}

export function totalPoints(level: number, p: Progression): number {
  return (level - 1) * p.passivePointsPerLevel;
}

export function pointsLeft(save: CharacterSave, level: number, p: Progression): number {
  return totalPoints(level, p) - save.passives.length;
}

/** Allocated nodes including the (free) start node. */
const owned = (save: CharacterSave, tree: PassiveTreeDef) => new Set([tree.start, ...save.passives]);

/** Why this node can't be allocated now, or null if it can. */
export function allocateProblem(save: CharacterSave, level: number, content: PassiveContent, id: string): string | null {
  const tree = content.passiveTree;
  const node = passiveNode(tree, id);
  if (!node) return "no such node";
  const have = owned(save, tree);
  if (have.has(id)) return "already allocated";
  if (pointsLeft(save, level, content.progression) <= 0) return "no passive points left";
  if (!node.links.some((l) => have.has(l))) return "not connected to your tree";
  return null;
}

export function allocatePassive(save: CharacterSave, level: number, content: PassiveContent, id: string): string | null {
  const problem = allocateProblem(save, level, content, id);
  if (problem) return problem;
  save.passives.push(id);
  return null;
}

/** Why this node can't be refunded (structurally), or null. Cost is checked separately. */
export function refundProblem(save: CharacterSave, content: PassiveContent, id: string): string | null {
  const tree = content.passiveTree;
  if (id === tree.start) return "the start can't be refunded";
  if (!save.passives.includes(id)) return "not allocated";
  // Everything else must still reach the start without this node.
  const rest = new Set([tree.start, ...save.passives.filter((p) => p !== id)]);
  const seen = new Set([tree.start]);
  const stack = [tree.start];
  while (stack.length) {
    for (const l of passiveNode(tree, stack.pop()!)?.links ?? []) {
      if (rest.has(l) && !seen.has(l)) {
        seen.add(l);
        stack.push(l);
      }
    }
  }
  return seen.size === rest.size ? null : "other allocated nodes depend on it";
}

/** Refunding is free below a level, else costs one refund currency (Lethe Ash). */
export function refundCost(level: number, p: Progression): { currency: string; count: number } | null {
  return level < p.passives.freeRefundsBelowLevel ? null : { currency: p.passives.refundCurrency, count: 1 };
}

export function refundPassive(save: CharacterSave, level: number, content: PassiveContent, id: string): string | null {
  const problem = refundProblem(save, content, id);
  if (problem) return problem;
  const cost = refundCost(level, content.progression);
  if (cost && (save.currency[cost.currency] ?? 0) < cost.count) return "needs Lethe Ash";
  if (cost) save.currency[cost.currency]! -= cost.count;
  save.passives = save.passives.filter((p) => p !== id);
  return null;
}

/** Stat modifiers from allocated nodes. */
export function passiveModifiers(save: CharacterSave, tree: PassiveTreeDef): Modifier[] {
  const out: Modifier[] = [];
  for (const id of save.passives) {
    const n = passiveNode(tree, id);
    if (!n) continue;
    for (const m of n.stats) out.push({ stat: m.stat, kind: m.kind, value: m.value, tags: m.tags, source: n.name });
  }
  return out;
}

/** Supports granted by allocated keystones, with the skill tags they need. */
export function passiveGrants(save: CharacterSave, tree: PassiveTreeDef): { support: string; tags: string[] }[] {
  return save.passives.flatMap((id) => (passiveNode(tree, id)?.grants ?? []).map((g) => ({ support: g.support, tags: g.tags ?? [] })));
}

/** Drop allocations that no longer exist in the tree (after a tree change) or no longer connect. */
export function cleanPassives(save: CharacterSave, tree: PassiveTreeDef): void {
  const valid = new Set(save.passives.filter((id) => passiveNode(tree, id)));
  const seen = new Set([tree.start]);
  const stack = [tree.start];
  while (stack.length) {
    for (const l of passiveNode(tree, stack.pop()!)?.links ?? []) {
      if (valid.has(l) && !seen.has(l)) {
        seen.add(l);
        stack.push(l);
      }
    }
  }
  save.passives = save.passives.filter((id) => seen.has(id));
}
