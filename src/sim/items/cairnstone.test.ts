import { describe, expect, it } from "vitest";
import { content } from "../../data";
import { Rng } from "../core/rng";
import { createWorld, inventoryCommand, saveAfterClear, saveAfterDeath, step, type SimContent, type WorldState } from "../world";
import { freeMap, mapStats, plainMap, rollCairnstone, stoneMap, stoneName } from "./cairnstone";
import { migrateSave, newCharacter } from "./save";
import type { CairnstoneItem } from "./types";

const quiet: SimContent = { ...content, zoneGen: { ...content.zoneGen, monsterPool: [] } };
const idle = { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, attack: false };

/** Walk the player onto the exit so the zone completes. */
function clear(w: WorldState, c: SimContent = quiet) {
  w.player.pos = { ...w.zone.exit };
  return step(w, c, idle);
}

describe("cairnstones", () => {
  it("roll mods from the map mod pool, gated by level", () => {
    const rng = new Rng(4);
    const stones = Array.from({ length: 200 }, (_, i) => rollCairnstone(content, rng, 3, i, { rarity: "rare", exact: true }));
    for (const s of stones) {
      expect(s.level).toBe(3);
      expect(s.mods.length).toBeGreaterThanOrEqual(4);
      for (const m of s.mods) {
        const affix = content.mapMods.find((a) => a.id === m.affix)!;
        expect(affix.tiers.find((t) => t.tier === m.tier)!.itemLevel).toBeLessThanOrEqual(3);
      }
      expect(new Set(s.mods.map((m) => m.affix)).size).toBe(s.mods.length);
    }
  });

  it("sometimes drop one level higher", () => {
    const rng = new Rng(8);
    const levels = Array.from({ length: 400 }, (_, i) => rollCairnstone(content, rng, 5, i).level);
    expect(levels.every((l) => l === 5 || l === 6)).toBe(true);
    const up = levels.filter((l) => l === 6).length / levels.length;
    expect(up).toBeGreaterThan(0.15);
    expect(up).toBeLessThan(0.45);
  });

  it("magic stones are named after their mods", () => {
    const stone: CairnstoneItem = { uid: 1, kind: "cairnstone", level: 2, rarity: "magic", mods: [{ affix: "map_monster_life", tier: 4, values: [25, 3] }] };
    expect(stoneName(content, stone)).toBe("Hardy Cairnstone");
    expect(mapStats(content, stone.mods)).toEqual({ monster_life: 25, item_quantity: 3 });
  });
});

