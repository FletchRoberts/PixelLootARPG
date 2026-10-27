import { describe, expect, it } from "vitest";
import { content } from "../../data";
import { plainMap } from "../items/cairnstone";
import { newCharacter } from "../items/save";
import { createWorld, step } from "../world";

const idle = { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, attack: false };
const world = (seed: number) => createWorld(content, seed, newCharacter(content, 1), plainMap(seed, 3));
const defOf = (id: string) => content.monsters.find((d) => d.id === id)!;

describe("bosses", () => {
  it("every map has a boss in the end arena: usually a Warden, sometimes a Titan", () => {
    let titans = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const w = world(seed);
      const boss = w.monsters.find((m) => m.id === w.bossId)!;
      expect(boss).toBeTruthy();
      expect(defOf(boss.defId).boss).toBeTruthy();
      expect(boss.name).toBe(defOf(boss.defId).name);
      if (defOf(boss.defId).boss === "titan") titans++;
    }
    expect(titans).toBeGreaterThan(2);
    expect(titans).toBeLessThan(30);
  });

  it("the exit is sealed until the boss dies", () => {
    const w = world(4);
    for (const m of w.monsters) if (m.id !== w.bossId) m.life = 0;
    step(w, content, idle);
    w.monsters.find((m) => m.id === w.bossId)!.awake = false;
    w.player.pos = { ...w.zone.exit };
    w.player.maxLife = w.player.life = 1e9;
    step(w, content, idle);
    expect(w.status).toBe("playing");
    w.monsters.find((m) => m.id === w.bossId)!.life = 0;
    const events = step(w, content, idle);
    expect(events.some((e) => e.type === "boss_defeated")).toBe(true);
    step(w, content, idle);
    expect(w.status).toBe("complete");
  });

  it("Titans enrage below half life", () => {
    const seed = Array.from({ length: 300 }, (_, i) => i + 1).find((s) => {
      const w = world(s);
      return defOf(w.monsters.find((m) => m.id === w.bossId)!.defId).boss === "titan";
    })!;
    const w = world(seed);
    const boss = w.monsters.find((m) => m.id === w.bossId)!;
    const dmg = boss.damageMult;
    boss.awake = true;
    boss.life = boss.maxLife * 0.4;
    const events = step(w, content, idle);
    expect(events.some((e) => e.type === "boss_enraged")).toBe(true);
    expect(boss.enraged).toBe(true);
    expect(boss.damageMult).toBeGreaterThan(dmg);
  });

  it("bosses drop a lot more than a rare monster", () => {
    let total = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const w = world(seed);
      w.monsters = w.monsters.filter((m) => m.id === w.bossId);
      w.monsters[0]!.life = 0;
      step(w, content, idle);
      total += w.groundItems.length;
    }
    expect(total / 10).toBeGreaterThan(2.5);
  });
});
