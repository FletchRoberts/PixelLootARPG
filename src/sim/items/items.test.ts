import { describe, expect, it } from "vitest";
import { content } from "../../data";
import { Rng } from "../core/rng";
import { xpToNext } from "../stats/character";
import { createWorld, currentSave, inventoryCommand, saveAfterDeath, step, type PlayerInput, type SimContent, type WorldState } from "../world";
import { rollDrops } from "./drops";
import { gainGemXp, makeGem, socketCount } from "./gems";
import { newCharacter } from "./save";

const quiet: SimContent = { ...content, zoneGen: { ...content.zoneGen, monsterPool: [] } };
const idle = (): PlayerInput => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, attack: false });
const give = (w: WorldState, kind: "skill_gem" | "support_gem", defId: string) => inventoryCommand(w, quiet, { type: "debug_give", kind, defId });
const bagIndexOf = (w: WorldState, defId: string) => w.player.save.bag.findIndex((g) => g.defId === defId);

describe("new character", () => {
  it("starts with Frost Bolt (2 sockets) on the first button and one support in the bag", () => {
    const save = newCharacter(content, 5);
    expect(save.skillBar[0]?.defId).toBe("frost_bolt");
    expect(save.skillBar[0]?.sockets).toEqual([null, null]);
    expect(save.skillBar.slice(1)).toEqual([null, null, null]);
    expect(save.bag).toHaveLength(1);
    expect(save.bag[0]!.kind).toBe("support_gem");
    expect(newCharacter(content, 5)).toEqual(save);
  });

  it("survives a JSON round trip (it's saved in the browser)", () => {
    const w = createWorld(quiet, 1);
    const restored = JSON.parse(JSON.stringify(currentSave(w)));
    expect(createWorld(quiet, 2, restored).player.compiled[1]!.id).toBe("frost_bolt");
  });
});

describe("drop tables", () => {
  const tables: SimContent["dropTables"] = [
    { id: "never", rolls: 3, entries: [{ weight: 1, kind: "nothing" }] },
    { id: "volley", rolls: 1, entries: [{ weight: 1, kind: "support_gem", ref: "volley" }] },
    { id: "nested", rolls: 2, entries: [{ weight: 1, kind: "table", ref: "volley" }] },
    { id: "half", rolls: 1, entries: [{ weight: 1, kind: "nothing" }, { weight: 1, kind: "skill_gem" }] },
  ];
  const c = { ...content, dropTables: tables };

  it("handles nothing, specific gems and nested tables", () => {
    expect(rollDrops(c, "never", new Rng(1))).toEqual([]);
    expect(rollDrops(c, "volley", new Rng(1))).toEqual([{ kind: "support_gem", defId: "volley" }]);
    expect(rollDrops(c, "nested", new Rng(1))).toHaveLength(2);
    expect(rollDrops(c, "missing", new Rng(1))).toEqual([]);
  });

  it("respects weights and only rolls known gems", () => {
    const rng = new Rng(7);
    const drops = Array.from({ length: 2000 }, () => rollDrops(c, "half", rng)).flat();
    expect(drops.length).toBeGreaterThan(900);
    expect(drops.length).toBeLessThan(1100);
    expect(drops.every((d) => content.skills.some((s) => s.id === d.defId))).toBe(true);
  });

  it("a full zone drops a handful of gems on the floor", () => {
    const w = createWorld(content, 33);
    for (const m of w.monsters) m.life = 0;
    const events = step(w, content, idle());
    expect(events.filter((e) => e.type === "death")).toHaveLength(w.totalMonsters);
    expect(w.groundItems.length).toBeGreaterThan(2);
    expect(w.groundItems.length).toBeLessThan(25);
  });
});

describe("pickup", () => {
  function withItem(dx: number) {
    const w = createWorld(quiet, 1);
    const item = makeGem(w.player.save, "support_gem", "pierce", content.gems);
    w.groundItems.push({ id: 999, item, pos: { x: w.player.pos.x + dx, y: w.player.pos.y } });
    return w;
  }

  it("picks up the nearest item in range", () => {
    const w = withItem(40);
    const ev = step(w, quiet, { ...idle(), pickup: true });
    expect(ev.some((e) => e.type === "pickup")).toBe(true);
    expect(w.groundItems).toHaveLength(0);
    expect(bagIndexOf(w, "pierce")).toBeGreaterThanOrEqual(0);
  });

  it("ignores items out of range, and only picks up when asked", () => {
    const far = withItem(content.gems.pickupRange + 30);
    step(far, quiet, { ...idle(), pickup: true });
    expect(far.groundItems).toHaveLength(1);
    const near = withItem(20);
    step(near, quiet, idle());
    expect(near.groundItems).toHaveLength(1);
  });

  it("leaves the item on the floor when the bag is full", () => {
    const w = withItem(20);
    while (w.player.save.bag.length < content.gems.bagSize) give(w, "support_gem", "fork");
    const ev = step(w, quiet, { ...idle(), pickup: true });
    expect(ev.some((e) => e.type === "bag_full")).toBe(true);
    expect(w.groundItems).toHaveLength(1);
  });
});

