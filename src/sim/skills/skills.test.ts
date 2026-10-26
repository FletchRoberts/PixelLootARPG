import { describe, expect, it } from "vitest";
import { content } from "../../data";
import { createWorld, progressAfterClear, setLoadout, step, TICK_RATE, type PlayerInput, type SimContent, type WorldState } from "../world";
import { hasLineOfSight } from "../zone/zone";
import { autoAttackSkill, compileSkill, MAX_DEPTH, supportFits } from "./compile";
import { MAX_PROJECTILES } from "./runtime";
import type { Loadout, SupportDef } from "./types";

const quiet: SimContent = { ...content, zoneGen: { ...content.zoneGen, monsterPool: [] } };
const sup = (...ids: string[]) => ids.map((id) => content.supports.find((s) => s.id === id)!);
const frostBolt = content.skills.find((s) => s.id === "frost_bolt")!;
const sword = content.weapons.find((w) => w.id === "rusty_sword")!;
const wand = content.weapons.find((w) => w.id === "apprentice_wand")!;
const compile = (...supports: string[]) => compileSkill({ skill: frostBolt, supports: sup(...supports), playerMods: [] });

describe("compileSkill", () => {
  it("Frost Bolt alone is one cold projectile", () => {
    const c = compile();
    expect(c.nodes).toHaveLength(1);
    expect(c.nodes[0]!.count).toBe(1);
    expect(c.nodes[0]!.base.cold).toEqual([10, 15]);
    expect(c.cost).toBe(6);
  });

  it("Volley fires 3 and multiplies cost", () => {
    const c = compile("volley");
    expect(c.nodes[0]!.count).toBe(3);
    expect(c.cost).toBeCloseTo(6 * 1.4);
  });

  it("the user's combo: Volley + Shatter = 3 bolts that each burst into 7 shards (21)", () => {
    const c = compile("volley", "shatter");
    const root = c.nodes[0]!;
    const shard = c.nodes[root.on.end![0]!]!;
    expect(root.count).toBe(3);
    expect(shard.count).toBe(7); // Shatter's 5 + Volley's 2: Volley applies to every projectile
    expect(root.count * shard.count).toBe(21);
    expect(shard.pattern).toBe("ring");
    // Shards inherit cold damage at 40% effectiveness, and Volley's less damage applies to them too.
    expect(shard.base.cold![0]).toBeCloseTo(4);
    expect(shard.tags).toContain("spell");
  });

  it("Shatter is root-scoped, so shards don't shatter again", () => {
    const c = compile("shatter");
    const shard = c.nodes[c.nodes[0]!.on.end![0]!]!;
    expect(shard.on.end).toBeUndefined();
  });

  it("an all-scope self-repeating trigger stops at the depth limit", () => {
    const loop: SupportDef = { ...sup("shatter")[0]!, id: "loop", add: { ...sup("shatter")[0]!.add!, scope: "all" } };
    const c = compileSkill({ skill: frostBolt, supports: [loop], playerMods: [] });
    expect(Math.max(...c.nodes.map((n) => n.depth))).toBe(MAX_DEPTH);
  });

  it("supports that don't fit the skill are ignored", () => {
    expect(supportFits(sup("volley")[0]!, autoAttackSkill(sword))).toBe(false);
    const c = compileSkill({ skill: autoAttackSkill(sword), supports: sup("volley"), playerMods: [], weapon: sword });
    expect(c.supports).toEqual([]);
    expect(c.nodes[0]!.count).toBe(1);
  });

  it("weapon auto attacks use weapon damage and speed", () => {
    const c = compileSkill({ skill: autoAttackSkill(wand), supports: sup("volley"), playerMods: [], weapon: wand });
    expect(c.isAttack).toBe(true);
    expect(c.nodes[0]!.base.lightning).toEqual([5, 11]);
    expect(c.interval).toBeCloseTo(1 / wand.attacksPerSecond);
    expect(c.nodes[0]!.count).toBe(3);
  });
});

// ---- runtime ----

const idle = (aim = { x: 0, y: 0 }): PlayerInput => ({ move: { x: 0, y: 0 }, aim, attack: false, autoAttack: false });

/** Player standing in the open end arena, 3 tiles from the exit (which would end the zone). */
function arena(c: SimContent = quiet, loadout?: Partial<Loadout>): WorldState {
  const w = createWorld(c, 21);
  const ts = w.zone.tileSize;
  w.player.pos = { x: w.zone.exit.x - 3 * ts, y: w.zone.exit.y };
  if (loadout) setLoadout(w, c, { ...w.player.loadout, ...loadout });
  return w;
}

function addMonster(w: WorldState, x: number, y: number) {
  const def = content.monsters[0]!;
  const m = { id: w.nextId++, defId: def.id, pos: { x, y }, knock: { x: 0, y: 0 }, radius: def.radius, life: 1e6, maxLife: 1e6, facing: 0, evasionEntropy: 0.5, contactCooldown: 99, packId: 999, awake: true, level: 1 };
  w.monsters.push(m);
  return m;
}

const castFrostBolt = (w: WorldState, at: { x: number; y: number }) => step(w, quiet, { ...idle(at), skills: [true] });
const runFor = (w: WorldState, c: SimContent, seconds: number) => {
  for (let i = 0; i < seconds * TICK_RATE; i++) step(w, c, idle());
};

