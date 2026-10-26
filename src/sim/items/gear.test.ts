import { describe, expect, it } from "vitest";
import { content } from "../../data";
import { Rng } from "../core/rng";
import { createWorld, inventoryCommand, step, type SimContent, type WorldState } from "../world";
import { itemModifiers, itemText, rollGear } from "./gear";
import { migrateSave, newCharacter } from "./save";
import type { GearItem } from "./types";

const quiet: SimContent = { ...content, zoneGen: { ...content.zoneGen, monsterPool: [] } };
const affix = (id: string) => content.affixes.find((a) => a.id === id)!;
const base = (id: string) => content.itemBases.find((b) => b.id === id)!;

function rolls(n: number, ilvl: number, opts: Parameters<typeof rollGear>[4] = {}): GearItem[] {
  const rng = new Rng(99);
  return Array.from({ length: n }, (_, i) => rollGear(content, rng, ilvl, i, opts)!).filter(Boolean);
}

/** Put an item straight into the bag and equip it. Returns the refusal, if any. */
function equip(w: WorldState, item: GearItem): string | null {
  w.player.save.bag.push(item);
  return inventoryCommand(w, quiet, { type: "equip_gear", bagIndex: w.player.save.bag.length - 1 });
}

function item(baseId: string, mods: GearItem["mods"] = [], extra: Partial<GearItem> = {}): GearItem {
  const b = base(baseId);
  return { uid: 9000 + Math.floor(Math.random() * 1000), kind: "gear", base: baseId, rarity: mods.length ? "magic" : "normal", ilvl: 50, implicits: (b.implicits ?? []).map((m) => m.value[1]), mods, ...extra };
}

describe("rolling gear", () => {
  it("is deterministic for the same rng", () => {
    expect(rollGear(content, new Rng(5), 20, 1)).toEqual(rollGear(content, new Rng(5), 20, 1));
  });

  it("item level gates bases and affix tiers", () => {
    const low = rolls(600, 1);
    expect(low.every((it) => base(it.base).dropLevel <= 1)).toBe(true);
    for (const it of low) for (const m of it.mods) expect(affix(m.affix).tiers.find((t) => t.tier === m.tier)!.itemLevel).toBeLessThanOrEqual(1);
    const high = rolls(600, 40);
    expect(high.some((it) => base(it.base).dropLevel > 1)).toBe(true);
    expect(high.some((it) => it.mods.some((m) => m.tier === 1))).toBe(true);
  });

  it("magic: 1–2 mods, at most one prefix and one suffix; rare: 4–6, at most 3+3, named", () => {
    const kinds = (it: GearItem) => it.mods.map((m) => affix(m.affix).kind);
    for (const it of rolls(300, 30, { rarity: "magic" })) {
      expect(it.mods.length).toBeGreaterThanOrEqual(1);
      expect(it.mods.length).toBeLessThanOrEqual(2);
      expect(kinds(it).filter((k) => k === "prefix").length).toBeLessThanOrEqual(1);
      expect(kinds(it).filter((k) => k === "suffix").length).toBeLessThanOrEqual(1);
    }
    for (const it of rolls(300, 30, { rarity: "rare" })) {
      expect(it.mods.length).toBeLessThanOrEqual(6);
      expect(kinds(it).filter((k) => k === "prefix").length).toBeLessThanOrEqual(3);
      expect(kinds(it).filter((k) => k === "suffix").length).toBeLessThanOrEqual(3);
      expect(it.name).toMatch(/^\w+ \w+$/);
    }
  });

  it("never rolls two affixes of the same group, and only affixes allowed on the base", () => {
    for (const it of rolls(500, 40, { rarity: "rare" })) {
      const groups = it.mods.map((m) => affix(m.affix).group);
      expect(new Set(groups).size).toBe(groups.length);
      for (const m of it.mods) expect(affix(m.affix).tags.some((t) => base(it.base).tags.includes(t))).toBe(true);
    }
  });

  it("rolled values stay inside their tier's ranges", () => {
    for (const it of rolls(300, 40, { rarity: "rare" })) {
      for (const m of it.mods) {
        const tier = affix(m.affix).tiers.find((t) => t.tier === m.tier)!;
        m.values.forEach((v, i) => {
          expect(v).toBeGreaterThanOrEqual(tier.values[i]![0]);
          expect(v).toBeLessThanOrEqual(tier.values[i]![1]);
        });
      }
    }
  });

  it("uniques roll their fixed mods within range", () => {
    const g = rollGear(content, new Rng(1), 1, 1, { unique: "glacier_heart" })!;
    expect(g.rarity).toBe("unique");
    expect(g.name).toBe("Glacier Heart");
    expect(g.uniqueValues![0]).toBeGreaterThanOrEqual(60);
    expect(g.uniqueValues![0]).toBeLessThanOrEqual(90);
    expect(itemText(content, g).grants[0]).toMatch(/Added Cold/);
  });
});

