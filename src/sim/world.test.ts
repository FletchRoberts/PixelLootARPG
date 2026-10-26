import { describe, expect, it } from "vitest";
import { content } from "../data";
import { createWorld, step, type PlayerInput, type SimContent } from "./world";

const idle = (aim = { x: 0, y: 0 }): PlayerInput => ({ move: { x: 0, y: 0 }, aim, attack: false });

/** Room with no spawning, so tests control exactly which monsters exist. */
const quiet: SimContent = {
  ...content,
  testRoom: { ...content.testRoom, initialMonsters: 0, spawnInterval: 1e9 },
};

function withMonsterAt(x: number, y: number, seed = 1) {
  const c: SimContent = { ...quiet, testRoom: { ...quiet.testRoom, initialMonsters: 1, minSpawnDistance: 0 } };
  const w = createWorld(c, seed);
  w.monsters[0]!.pos = { x, y };
  return { w, c };
}

describe("world", () => {
  it("moves the player with input and stays inside the room", () => {
    const w = createWorld(quiet, 1);
    const start = { ...w.player.pos };
    for (let i = 0; i < 60; i++) step(w, quiet, { ...idle(), move: { x: 1, y: 0 } });
    expect(w.player.pos.x).toBeCloseTo(start.x + 220, 0);
    for (let i = 0; i < 600; i++) step(w, quiet, { ...idle(), move: { x: 1, y: 1 } });
    expect(w.player.pos.x).toBe(w.room.width - w.player.radius);
    expect(w.player.pos.y).toBe(w.room.height - w.player.radius);
  });

  it("damages monsters in the aimed arc and not behind", () => {
    const { w, c } = withMonsterAt(0, 0);
    const p = w.player.pos;
    w.monsters[0]!.pos = { x: p.x + 50, y: p.y };
    const ev = step(w, c, { ...idle({ x: p.x - 100, y: p.y }), attack: true });
    expect(ev.some((e) => e.type === "damage")).toBe(false);

    w.player.attackCooldown = 0;
    const ev2 = step(w, c, { ...idle({ x: p.x + 100, y: p.y }), attack: true });
    expect(ev2.some((e) => e.type === "damage")).toBe(true);
  });

  it("kills a monster after enough hits and counts it", () => {
    const { w, c } = withMonsterAt(0, 0);
    for (let i = 0; i < 600 && w.monsters.length > 0; i++) {
      const m = w.monsters[0]!;
      step(w, c, { move: { x: 0, y: 0 }, aim: m.pos, attack: true });
    }
    expect(w.monsters).toHaveLength(0);
    expect(w.kills).toBe(1);
  });

  it("monsters chase and deal contact damage until the player dies", () => {
    const { w, c } = withMonsterAt(100, 100);
    let died = false;
    for (let i = 0; i < 60 * 60 && !died; i++) {
      died = step(w, c, idle()).some((e) => e.type === "player_died");
    }
    expect(died).toBe(true);
    expect(w.status).toBe("dead");
    expect(w.player.life).toBe(0);
  });

  it("is deterministic for the same seed and inputs", () => {
    const run = () => {
      const w = createWorld(content, 42);
      for (let i = 0; i < 600; i++) {
        step(w, content, { move: { x: Math.sin(i / 30), y: Math.cos(i / 45) }, aim: { x: 0, y: 0 }, attack: i % 3 === 0 });
      }
      return JSON.stringify(w);
    };
    expect(run()).toBe(run());
  });
});
