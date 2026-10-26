import { describe, expect, it } from "vitest";
import { content } from "../../data";
import { Rng } from "../core/rng";
import type { Modifier } from "../stats/stats";
import { applyHit, armourReduction, chanceToHit, effectiveResist, entropyRoll, rollHit, type CombatRules, type Hit } from "./damage";

const rules = content.combat as CombatRules;
const physHit = (amount: number): Hit => ({ damage: { physical: amount }, crit: false, accuracy: 1000, isAttack: false });

describe("armour (PoE2: A / (A + 10 × hit))", () => {
  // The worked example table in docs/combat.md.
  it.each([
    [0, 10, 0],
    [50, 10, 1 / 3],
    [200, 10, 2 / 3],
    [500, 10, 5 / 6],
    [50, 100, 50 / 1050],
    [500, 100, 1 / 3],
  ])("armour %i vs %i physical → %f", (armour, hit, dr) => {
    expect(armourReduction(armour, hit, rules)).toBeCloseTo(dr);
  });

  it("caps at 90%", () => {
    expect(armourReduction(1e9, 1, rules)).toBe(0.9);
  });

  it("only reduces physical", () => {
    const r = applyHit({ damage: { physical: 10, fire: 10 }, crit: false, accuracy: 0, isAttack: false }, { armour: 50, evasion: 0, resist: {} }, rules, { value: 0 });
    expect(r.byType.physical).toBeCloseTo(10 * (2 / 3));
    expect(r.byType.fire).toBe(10);
  });
});

describe("resistances", () => {
  it("cap at 75% by default, raise to 90% max, floor at -100%", () => {
    expect(effectiveResist("fire", { armour: 0, evasion: 0, resist: { fire: 120 } }, rules)).toBe(75);
    expect(effectiveResist("fire", { armour: 0, evasion: 0, resist: { fire: 120 }, maxResist: { fire: 95 } }, rules)).toBe(90);
    expect(effectiveResist("cold", { armour: 0, evasion: 0, resist: { cold: -300 } }, rules)).toBe(-100);
  });

  it("penetration applies to the capped value", () => {
    expect(effectiveResist("fire", { armour: 0, evasion: 0, resist: { fire: 120 } }, rules, 30)).toBe(45);
  });

  it("negative resistance increases damage", () => {
    const r = applyHit({ damage: { cold: 100 }, crit: false, accuracy: 0, isAttack: false }, { armour: 0, evasion: 0, resist: { cold: -50 } }, rules, { value: 0 });
    expect(r.total).toBe(150);
  });
});

describe("evasion", () => {
  it("uses 1.25 × acc / (acc + 0.3 × eva), clamped to 5–100%", () => {
    expect(chanceToHit(100, 0, rules)).toBe(1);
    expect(chanceToHit(100, 1000, rules)).toBeCloseTo(1.25 * 100 / 400);
    expect(chanceToHit(1, 1e9, rules)).toBe(0.05);
  });

  it("entropy lands exactly 1 in 4 hits at 25% chance, no streaks", () => {
    let counter = 0.3;
    const hits: boolean[] = [];
    for (let i = 0; i < 40; i++) {
      const r = entropyRoll(counter, 0.25);
      counter = r.counter;
      hits.push(r.hit);
    }
    expect(hits.filter(Boolean)).toHaveLength(10);
    for (let i = 0; i + 4 <= hits.length; i += 4) expect(hits.slice(i, i + 4).filter(Boolean)).toHaveLength(1);
  });

  it("spells skip evasion", () => {
    const r = applyHit(physHit(10), { armour: 0, evasion: 1e9, resist: {} }, rules, { value: 0 });
    expect(r.evaded).toBe(false);
  });
});

describe("rollHit", () => {
  const src = { base: { physical: [10, 10] as [number, number] }, tags: ["attack", "melee"], critChance: 0, accuracy: 100, isAttack: true };

  it("sums increased from generic and typed damage into one bucket, multiplies more", () => {
    const mods: Modifier[] = [
      { stat: "damage", kind: "increased", value: 50 },
      { stat: "physical_damage", kind: "increased", value: 50 },
      { stat: "damage", kind: "more", value: 20, tags: ["melee"] },
    ];
    expect(rollHit(src, mods, rules, new Rng(1)).damage.physical).toBeCloseTo(10 * 2 * 1.2);
  });

  it("adds flat damage of a new type", () => {
    const mods: Modifier[] = [
      { stat: "added_fire_min", kind: "flat", value: 4 },
      { stat: "added_fire_max", kind: "flat", value: 4 },
      { stat: "damage", kind: "increased", value: 100, tags: ["elemental"] },
    ];
    const hit = rollHit(src, mods, rules, new Rng(1));
    expect(hit.damage.physical).toBe(10);
    expect(hit.damage.fire).toBe(8);
  });

  it("crits double damage by default", () => {
    const hit = rollHit({ ...src, critChance: 100 }, [], rules, new Rng(1));
    expect(hit.crit).toBe(true);
    expect(hit.damage.physical).toBe(20);
  });
});