describe("equipping gear", () => {
  it("gear stats apply to the character and come off again", () => {
    const w = createWorld(quiet, 1);
    const before = w.player.maxLife;
    const ring = item("coral_ring", [{ affix: "life", tier: 1, values: [80] }]);
    expect(equip(w, ring)).toBeNull();
    expect(w.player.maxLife).toBe(before + 25 + 80); // implicit (max roll) + affix
    expect(inventoryCommand(w, quiet, { type: "unequip_gear", slot: "ring1" })).toBeNull();
    expect(w.player.maxLife).toBe(before);
  });

  it("two rings go in two ring slots; armour pieces add armour", () => {
    const w = createWorld(quiet, 1);
    equip(w, item("coral_ring"));
    equip(w, item("coral_ring"));
    expect(w.player.save.equipment.ring1 && w.player.save.equipment.ring2).toBeTruthy();
    equip(w, item("iron_cap", [{ affix: "pct_armour", tier: 1, values: [50] }]));
    expect(w.player.stats.armour).toBeCloseTo(16 * 1.5);
  });

  it("enforces level and attribute requirements", () => {
    const w = createWorld(quiet, 1);
    expect(equip(w, item("broadsword"))).toMatch(/level 10/);
    const w10 = createWorld(quiet, 1, { ...newCharacter(quiet, 1), level: 10 });
    expect(equip(w10, item("broadsword"))).toMatch(/20 strength/); // 10 base + 9 from levels = 19
    expect(equip(w10, item("bone_amulet", [{ affix: "strength", tier: 1, values: [5] }]))).toBeNull();
    expect(w10.player.save.bag.findIndex((g) => g.kind === "gear" && g.base === "broadsword")).toBeGreaterThanOrEqual(0);
    const idx = w10.player.save.bag.findIndex((g) => g.kind === "gear" && g.base === "broadsword");
    expect(inventoryCommand(w10, quiet, { type: "equip_gear", bagIndex: idx })).toBeNull();
  });

  it("the equipped weapon decides the weapon attack; no weapon means fists", () => {
    const w = createWorld(quiet, 1);
    expect(w.player.compiled[0]!.nodes[0]!.kind).toBe("melee");
    equip(w, item("short_bow"));
    expect(w.player.save.weapon).toBe("short_bow");
    expect(w.player.compiled[0]!.nodes[0]!.kind).toBe("projectile");
    expect(w.player.save.bag.some((g) => g.kind === "gear" && g.base === "rusty_sword")).toBe(true);
    inventoryCommand(w, quiet, { type: "unequip_gear", slot: "weapon" });
    expect(w.player.save.weapon).toBe("unarmed");
    expect(w.player.compiled[0]!.name).toBe("Punch");
  });

  it("uniques grant supports to every skill they fit: Duplicator's Coil gives Frost Bolt Volley, not the sword", () => {
    const w = createWorld(quiet, 1);
    expect(w.player.compiled[1]!.nodes[0]!.count).toBe(1);
    equip(w, rollGear(content, new Rng(1), 1, 777, { unique: "duplicators_coil" })!);
    expect(w.player.compiled[1]!.nodes[0]!.count).toBe(3);
    expect(w.player.compiled[0]!.supports).not.toContain("volley");
  });

  it("weapon affixes add attack damage; movement speed boots make you faster", () => {
    const w = createWorld(quiet, 1);
    const ring = item("iron_ring", [{ affix: "fire_attack", tier: 1, values: [10, 20] }]);
    equip(w, ring);
    expect(itemModifiers(content, ring).some((m) => m.stat === "added_fire_max" && m.value === 20)).toBe(true);
    const speed = w.player.speed;
    equip(w, item("leather_boots", [{ affix: "movement_speed", tier: 1, values: [25] }]));
    expect(w.player.speed).toBeCloseTo(speed * 1.25);
  });
});

