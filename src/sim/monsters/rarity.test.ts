import { describe, expect, it } from "vitest";
import { content } from "../../data";
import { Rng } from "../core/rng";
import { plainMap } from "../items/cairnstone";
import { newCharacter } from "../items/save";
import { createWorld, step, type MonsterState } from "../world";
import { applyRarity, modStats } from "./rarity";

const idle = { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, attack: false };

describe("monster rarity", () => {
  const worlds = Array.from({ length: 12 }, (_, i) => createWorld(content, 100 + i, newCharacter(content, 1), plainMap(100 + i, 3)));
  const all = worlds.flatMap((w) => w.monsters);

  it("packs roll every rarity, and normal packs are the most common", () => {
    const count = (r: string) => all.filter((m) => m.rarity === r).length;
    expect(count("normal")).toBeGreaterThan(count("magic"));
    expect(count("magic")).toBeGreaterThan(0);
    expect(count("rare")).toBeGreaterThan(0);
  });

  it("rare and Legendary leaders have a name and their own mods; magic packs share theirs", () => {
    for (const m of all.filter((m) => m.rarity === "rare" || m.rarity === "unique")) {
      expect(m.name).toBeTruthy();
      expect(m.mods.length).toBeGreaterThanOrEqual(content.monsterRarity.rarities[m.rarity].mods[0]);
    }
    for (const w of worlds) {
      const packs = new Map<number, MonsterState[]>();
      for (const m of w.monsters) packs.set(m.packId, [...(packs.get(m.packId) ?? []), m]);
      for (const pack of packs.values()) {
        if (pack.every((m) => m.rarity === "magic")) expect(new Set(pack.map((m) => m.mods.join())).size).toBe(1);
      }
    }
  });

  it("rarity multiplies life and damage, mods add on top", () => {
    const w = worlds[0]!;
    const m = { ...w.monsters.find((x) => x.rarity === "normal")! };
    const life = m.maxLife;
    applyRarity(content, m, "rare", ["colossal", "brutal"], undefined, new Rng(1));
    const r = content.monsterRarity.rarities.rare;
    expect(m.maxLife).toBeCloseTo(life * r.life * 1.7);
    expect(m.damageMult).toBeCloseTo(r.damage * 1.35);
    expect(modStats(content, m.mods).speed).toBe(-15);
  });

  it("Volatile monsters leave an explosion where they die", () => {
    const w = createWorld(content, 7, newCharacter(content, 1), plainMap(7, 2));
    const m = w.monsters[0]!;
    m.mods = ["volatile"];
    m.life = 0;
    step(w, content, idle);
    expect(w.telegraphs.some((t) => t.pos.x === m.pos.x && t.pos.y === m.pos.y)).toBe(true);
  });

  it("rare monsters drop far more than normal ones", () => {
    const drops = (rarity: "normal" | "rare") => {
      let n = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const w = createWorld(content, seed, newCharacter(content, 1), plainMap(seed, 3));
        for (const m of w.monsters) {
          m.rarity = rarity;
          m.life = 0;
        }
        step(w, content, idle);
        n += w.groundItems.length / w.totalMonsters;
      }
      return n;
    };
    expect(drops("rare")).toBeGreaterThan(drops("normal") * 4);
  });
});