describe("maps", () => {
  it("clearing a map always gives a Cairnstone and records the level", () => {
    const w = createWorld(quiet, 3, newCharacter(quiet, 3), plainMap(3, 4));
    const events = clear(w);
    const done = events.find((e) => e.type === "zone_complete");
    expect(done?.type === "zone_complete" && done.reward?.kind).toBe("cairnstone");
    const save = saveAfterClear(w);
    expect(save.stoneBag).toHaveLength(1);
    expect(save.stoneBag[0]!.level).toBeGreaterThanOrEqual(4);
    expect(save.bestMapLevel).toBe(4);
    expect(save.currentMap).toBeUndefined();
  });

  it("opening a stone consumes it and the zone uses its level, seed and mods", () => {
    const w = createWorld(quiet, 3);
    expect(inventoryCommand(w, quiet, { type: "debug_give_stone", level: 6, rarity: "rare", seed: 2 })).toBeNull();
    const stone = w.player.save.stoneBag[0]!;
    expect(inventoryCommand(w, quiet, { type: "open_map", stoneIndex: 0, seed: 77 })).toBeNull();
    const save = w.player.save;
    expect(save.stoneBag).toHaveLength(0);
    const next = createWorld(quiet, 1, save);
    expect(next.map.seed).toBe(77);
    expect(next.zone.seed).toBe(77);
    expect(next.monsterLevel).toBe(6);
    expect(next.map.mods).toEqual(stone.mods);
  });

  it("deaths retry the same map, with no limit by default", () => {
    const w = createWorld(quiet, 3, newCharacter(quiet, 3), plainMap(3, 2));
    w.player.save.currentMap = w.map;
    let save = saveAfterDeath(w, quiet);
    for (let i = 0; i < 20; i++) save = saveAfterDeath(createWorld(quiet, 9, save), quiet);
    expect(save.currentMap?.deaths).toBe(21);
    expect(save.currentMap?.maxDeaths).toBeUndefined();
    expect(createWorld(quiet, 9, save).zone.seed).toBe(3);
  });

  it("a death limit, when set, ends the map", () => {
    const w = createWorld(quiet, 3, newCharacter(quiet, 3), { ...plainMap(3, 2), maxDeaths: 2 });
    w.player.save.currentMap = w.map;
    const once = saveAfterDeath(w, quiet);
    expect(once.currentMap?.deaths).toBe(1);
    expect(saveAfterDeath(createWorld(quiet, 9, once), quiet).currentMap).toBeUndefined();
  });

  it("free maps run below your best level with only lowest-tier mods", () => {
    for (let seed = 1; seed < 40; seed++) {
      const m = freeMap(content, { bestMapLevel: 10 }, seed);
      expect(m.level).toBe(10 - content.cairnstones.freeMap.levelsBelowBest);
      expect(m.free).toBe(true);
      expect(m.mods.length).toBeLessThanOrEqual(content.cairnstones.freeMap.modCount[1]);
      for (const mod of m.mods) expect(content.mapMods.find((a) => a.id === mod.affix)!.tiers.find((t) => t.tier === mod.tier)!.itemLevel).toBe(1);
    }
    expect(freeMap(content, { bestMapLevel: 0 }, 1).level).toBe(1);
  });

  it("map mods make monsters tougher and add elemental damage", () => {
    const mods = [
      { affix: "map_monster_life", tier: 1, values: [80, 10] },
      { affix: "map_fire", tier: 1, values: [80, 10] },
    ];
    const plain = createWorld(content, 12, newCharacter(content, 12), plainMap(12, 3));
    const hard = createWorld(content, 12, newCharacter(content, 12), { ...plainMap(12, 3), mods });
    expect(hard.monsters[0]!.maxLife).toBeCloseTo(plain.monsters[0]!.maxLife * 1.8);
    expect(hard.mapStats.item_quantity).toBe(20);
  });

  it("pack size adds monsters", () => {
    const plain = createWorld(content, 12, newCharacter(content, 12), plainMap(12, 3));
    const teeming = createWorld(content, 12, newCharacter(content, 12), { ...plainMap(12, 3), mods: [{ affix: "map_pack_size", tier: 1, values: [60, 10] }] });
    expect(teeming.monsters.length).toBeGreaterThan(plain.monsters.length * 1.4);
  });

  it("currency crafts Cairnstones too", () => {
    const w = createWorld(quiet, 3);
    inventoryCommand(w, quiet, { type: "debug_give_stone", level: 8, rarity: "normal", seed: 2 });
    inventoryCommand(w, quiet, { type: "debug_give_currency", currency: "binding_coin", count: 1 });
    expect(inventoryCommand(w, quiet, { type: "apply_currency", currency: "binding_coin", target: { where: "stone_bag", index: 0 } })).toBeNull();
    const stone = w.player.save.stoneBag[0]!;
    expect(stone.rarity).toBe("rare");
    expect(stone.mods.every((m) => content.mapMods.some((a) => a.id === m.affix))).toBe(true);
    expect(inventoryCommand(w, quiet, { type: "salvage", bag: "stones", index: 0 })).toBeNull();
    expect(w.player.save.currency.chaos_thread_fragment).toBe(2);
  });

  it("v3 saves get a Cairnstone at the level they had reached", () => {
    const { stoneBag: _s, bestMapLevel: _b, ...v3 } = { ...newCharacter(content, 1), version: 3, zonesCleared: 5 };
    const save = migrateSave(JSON.parse(JSON.stringify(v3)), content)!;
    expect(save.version).toBe(6);
    expect(save.bestMapLevel).toBe(5);
    expect(save.stoneBag.map((s) => s.level)).toEqual([6]);
  });

  it("stone maps copy the mods (crafting the bag can't change a running map)", () => {
    const stone = rollCairnstone(content, new Rng(1), 4, 1, { rarity: "magic", exact: true });
    const map = stoneMap(content, stone, 5);
    stone.mods[0]!.values[0] = 9999;
    expect(map.mods[0]!.values[0]).not.toBe(9999);
  });
});