describe("gear drops and saves", () => {
  it("monsters drop gear at their own level", () => {
    const w = createWorld(content, 33, { ...newCharacter(content, 33), zonesCleared: 6 });
    for (const m of w.monsters) m.life = 0;
    step(w, content, { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, attack: false });
    const gear = w.groundItems.map((g) => g.item).filter((i): i is GearItem => i.kind === "gear");
    expect(gear.length).toBeGreaterThan(2);
    expect(gear.every((g) => g.ilvl === 7)).toBe(true);
  });

  it("old (v1) saves get their weapon as an equipped item", () => {
    const v1 = { ...newCharacter(content, 1), version: 1, equipment: undefined, weapon: "short_bow" };
    const save = migrateSave(JSON.parse(JSON.stringify(v1)), content)!;
    expect(save.version).toBe(2);
    expect(save.equipment.weapon?.base).toBe("short_bow");
    expect(migrateSave({ nonsense: true }, content)).toBeNull();
  });

  it("tooltips name items and show tiers", () => {
    const t = itemText(content, item("iron_cap", [{ affix: "life", tier: 2, values: [55] }]));
    expect(t.mods[0]).toBe("+55 to maximum Life  (T2 prefix)");
    expect(t.implicits[0]).toBe("+16 to Armour");
    expect(t.name).toBe("Healthy Iron Cap");
    expect(itemText(content, item("coral_ring")).implicits[0]).toBe("+25 to maximum Life");
    expect(itemText(content, item("ruby_ring")).implicits[0]).toBe("+25% to Fire Resistance");
    expect(itemText(content, item("iron_ring")).implicits[0]).toBe("Adds 1 to 4 Physical Damage to Attacks");
    expect(itemText(content, item("leather_boots", [{ affix: "dexterity", tier: 1, values: [5] }])).name).toBe("Leather Boots of the Fox");
  });
});

describe("equip comparison", () => {
  it("shows exactly what changes, better in one direction and worse in the other", async () => {
    const { compareWorlds } = await import("./compare");
    const { previewInventoryCommand } = await import("../world");
    const w = createWorld(quiet, 1);
    equip(w, item("iron_cap", [{ affix: "life", tier: 1, values: [40] }]));
    w.player.save.bag.push(item("leather_hood", [{ affix: "dexterity", tier: 1, values: [10] }]));
    const preview = previewInventoryCommand(w, quiet, { type: "equip_gear", bagIndex: w.player.save.bag.length - 1 });
    expect(typeof preview).not.toBe("string");
    const changes = compareWorlds(w, preview as WorldState, quiet);
    const byLabel = Object.fromEntries(changes.map((c) => [c.label, c]));
    expect(byLabel["Life"]!.delta).toBe(-40);
    expect(byLabel["Life"]!.better).toBe(false);
    expect(byLabel["Armour"]!.delta).toBe(-16);
    expect(byLabel["Evasion"]!.delta).toBeGreaterThan(0);
    expect(byLabel["Dexterity"]!.delta).toBe(10);
    expect(byLabel["Dexterity"]!.better).toBe(true);
    // The real world is untouched.
    expect(w.player.save.equipment.helmet?.base).toBe("iron_cap");
  });

  it("weapon swaps show the DPS change", async () => {
    const { compareWorlds } = await import("./compare");
    const { previewInventoryCommand } = await import("../world");
    const w = createWorld(quiet, 1);
    w.player.save.bag.push(item("rusty_sword", [{ affix: "physical_attack", tier: 1, values: [9, 22] }]));
    const preview = previewInventoryCommand(w, quiet, { type: "equip_gear", bagIndex: w.player.save.bag.length - 1 }) as WorldState;
    const dps = compareWorlds(w, preview, quiet).find((c) => c.label.startsWith("Attack DPS"));
    expect(dps?.better).toBe(true);
  });
});