describe("skill runtime", () => {
  it("casting Frost Bolt costs mana and its bolt damages the monster it flies into", () => {
    const w = arena();
    const m = addMonster(w, w.player.pos.x + 150, w.player.pos.y);
    const mana = w.player.mana;
    const ev = castFrostBolt(w, m.pos);
    expect(ev.some((e) => e.type === "cast")).toBe(true);
    expect(w.player.mana).toBeCloseTo(mana - 6, 0);
    runFor(w, quiet, 0.5);
    expect(m.life).toBeLessThan(m.maxLife);
  });

  it("without enough mana nothing is cast", () => {
    const w = arena();
    w.player.mana = 1;
    const ev = castFrostBolt(w, { x: w.player.pos.x + 100, y: w.player.pos.y });
    expect(ev.some((e) => e.type === "no_mana")).toBe(true);
    expect(w.projectiles).toHaveLength(0);
  });

  it("Pierce: one bolt goes through a line of 3 monsters", () => {
    const w = arena(quiet, { slots: [{ skill: "frost_bolt", supports: ["pierce"] }] });
    const { x, y } = w.player.pos;
    const ms = [100, 160, 220].map((dx) => addMonster(w, x + dx, y));
    castFrostBolt(w, { x: x + 300, y });
    runFor(w, quiet, 0.6);
    expect(ms.every((m) => m.life < m.maxLife)).toBe(true);
  });

  it("Chain: the bolt redirects to a second monster off its path", () => {
    const w = arena(quiet, { slots: [{ skill: "frost_bolt", supports: ["chain"] }] });
    const { x, y } = w.player.pos;
    const a = addMonster(w, x + 100, y);
    const b = addMonster(w, x + 100, y + 120);
    castFrostBolt(w, a.pos);
    runFor(w, quiet, 0.8);
    expect(a.life).toBeLessThan(a.maxLife);
    expect(b.life).toBeLessThan(b.maxLife);
  });

  it("Fork: the first hit splits the bolt into two", () => {
    const w = arena(quiet, { slots: [{ skill: "frost_bolt", supports: ["fork"] }] });
    const { x, y } = w.player.pos;
    addMonster(w, x + 80, y);
    castFrostBolt(w, { x: x + 200, y });
    let most = 0;
    for (let i = 0; i < 30; i++) {
      step(w, quiet, idle());
      most = Math.max(most, w.projectiles.length);
    }
    expect(most).toBe(2);
  });

  it("in play: Volley + Shatter puts 21 shards in the air", () => {
    // Short-range bolts so all three end on open floor at the same moment.
    const short: SimContent = { ...quiet, skills: quiet.skills.map((s) => (s.id === "frost_bolt" ? { ...s, root: { ...s.root, range: 100 } } : s)) };
    const w = arena(short, { slots: [{ skill: "frost_bolt", supports: ["volley", "shatter"] }] });
    step(w, short, { ...idle({ x: w.player.pos.x + 100, y: w.player.pos.y }), skills: [true] });
    expect(w.projectiles).toHaveLength(3);
    let shards = 0;
    for (let i = 0; i < 30; i++) {
      step(w, short, idle());
      shards = Math.max(shards, w.projectiles.filter((p) => p.node !== 0).length);
    }
    expect(shards).toBe(21);
  });

  it("never exceeds the projectile budget", () => {
    const w = arena(quiet, { slots: [{ skill: "frost_bolt", supports: ["volley", "shatter", "fork", "pierce"] }] });
    for (let i = 0; i < 600; i++) {
      w.player.mana = 999;
      step(w, quiet, { ...idle({ x: w.player.pos.x + 100, y: w.player.pos.y }), skills: [true] });
      expect(w.projectiles.length).toBeLessThanOrEqual(MAX_PROJECTILES);
    }
  });

  it("wand auto attack shoots the nearest monster in line of sight", () => {
    const w = arena(quiet, { weapon: "apprentice_wand" });
    const m = addMonster(w, w.player.pos.x + 250, w.player.pos.y);
    step(w, quiet, { ...idle(), autoAttack: true });
    expect(w.projectiles).toHaveLength(1);
    runFor(w, quiet, 0.6);
    expect(m.life).toBeLessThan(m.maxLife);
  });

  it("line of sight is blocked by walls", () => {
    const w = arena();
    expect(hasLineOfSight(w.zone, w.player.pos, w.zone.exit)).toBe(true);
    expect(hasLineOfSight(w.zone, w.zone.start, w.zone.exit)).toBe(false); // winding path
  });

  it("dodge roll moves a fixed distance and ignores contact hits", () => {
    const w = arena();
    const hero = content.characters[0]!;
    const start = { ...w.player.pos };
    const m = addMonster(w, start.x + 20, start.y);
    m.contactCooldown = 0;
    step(w, quiet, { ...idle(), move: { x: 0, y: 1 }, dodge: true });
    for (let i = 0; i < hero.dodge.duration * TICK_RATE + 2; i++) step(w, quiet, idle());
    expect(w.player.pos.y - start.y).toBeCloseTo(hero.dodge.distance, -1);
    expect(w.player.life).toBe(w.player.maxLife);
  });

  it("the loadout carries into the next zone", () => {
    const w = arena(quiet, { weapon: "short_bow", slots: [{ skill: "frost_bolt", supports: ["volley"] }] });
    const next = createWorld(quiet, 3, progressAfterClear(w));
    expect(next.player.loadout.weapon).toBe("short_bow");
    expect(next.player.compiled[1]!.nodes[0]!.count).toBe(3);
  });
});

describe("describeSkill", () => {
  it("spells out the Volley + Shatter tree with totals", async () => {
    const { describeSkill } = await import("./describe");
    const lines = describeSkill(compile("volley", "shatter"));
    expect(lines[0]).toMatch(/^Frost Bolt: /);
    expect(lines[1]).toMatch(/^3 × projectile, \d+–\d+ cold/);
    expect(lines[2]).toMatch(/on end → 7 × projectile \(ring\).*\[21 total\]/);
  });
});
