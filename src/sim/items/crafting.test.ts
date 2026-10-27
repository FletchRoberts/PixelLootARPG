import { describe, expect, it } from "vitest";
import { content } from "../../data";
import { Rng } from "../core/rng";
import { createWorld, inventoryCommand, step, type SimContent, type WorldState } from "../world";
import { addCurrency, currencyProblem, salvageYield } from "./crafting";
import { rollDrops } from "./drops";
import { makeGem } from "./gems";
import type { GearItem } from "./types";

const quiet: SimContent = { ...content, zoneGen: { ...content.zoneGen, monsterPool: [] } };

function world(): WorldState {
  return createWorld(quiet, 5);
}

function normal(w: WorldState, baseId = "iron_cap", ilvl = 30): number {
  const b = content.itemBases.find((x) => x.id === baseId)!;
  const item: GearItem = { uid: w.player.save.nextUid++, kind: "gear", base: baseId, rarity: "normal", ilvl, implicits: (b.implicits ?? []).map((m) => m.value[0]), mods: [] };
  w.player.save.gearBag.push(item);
  return w.player.save.gearBag.length - 1;
}

const give = (w: WorldState, currency: string, count = 1) => inventoryCommand(w, quiet, { type: "debug_give_currency", currency, count });
const use = (w: WorldState, currency: string, index: number) => inventoryCommand(w, quiet, { type: "apply_currency", currency, target: { where: "gear_bag", index } });

describe("currency data", () => {
  it("every fragment combines into a real currency, and every effect is known", () => {
    for (const c of content.currencies) {
      if (c.combine) expect(content.currencies.some((x) => x.id === c.combine!.into)).toBe(true);
      else if (c.effect !== "none") expect(currencyProblem(content, c.id, undefined)).toBe("no item"); // i.e. not "unknown effect"
    }
    const s = content.crafting.salvage;
    for (const y of [...Object.values(s.gear), s.skill_gem, s.support_gem]) expect(content.currencies.some((c) => c.id === y.currency)).toBe(true);
  });

  it("monsters drop currency, gated by level", () => {
    const rng = new Rng(3);
    const drops = Array.from({ length: 3000 }, () => rollDrops(content, "trash", rng, 1)).flat();
    const currency = drops.filter((d) => d.kind === "currency");
    expect(currency.length).toBeGreaterThan(100);
    const ids = new Set(currency.map((d) => (d.kind === "currency" ? d.id : "")));
    expect(ids.has("whetstone_shard")).toBe(true);
    expect(ids.has("void_pearl")).toBe(false); // dropLevel 6
  });
});

describe("currency stash", () => {
  it("ten fragments combine into the full currency", () => {
    const w = world();
    const save = w.player.save;
    addCurrency(save, "whetstone_fragment", 9, content);
    expect(save.currency.whetstone_fragment).toBe(9);
    expect(save.currency.whetstone_shard ?? 0).toBe(0);
    addCurrency(save, "whetstone_fragment", 13, content);
    expect(save.currency.whetstone_fragment).toBe(2);
    expect(save.currency.whetstone_shard).toBe(2);
  });

  it("picking up currency goes to the stash, never the bags", () => {
    const w = world();
    w.groundItems.push({ id: 999, item: { uid: 1, kind: "currency", id: "riftglass", count: 2 }, pos: { ...w.player.pos } });
    const events = step(w, quiet, { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, attack: false, skills: [], pickup: true }, 1 / 60);
    expect(events.some((e) => e.type === "pickup")).toBe(true);
    expect(w.player.save.currency.riftglass).toBe(2);
    expect(w.player.save.gearBag).toHaveLength(0);
  });
});

