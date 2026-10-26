import { describe, expect, it } from "vitest";
import { content } from "../data";
import { createWorld, step, TICK_RATE, type MonsterState, type PlayerInput, type SimContent, type WorldState } from "./world";
import { buildFlowField, nextStep } from "./zone/flowfield";
import { isFloorAt, tileCenter, tileOf } from "./zone/zone";

const idle = (aim = { x: 0, y: 0 }): PlayerInput => ({ move: { x: 0, y: 0 }, aim, attack: false });

/** Same zones, but no monsters, so tests control exactly which monsters exist. */
const quiet: SimContent = { ...content, zoneGen: { ...content.zoneGen, monsterPool: [] } };

function addMonster(w: WorldState, pos: { x: number; y: number }, awake = true): MonsterState {
  const def = content.monsters[0]!;
  const m: MonsterState = {
    id: w.nextId++,
    defId: def.id,
    pos: { ...pos },
    knock: { x: 0, y: 0 },
    radius: def.radius,
    life: def.life,
    maxLife: def.life,
    facing: 0,
    contactCooldown: 0,
    packId: 999,
    awake,
  };
  w.monsters.push(m);
  return m;
}

/** Steer the player along the zone toward the exit using a flow field rooted at the exit. */
function walkToExit(w: WorldState, maxSeconds: number): number {
  const z = w.zone;
  const e = tileOf(z, z.exit);
  const field = buildFlowField(z, e.tx, e.ty, 0xfffe);
  for (let i = 0; i < maxSeconds * TICK_RATE && w.status === "playing"; i++) {
    const t = tileOf(z, w.player.pos);
    const next = nextStep(field, z, t.tx, t.ty);
    const target = next ? tileCenter(z, next.tx, next.ty) : z.exit;
    step(w, quiet, { ...idle(), move: { x: target.x - w.player.pos.x, y: target.y - w.player.pos.y } });
  }
  return w.tick / TICK_RATE;
}

describe("world", () => {
  it("spawns sleeping packs from the zone and starts the player at the zone start", () => {
    const w = createWorld(content, 7);
    expect(w.player.pos).toEqual(w.zone.start);
    expect(w.monsters.length).toBe(w.zone.packs.reduce((n, p) => n + p.size, 0));
    expect(w.monsters.every((m) => !m.awake && isFloorAt(w.zone, m.pos))).toBe(true);
  });

  it("walls stop the player", () => {
    const w = createWorld(quiet, 3);
    for (const dir of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      for (let i = 0; i < 300; i++) {
        step(w, quiet, { ...idle(), move: dir });
        expect(isFloorAt(w.zone, w.player.pos)).toBe(true);
      }
    }
  });

  it("damages monsters in the aimed arc and not behind", () => {
    const w = createWorld(quiet, 1);
    const p = w.player.pos;
    addMonster(w, { x: p.x + 40, y: p.y }, false);
    const ev = step(w, quiet, { ...idle({ x: p.x - 100, y: p.y }), attack: true });
    expect(ev.some((e) => e.type === "damage")).toBe(false);

    w.player.attackCooldown = 0;
    const ev2 = step(w, quiet, { ...idle({ x: p.x + 100, y: p.y }), attack: true });
    expect(ev2.some((e) => e.type === "damage")).toBe(true);
  });

  it("kills a monster after enough hits and counts it", () => {
    const w = createWorld(quiet, 1);
    addMonster(w, { x: w.player.pos.x + 40, y: w.player.pos.y });
    for (let i = 0; i < 600 && w.monsters.length > 0; i++) {
      step(w, quiet, { move: { x: 0, y: 0 }, aim: w.monsters[0]!.pos, attack: true });
    }
    expect(w.monsters).toHaveLength(0);
    expect(w.kills).toBe(1);
  });

  it("an awake monster paths around walls to reach and kill the player", () => {
    const w = createWorld(quiet, 11);
    // A few nodes down the winding path: not in a straight line from the start.
    addMonster(w, w.zone.mainPath[3]!);
    let died = false;
    for (let i = 0; i < 60 * TICK_RATE && !died; i++) died = step(w, quiet, idle()).some((e) => e.type === "player_died");
    expect(died).toBe(true);
    expect(w.status).toBe("dead");
  });

  it("sleeping monsters stay put until the player comes within aggro range", () => {
    const w = createWorld(quiet, 11);
    const m = addMonster(w, w.zone.mainPath[4]!, false);
    const start = { ...m.pos };
    for (let i = 0; i < 2 * TICK_RATE; i++) step(w, quiet, idle());
    expect(m.awake).toBe(false);
    expect(m.pos).toEqual(start);
  });

  it("reaching the exit completes the zone", () => {
    const w = createWorld(quiet, 5);
    const seconds = walkToExit(w, 300);
    expect(w.status).toBe("complete");
    // Pure walking time; with fighting a run should land in the 2-4 minute target.
    expect(seconds).toBeGreaterThan(20);
    expect(seconds).toBeLessThan(120);
  });

  it("is deterministic for the same seed and inputs", () => {
    const run = () => {
      const w = createWorld(content, 42);
      for (let i = 0; i < 900; i++) {
        step(w, content, { move: { x: Math.sin(i / 30), y: Math.cos(i / 45) }, aim: { x: 0, y: 0 }, attack: i % 3 === 0 });
      }
      return JSON.stringify(w);
    };
    expect(run()).toBe(run());
  });
});
