import { describe, expect, it } from "vitest";
import { content } from "../../data";
import { createWorld, NO_AILMENTS, setLoadout, step, TICK_RATE, type MonsterState, type PlayerInput, type SimContent, type SimEvent, type WorldState } from "../world";
import { describeSkill } from "./describe";
import type { Loadout } from "./types";

const quiet: SimContent = { ...content, zoneGen: { ...content.zoneGen, monsterPool: [] } };
const idle = (aim = { x: 0, y: 0 }): PlayerInput => ({ move: { x: 0, y: 0 }, aim, attack: false });
const slot = (skill: string, supports: string[] = []) => ({ skill, supports });

/** Player in the open end arena, 3 tiles from the exit. */
function arena(c: SimContent = quiet, loadout?: Partial<Loadout>): WorldState {
  const w = createWorld(c, 21);
  w.player.pos = { x: w.zone.exit.x - 3 * w.zone.tileSize, y: w.zone.exit.y };
  if (loadout) setLoadout(w, c, { ...w.player.loadout, ...loadout });
  return w;
}

function addMonster(w: WorldState, dx: number, dy: number, life = 1e6): MonsterState {
  const def = content.monsters[0]!;
  const m: MonsterState = {
    id: w.nextId++, defId: def.id, pos: { x: w.player.pos.x + dx, y: w.player.pos.y + dy }, knock: { x: 0, y: 0 }, radius: def.radius,
    life, maxLife: life, facing: 0, evasionEntropy: 0.5, contactCooldown: 99, packId: 999, awake: true, level: 1, ailments: { ...NO_AILMENTS }, dropTable: "none", damageMult: 1, cooldowns: [], cast: null,
  };
  w.monsters.push(m);
  return m;
}

const hurt = (m: MonsterState) => m.life < m.maxLife;
function run(w: WorldState, c: SimContent, seconds: number, input: (i: number) => PlayerInput = () => idle()): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < seconds * TICK_RATE; i++) all.push(...step(w, c, input(i)));
  return all;
}
const cast = (w: WorldState, c: SimContent, slotIndex: number, dx = 100, dy = 0) => {
  const skills = [false, false, false, false];
  skills[slotIndex] = true;
  return step(w, c, { ...idle({ x: w.player.pos.x + dx, y: w.player.pos.y + dy }), skills });
};

describe("area skills", () => {
  it("Ice Nova hits everything around you within its radius, and nothing beyond", () => {
    const w = arena(quiet, { slots: [slot("ice_nova")] });
    const near = [addMonster(w, 100, 0), addMonster(w, -100, 30), addMonster(w, 0, -120)];
    const far = addMonster(w, 260, 0);
    cast(w, quiet, 0);
    expect(near.every(hurt)).toBe(true);
    expect(hurt(far)).toBe(false);
  });

  it("Earthsplitter hits a long narrow cone in front only", () => {
    const w = arena(quiet, { slots: [slot("earthsplitter")] });
    const ahead = addMonster(w, 200, 0);
    const side = addMonster(w, 60, 120);
    const behind = addMonster(w, -80, 0);
    cast(w, quiet, 0, 100, 0);
    expect(hurt(ahead)).toBe(true);
    expect(hurt(side)).toBe(false);
    expect(hurt(behind)).toBe(false);
  });

  it("Fireball explodes on impact and damages enemies next to the target", () => {
    const w = arena(quiet, { slots: [slot("fireball")] });
    const target = addMonster(w, 150, 0);
    const beside = addMonster(w, 150, 45);
    cast(w, quiet, 0, 150, 0);
    run(w, quiet, 0.6);
    expect(hurt(target)).toBe(true);
    expect(hurt(beside)).toBe(true);
  });

  it("Concentrated shrinks the area and raises its damage", () => {
    const plain = arena(quiet, { slots: [slot("ice_nova")] }).player.compiled[1]!.nodes[0]!;
    const conc = arena(quiet, { slots: [slot("ice_nova", ["concentrated"])] }).player.compiled[1]!.nodes[0]!;
    expect(conc.radius).toBeCloseTo(plain.radius * Math.sqrt(0.65));
    expect(conc.mods.some((m) => m.stat === "damage" && m.kind === "more" && m.value === 35)).toBe(true);
  });
});