describe("crafting effects", () => {
  it("whetstone → magic, crown ember → rare, riftglass fills, salt removes", () => {
    const w = world();
    const i = normal(w);
    const item = () => w.player.save.gearBag[i]!;
    expect(use(w, "whetstone_shard", i)).toBe("you have none");
    give(w, "whetstone_shard");
    expect(use(w, "whetstone_shard", i)).toBeNull();
    expect(item().rarity).toBe("magic");
    expect(item().mods.length).toBeGreaterThanOrEqual(1);
    expect(w.player.save.currency.whetstone_shard).toBe(0);

    give(w, "crown_ember");
    const before = item().mods.length;
    expect(use(w, "crown_ember", i)).toBeNull();
    expect(item().rarity).toBe("rare");
    expect(item().name).toBeTruthy();
    expect(item().mods.length).toBe(before + 1);

    give(w, "riftglass", 10);
    while (use(w, "riftglass", i) === null);
    expect(item().mods.length).toBe(6);
    expect(use(w, "riftglass", i)).toBe("item has no room for a mod");

    give(w, "unmaking_salt");
    expect(use(w, "unmaking_salt", i)).toBeNull();
    expect(item().mods.length).toBe(5);
  });

  it("refuses the wrong rarity without spending anything", () => {
    const w = world();
    const i = normal(w);
    give(w, "tinkers_spark");
    expect(use(w, "tinkers_spark", i)).toBe("needs a magic item");
    expect(w.player.save.currency.tinkers_spark).toBe(1);
  });

  it("is deterministic: same world, same results", () => {
    const run = () => {
      const w = world();
      const i = normal(w);
      give(w, "binding_coin");
      use(w, "binding_coin", i);
      return w.player.save.gearBag[i]!.mods;
    };
    expect(run()).toEqual(run());
  });

  it("lodestone keeps tiers and rerolls values within them", () => {
    const w = world();
    const i = normal(w, "iron_cap", 60);
    give(w, "binding_coin");
    use(w, "binding_coin", i);
    const tiers = w.player.save.gearBag[i]!.mods.map((m) => `${m.affix}:${m.tier}`);
    give(w, "lodestone");
    expect(use(w, "lodestone", i)).toBeNull();
    expect(w.player.save.gearBag[i]!.mods.map((m) => `${m.affix}:${m.tier}`)).toEqual(tiers);
  });

  it("void pearl corrupts, and corrupted items refuse further currency", () => {
    const w = world();
    const i = normal(w);
    give(w, "void_pearl");
    expect(use(w, "void_pearl", i)).toBeNull();
    expect(w.player.save.gearBag[i]!.corrupted).toBe(true);
    give(w, "whetstone_shard");
    expect(use(w, "whetstone_shard", i)).toBe("item is corrupted");
  });

  it("cutter's prism levels a skill gem on the bar", () => {
    const w = world();
    give(w, "cutters_prism", 2);
    expect(inventoryCommand(w, quiet, { type: "apply_currency", currency: "cutters_prism", target: { where: "skill", slot: 0 } })).toBeNull();
    expect(w.player.save.skillBar[0]!.level).toBe(2);
  });

  it("works on equipped gear and updates stats", () => {
    const w = world();
    give(w, "binding_coin");
    expect(inventoryCommand(w, quiet, { type: "apply_currency", currency: "binding_coin", target: { where: "equipped", slot: "weapon" } })).toBeNull();
    expect(w.player.save.equipment.weapon!.rarity).toBe("rare");
  });
});

describe("salvage", () => {
  it("destroys bagged items for fragments, gems by level", () => {
    const w = world();
    const save = w.player.save;
    normal(w);
    expect(inventoryCommand(w, quiet, { type: "salvage", bag: "gear", index: 0 })).toBeNull();
    expect(save.gearBag).toHaveLength(0);
    expect(save.currency.whetstone_fragment).toBe(1);
    const gem = makeGem(save, "skill_gem", "fireball", content.gems, 3);
    expect(salvageYield(content, gem)).toEqual({ currency: "cutters_prism_fragment", count: 6 });
  });

  it("bulk salvage takes one rarity, and spare gems keep one of each", () => {
    const w = world();
    const save = w.player.save;
    for (let k = 0; k < 12; k++) normal(w);
    expect(inventoryCommand(w, quiet, { type: "salvage_bulk", what: "normal" })).toBeNull();
    expect(save.gearBag).toHaveLength(0);
    expect(save.currency.whetstone_shard).toBe(1);
    expect(save.currency.whetstone_fragment).toBe(2);

    save.gemBag = [];
    for (let k = 0; k < 3; k++) save.gemBag.push(makeGem(save, "support_gem", "fork", content.gems));
    save.gemBag.push(makeGem(save, "support_gem", "chain", content.gems));
    expect(inventoryCommand(w, quiet, { type: "salvage_bulk", what: "spare_supports" })).toBeNull();
    expect(save.gemBag.map((g) => g.defId).sort()).toEqual(["chain", "fork"]);
    expect(inventoryCommand(w, quiet, { type: "salvage_bulk", what: "rare" })).toBe("nothing to salvage");
  });
});

describe("save migration", () => {
  it("v2 saves split their bag into gear and gem bags", async () => {
    const { migrateSave, newCharacter } = await import("./save");
    const { gearBag: _g, gemBag, currency: _c, ...rest } = newCharacter(content, 1);
    const gear: GearItem = { uid: 77, kind: "gear", base: "iron_cap", rarity: "normal", ilvl: 1, implicits: [], mods: [] };
    const v2 = { ...rest, version: 2, bag: [...gemBag, gear] };
    const save = migrateSave(JSON.parse(JSON.stringify(v2)), content)!;
    expect(save.version).toBe(6);
    expect(save.gemBag).toHaveLength(1);
    expect(save.gearBag).toHaveLength(1);
    expect(save.currency).toEqual({});
  });
});