describe("equipping and socketing", () => {
  it("socketing a support changes the skill; unsocketing returns it to the bag", () => {
    const w = createWorld(quiet, 1);
    give(w, "support_gem", "volley");
    expect(inventoryCommand(w, quiet, { type: "socket", bagIndex: bagIndexOf(w, "volley"), target: { kind: "skill", slot: 0 }, socket: 1 })).toBeNull();
    expect(w.player.compiled[1]!.nodes[0]!.count).toBe(3);
    expect(bagIndexOf(w, "volley")).toBe(-1);
    expect(inventoryCommand(w, quiet, { type: "unsocket", target: { kind: "skill", slot: 0 }, socket: 1 })).toBeNull();
    expect(w.player.compiled[1]!.nodes[0]!.count).toBe(1);
    expect(bagIndexOf(w, "volley")).toBeGreaterThanOrEqual(0);
  });

  it("refuses supports that don't fit, sockets that don't exist, and non-support gems", () => {
    const w = createWorld(quiet, 1);
    give(w, "support_gem", "concentrated"); // needs an area skill; Frost Bolt isn't one
    give(w, "support_gem", "pierce");
    give(w, "skill_gem", "fireball");
    const at = (id: string) => bagIndexOf(w, id);
    expect(inventoryCommand(w, quiet, { type: "socket", bagIndex: at("concentrated"), target: { kind: "skill", slot: 0 }, socket: 0 })).toMatch(/fit/);
    expect(inventoryCommand(w, quiet, { type: "socket", bagIndex: at("pierce"), target: { kind: "skill", slot: 0 }, socket: 2 })).toMatch(/socket/);
    expect(inventoryCommand(w, quiet, { type: "socket", bagIndex: at("pierce"), target: { kind: "skill", slot: 1 }, socket: 0 })).toMatch(/no skill/);
    expect(inventoryCommand(w, quiet, { type: "socket", bagIndex: at("fireball"), target: { kind: "skill", slot: 0 }, socket: 0 })).toMatch(/support/);
  });

  it("equipping a skill gem swaps the old one (with its supports) back into the bag", () => {
    const w = createWorld(quiet, 1);
    give(w, "support_gem", "volley");
    inventoryCommand(w, quiet, { type: "socket", bagIndex: bagIndexOf(w, "volley"), target: { kind: "skill", slot: 0 }, socket: 0 });
    give(w, "skill_gem", "ice_nova");
    expect(inventoryCommand(w, quiet, { type: "equip", bagIndex: bagIndexOf(w, "ice_nova"), slot: 0 })).toBeNull();
    expect(w.player.compiled[1]!.id).toBe("ice_nova");
    const old = w.player.save.bag[bagIndexOf(w, "frost_bolt")]!;
    expect(old.sockets![0]?.defId).toBe("volley");
  });

  it("the weapon attack has its own support sockets", () => {
    const w = createWorld(quiet, 1);
    w.player.save.weapon = "apprentice_wand";
    give(w, "support_gem", "fork");
    expect(inventoryCommand(w, quiet, { type: "socket", bagIndex: bagIndexOf(w, "fork"), target: { kind: "attack" }, socket: 0 })).toBeNull();
    expect(w.player.compiled[0]!.nodes[0]!.fork).toBe(1);
  });
});

describe("gem levels", () => {
  it("gems gain sockets as they level", () => {
    const rules = content.gems;
    const save = newCharacter(content, 1);
    const gem = save.skillBar[0]!;
    let total = 0;
    for (let l = 1; l < 8; l++) total += 120 * Math.pow(1.3, l - 1) + 1;
    gainGemXp(gem, total, rules);
    expect(gem.level).toBeGreaterThanOrEqual(8);
    expect(gem.sockets).toHaveLength(socketCount(gem.level, rules));
    expect(socketCount(1, rules)).toBe(2);
    expect(socketCount(gem.level, rules)).toBeGreaterThan(2);
  });

  it("equipped skill gems earn XP from kills and hit harder per level", () => {
    const w = createWorld(quiet, 1);
    const gem = w.player.save.skillBar[0]!;
    gem.xp = 1e6; // enough to level a lot on the next kill
    const before = w.player.compiled[1]!;
    w.monsters.push({ ...createWorld(content, 1).monsters[0]!, pos: { ...w.player.pos }, life: 0, dropTable: "none" });
    const ev = step(w, quiet, idle());
    expect(ev.some((e) => e.type === "gem_level")).toBe(true);
    expect(gem.level).toBeGreaterThan(1);
    const levelMod = w.player.compiled[1]!.nodes[0]!.mods.find((m) => m.source === "gem level");
    expect(levelMod?.value).toBe((gem.level - 1) * content.gems.damagePerLevel);
    expect(before.nodes[0]!.mods.some((m) => m.source === "gem level")).toBe(false);
  });
});

describe("death", () => {
  it("costs a share of the level's XP but never a level, and keeps items", () => {
    const w = createWorld(quiet, 1, { ...newCharacter(quiet, 1), level: 4, xp: 100 });
    give(w, "support_gem", "chain");
    const need = xpToNext(4, content.progression);
    const after = saveAfterDeath(w, quiet);
    expect(after.level).toBe(4);
    expect(after.xp).toBeCloseTo(Math.max(0, 100 - need * content.progression.deathXpPenalty / 100));
    expect(after.bag.some((g) => g.defId === "chain")).toBe(true);

    const broke = createWorld(quiet, 1, { ...newCharacter(quiet, 1), level: 4, xp: 1 });
    expect(saveAfterDeath(broke, quiet).xp).toBe(0);
    expect(saveAfterDeath(broke, quiet).level).toBe(4);
  });
});