describe("projectile skills", () => {
  it("Fanning Shot fires 5 arrows, 7 with Volley", () => {
    const w = arena(quiet, { slots: [slot("fanning_shot"), slot("fanning_shot", ["volley"])] });
    expect(w.player.compiled[1]!.nodes[0]!.count).toBe(5);
    expect(w.player.compiled[2]!.nodes[0]!.count).toBe(7);
    cast(w, quiet, 0);
    expect(w.projectiles).toHaveLength(5);
  });

  it("Magma Strike lobs 3 fire balls per enemy hit that fly over enemies and explode where they land", () => {
    const w = arena(quiet, { slots: [slot("magma_strike")] });
    addMonster(w, 40, 0);
    cast(w, quiet, 0, 100, 0);
    expect(w.projectiles).toHaveLength(3);
    const balls = w.player.compiled[1]!.nodes[w.projectiles[0]!.node]!;
    expect(balls.lobbed).toBe(true);
    expect(Object.keys(balls.base)).toEqual(["fire"]); // weapon physical converted to fire
    const events = run(w, quiet, 0.6);
    expect(events.filter((e) => e.type === "area")).toHaveLength(3);
  });
});

describe("ailments", () => {
  it("cold hits chill (slow); a big enough cold hit freezes (no moving, no attacking)", () => {
    const w = arena(quiet, { slots: [slot("ice_nova")] });
    const m = addMonster(w, 100, 0, 30); // Ice Nova's 14–20 cold is ≥ 20% of 30 life → freeze, and it survives
    cast(w, quiet, 0);
    expect(m.life).toBeGreaterThan(0);
    expect(m.ailments.chill).toBeGreaterThan(0);
    expect(m.ailments.slow).toBe(content.combat.ailments.chill.slow);
    expect(m.ailments.freeze).toBeGreaterThan(0);
    const before = { ...m.pos };
    m.knock = { x: 0, y: 0 };
    step(w, quiet, idle());
    expect(m.pos).toEqual(before);
  });

  it("chilled monsters move slower", () => {
    const moved = (chilled: boolean) => {
      const w = arena();
      const m = addMonster(w, 300, 0);
      if (chilled) m.ailments = { ...NO_AILMENTS, chill: 5, slow: 30 };
      const x0 = m.pos.x;
      run(w, quiet, 0.5);
      return x0 - m.pos.x;
    };
    expect(moved(true)).toBeCloseTo(moved(false) * 0.7, 0);
  });

  it("ignite burns over time, can kill, and the kill gives XP", () => {
    const always: SimContent = {
      ...quiet,
      skills: quiet.skills.map((s) => (s.id === "fireball" ? { ...s, mods: [{ stat: "ignite_chance", kind: "flat", value: 1000 }] } : s)),
    };
    const w = arena(always, { slots: [slot("fireball")] });
    const m = addMonster(w, 120, 0, 60);
    cast(w, always, 0, 120, 0);
    run(w, always, 0.4);
    expect(m.ailments.ignite).toBeGreaterThan(0);
    const after = m.life;
    run(w, always, 0.5);
    expect(m.life).toBeLessThan(after); // burning with no new hits
    m.life = 1; // let the burn finish it
    const xp = w.player.xp;
    run(w, always, 0.5);
    expect(w.monsters.includes(m)).toBe(false);
    expect(w.player.xp).toBeGreaterThan(xp);
  });

  it("Added Cold on the weapon attack makes sword hits chill", () => {
    const w = arena(quiet, { attackSupports: ["added_cold"] });
    const m = addMonster(w, 40, 0);
    step(w, quiet, { ...idle(m.pos), attack: true });
    expect(m.ailments.chill).toBeGreaterThan(0);
  });
});

