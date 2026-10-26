import { describe, expect, it } from "vitest";
import { content } from "../../data";
import { gainXp, playerStats, xpForKill, xpToNext } from "./character";
import { computeStat, computeStats, type Modifier } from "./stats";

describe("computeStat", () => {
  it("applies flat, then summed increased, then multiplied more", () => {
    const mods: Modifier[] = [
      { stat: "life", kind: "flat", value: 20 },
      { stat: "life", kind: "increased", value: 30 },
      { stat: "life", kind: "increased", value: 20 },
      { stat: "life", kind: "more", value: 10 },
      { stat: "life", kind: "more", value: 10 },
    ];
    // (100 + 20) × 1.5 × 1.1 × 1.1
    expect(computeStat("life", 100, mods)).toBeCloseTo(217.8);
  });

  it("only applies tagged modifiers when the context has every tag", () => {
    const mods: Modifier[] = [{ stat: "damage", kind: "increased", value: 50, tags: ["melee", "physical"] }];
    expect(computeStat("damage", 10, mods, ["attack", "melee", "physical"])).toBe(15);
    expect(computeStat("damage", 10, mods, ["attack", "melee", "fire"])).toBe(10);
    expect(computeStat("damage", 10, mods)).toBe(10);
  });

  it("reduced can't push a stat below zero", () => {
    expect(computeStat("x", 10, [{ stat: "x", kind: "increased", value: -150 }])).toBe(0);
  });

  it("computeStats covers stats that only exist as modifiers", () => {
    expect(computeStats({ life: 10 }, [{ stat: "armour", kind: "flat", value: 5 }])).toEqual({ life: 10, armour: 5 });
  });
});

describe("character", () => {
  const hero = content.characters[0]!;

  it("level 1 hero has 100 life, 40 mana, 100 accuracy from base + attributes", () => {
    const s = playerStats(hero, 1, content);
    expect(s.life).toBe(100); // 95 + 10 str × 0.5
    expect(s.mana).toBe(40); // 35 + 10 int × 0.5
    expect(s.accuracy).toBe(100); // 80 + 10 dex × 2
    expect(s.strength).toBe(10);
  });

  it("levels add life, mana and attributes (which add more life)", () => {
    const s = playerStats(hero, 5, content);
    expect(s.strength).toBe(14);
    expect(s.life).toBe(95 + 4 * 8 + 14 * 0.5);
  });

  it("gains levels from XP with carry-over", () => {
    const state = { level: 1, xp: 0 };
    const need = xpToNext(1, content.progression) + xpToNext(2, content.progression);
    expect(gainXp(state, need + 5, content.progression)).toBe(2);
    expect(state).toEqual({ level: 3, xp: 5 });
  });

  it("XP scales with monster level and drops off when levels are far apart", () => {
    const p = content.progression;
    const s = content.monsterScaling;
    expect(xpForKill(10, 1, 1, p, s)).toBe(10);
    expect(xpForKill(10, 2, 2, p, s)).toBeCloseTo(10 * s.xp);
    expect(xpForKill(10, 1, 4, p, s)).toBe(10); // within free levels
    expect(xpForKill(10, 1, 6, p, s)).toBeCloseTo(10 * (1 - 2 * p.xpPenalty.perLevel));
    expect(xpForKill(10, 1, 60, p, s)).toBeCloseTo(10 * p.xpPenalty.min);
  });
});
