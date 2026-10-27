import { describe, expect, it } from "vitest";
import { content } from "../../data";
import { plainMap } from "../items/cairnstone";
import { migrateSave, newCharacter } from "../items/save";
import { createWorld, inventoryCommand, skillSummary, type SimContent } from "../world";
import { passiveNode, pointsLeft } from "./tree";

const quiet: SimContent = { ...content, zoneGen: { ...content.zoneGen, monsterPool: [] } };
const tree = content.passiveTree;
const world = (level: number) => createWorld(quiet, 1, { ...newCharacter(quiet, 1), level }, plainMap(1, 1));
const alloc = (w: ReturnType<typeof world>, node: string) => inventoryCommand(w, quiet, { type: "passive_allocate", node });
const refund = (w: ReturnType<typeof world>, node: string) => inventoryCommand(w, quiet, { type: "passive_refund", node });

/** Shortest path of node ids from the start to `target` (excluding the start). */
function pathTo(target: string): string[] {
  const prev = new Map<string, string>();
  const queue = [tree.start];
  const seen = new Set(queue);
  while (queue.length) {
    const c = queue.shift()!;
    if (c === target) break;
    for (const l of passiveNode(tree, c)!.links) {
      if (!seen.has(l)) {
        seen.add(l);
        prev.set(l, c);
        queue.push(l);
      }
    }
  }
  const out: string[] = [];
  for (let c = target; c !== tree.start; c = prev.get(c)!) out.unshift(c);
  return out;
}

describe("passive tree data", () => {
  it("is big, connected, with notables and keystones, and links are two-way", () => {
    expect(tree.nodes.length).toBeGreaterThan(200);
    expect(tree.nodes.filter((n) => n.kind === "keystone")).toHaveLength(6);
    expect(tree.nodes.filter((n) => n.kind === "notable").length).toBeGreaterThan(15);
    for (const n of tree.nodes) for (const l of n.links) expect(passiveNode(tree, l)!.links).toContain(n.id);
    for (const n of tree.nodes) expect(pathTo(n.id).length).toBeLessThan(40);
  });

  it("uses only stats the game knows and supports that exist", () => {
    const known = new Set(["life", "mana", "armour", "evasion", "accuracy", "strength", "dexterity", "intelligence", "mana_regen", "movement_speed", "fire_resistance", "cold_resistance", "lightning_resistance", "damage", "fire_damage", "cold_damage", "physical_damage", "attack_speed", "cast_speed", "crit_chance", "crit_bonus", "projectile_count", "projectile_speed", "pierce", "area_of_effect", "ignite_chance", "knockback", "life_leech"]);
    for (const n of tree.nodes) {
      for (const m of n.stats) expect(known.has(m.stat), `${n.id}: ${m.stat}`).toBe(true);
      for (const g of n.grants ?? []) expect(content.supports.some((s) => s.id === g.support)).toBe(true);
    }
  });
});

describe("allocating passives", () => {
  it("costs points (one per level after the first) and must connect to your tree", () => {
    const w = world(4);
    expect(pointsLeft(w.player.save, 4, content.progression)).toBe(3);
    const far = pathTo("dex_keystone");
    expect(alloc(w, far[2]!)).toBe("not connected to your tree");
    expect(alloc(w, far[0]!)).toBeNull();
    expect(alloc(w, far[1]!)).toBeNull();
    expect(alloc(w, far[2]!)).toBeNull();
    expect(alloc(w, far[3]!)).toBe("no passive points left");
  });

  it("allocated stats apply to the character", () => {
    const w = world(30);
    const life = w.player.maxLife;
    const path = pathTo("str_w1_n0"); // Iron Hide: +25 life and more on the way
    for (const id of path) expect(alloc(w, id)).toBeNull();
    expect(w.player.maxLife).toBeGreaterThan(life + 25);
  });

  it("keystones change skills: Endless Volley fires more projectiles for less damage each", () => {
    const w = world(40);
    const before = w.player.compiled[1]!.nodes[0]!.count;
    for (const id of pathTo("dex_keystone")) expect(alloc(w, id)).toBeNull();
    expect(w.player.compiled[1]!.nodes[0]!.count).toBe(before + 2);
    expect(skillSummary(w, quiet, 1)).toBeTruthy();
  });

  it("Twin Cast grants Echo to spells", () => {
    const w = world(40);
    for (const id of pathTo("int_keystone")) alloc(w, id);
    expect(w.player.compiled[1]!.supports).toContain("echo");
  });
});

describe("refunding passives", () => {
  it("only leaves, never a node others depend on; free below level 10", () => {
    const w = world(5);
    const path = pathTo("int_w1_0");
    for (const id of path.slice(0, 3)) alloc(w, id);
    expect(refund(w, path[0]!)).toBe("other allocated nodes depend on it");
    expect(refund(w, path[2]!)).toBeNull();
    expect(w.player.save.passives).toHaveLength(2);
  });

  it("costs Lethe Ash from level 10", () => {
    const w = world(12);
    const path = pathTo("int_w1_0");
    alloc(w, path[0]!);
    expect(refund(w, path[0]!)).toBe("needs Lethe Ash");
    inventoryCommand(w, quiet, { type: "debug_give_currency", currency: "lethe_ash", count: 1 });
    expect(refund(w, path[0]!)).toBeNull();
    expect(w.player.save.currency.lethe_ash).toBe(0);
  });

  it("old saves get an empty tree", () => {
    const { passives: _p, ...v5 } = { ...newCharacter(content, 1), version: 5 };
    expect(migrateSave(JSON.parse(JSON.stringify(v5)), content)!.passives).toEqual([]);
  });
});