describe("supports that change how skills fire", () => {
  it("Echo repeats the cast once 0.3 s later without spending mana again", () => {
    const w = arena(quiet, { slots: [slot("frost_bolt", ["echo"])] });
    cast(w, quiet, 0);
    const afterCast = w.player.mana;
    expect(w.projectiles).toHaveLength(1);
    run(w, quiet, 0.35);
    // first bolt still flying + the echo
    expect(w.projectiles.length).toBe(2);
    // Mana only regenerated since the cast: the echo didn't charge again.
    expect(w.player.mana).toBeCloseTo(afterCast + (w.player.stats.mana_regen ?? 0) * 0.35, 1);
  });

  it("Cast on Kill fires the skill where an enemy dies, and its button does nothing", () => {
    const w = arena(quiet, { slots: [slot("frost_bolt"), slot("ice_nova", ["cast_on_kill"])] });
    // The button for the triggered skill doesn't cast.
    expect(cast(w, quiet, 1).some((e) => e.type === "cast")).toBe(false);
    const victim = addMonster(w, 40, 0, 1);
    const bystander = addMonster(w, 40, 90);
    const events = run(w, quiet, 0.2, (i) => ({ ...idle(victim.pos), attack: i === 0 }));
    const nova = events.find((e) => e.type === "area");
    expect(nova).toBeDefined();
    expect(nova && nova.type === "area" && Math.hypot(nova.pos.x - victim.pos.x, nova.pos.y - victim.pos.y)).toBeLessThan(1);
    expect(hurt(bystander)).toBe(true);
  });

  it("Knockback multiplies knockback", () => {
    const base = arena().player.compiled[0]!.nodes[0]!.knockback;
    const kb = arena(quiet, { attackSupports: ["knockback"] }).player.compiled[0]!.nodes[0]!.knockback;
    expect(kb).toBeCloseTo((base + 150) * 2);
  });

  it("describes Fireball's explosion and Magma Strike's lobbed balls", () => {
    const w = arena(quiet, { slots: [slot("fireball"), slot("magma_strike")] });
    expect(describeSkill(w.player.compiled[1]!).join("\n")).toMatch(/on end → burst r70/);
    expect(describeSkill(w.player.compiled[2]!).join("\n")).toMatch(/on hit → 3 × lobbed projectile, \d+–\d+ fire/);
  });
});

describe("Cast on Kill targeting", () => {
  it("the triggered skill's main projectile aims at the next enemy; its Shatter shards still burst in a ring", () => {
    const w = arena(quiet, { slots: [slot("ice_nova"), slot("frost_bolt", ["cast_on_kill", "shatter"])] });
    const victim = addMonster(w, 40, 0, 1);
    const next = addMonster(w, 40, 260); // off to the side: the old "away from player" aim would miss it
    step(w, quiet, { ...idle(victim.pos), attack: true }); // sword kills the victim
    step(w, quiet, idle()); // reaped → Frost Bolt casts itself at the corpse
    const bolt = w.projectiles.find((pr) => pr.node === 0);
    expect(bolt).toBeDefined();
    const toNext = { x: next.pos.x - bolt!.pos.x, y: next.pos.y - bolt!.pos.y };
    const l = Math.hypot(toNext.x, toNext.y);
    expect((bolt!.dir.x * toNext.x + bolt!.dir.y * toNext.y) / l).toBeGreaterThan(0.95);
    // Let it hit and shatter: shards spread in every direction, not all toward an enemy.
    let shards: typeof w.projectiles = [];
    for (let i = 0; i < 60 && shards.length === 0; i++) {
      step(w, quiet, idle());
      shards = w.projectiles.filter((pr) => pr.node !== 0);
    }
    expect(shards.length).toBe(5);
    expect(Math.min(...shards.map((s) => s.dir.y))).toBeLessThan(-0.5);
    expect(Math.max(...shards.map((s) => s.dir.y))).toBeGreaterThan(0.5);
  });
});

describe("leech", () => {
  it("life leech heals from damage dealt, no faster than 20% of max life per second", () => {
    const w = arena(quiet, { attackSupports: ["life_leech"] });
    const target = addMonster(w, 40, 0);
    w.player.life = 10;
    const max = w.player.maxLife;
    run(w, quiet, 1, () => ({ ...idle(target.pos), attack: true }));
    const healed = w.player.life - 10;
    expect(healed).toBeGreaterThan(0);
    expect(healed).toBeLessThanOrEqual(max * 0.2 + 0.01);
  });

  it("mana leech refills mana from hits; no leech without the support", () => {
    const leech = arena(quiet, { attackSupports: ["mana_leech"] });
    const plain = arena(quiet, { attackSupports: [] });
    for (const w of [leech, plain]) {
      const t = addMonster(w, 40, 0);
      w.player.mana = 0;
      w.player.stats.mana_regen = 0;
      run(w, quiet, 1, () => ({ ...idle(t.pos), attack: true }));
    }
    expect(leech.player.mana).toBeGreaterThan(0);
    expect(plain.player.mana).toBe(0);
  });
});
