import { describe, expect, it } from "vitest";
import { content } from "../../data";
import { plainMap } from "../items/cairnstone";
import { newCharacter } from "../items/save";
import { createWorld, step, type MonsterState, type SimContent, type WorldState } from "../world";

const quiet: SimContent = { ...content, zoneGen: { ...content.zoneGen, monsterPool: [] } };
const idle = { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, attack: false };

/** One awake monster of a kind, `dx` px from the player along an open stretch of the zone. */
function duel(id: string, dx: number): { w: WorldState; m: MonsterState } {
  const w = createWorld(quiet, 11, newCharacter(quiet, 11), plainMap(11, 1));
  const def = content.monsters.find((d) => d.id === id)!;
  // Along the first path segment: open floor in a straight line, far from the exit.
  const a = w.zone.mainPath[0]!;
  const b = w.zone.mainPath[1]!;
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  const along = (d: number) => ({ x: a.x + ((b.x - a.x) * d) / l, y: a.y + ((b.y - a.y) * d) / l });
  w.player.pos = along(40);
  w.player.maxLife = w.player.life = 1e6;
  const m: MonsterState = {
    id: w.nextId++, defId: id, pos: along(40 + dx), knock: { x: 0, y: 0 }, radius: def.radius,
    life: 1e6, maxLife: 1e6, facing: 0, evasionEntropy: 0.5, contactCooldown: 0, packId: 1, awake: true, level: 1,
    ailments: { chill: 0, slow: 0, freeze: 0, ignite: 0, igniteDps: 0 }, dropTable: "none", damageMult: 1, cooldowns: (def.attacks ?? []).map(() => 0), cast: null,
  };
  w.monsters = [m];
  return { w, m };
}

describe("monster attacks", () => {
  it("archers shoot from range and keep their distance", () => {
    const { w, m } = duel("bone_archer", 200);
    let shots = 0;
    for (let i = 0; i < 240; i++) {
      step(w, quiet, idle);
      shots = Math.max(shots, w.enemyShots.length);
    }
    expect(shots).toBeGreaterThan(0);
    expect(w.player.life).toBeLessThan(1e6);
    expect(Math.hypot(m.pos.x - w.player.pos.x, m.pos.y - w.player.pos.y)).toBeGreaterThan(150);
  });

  it("brutes telegraph a slam, and rolling out of it avoids the damage", () => {
    const { w } = duel("brute", 120);
    let seen = false;
    for (let i = 0; i < 30 && !seen; i++) {
      step(w, quiet, idle);
      seen = w.telegraphs.length > 0;
    }
    expect(seen).toBe(true);
    const slam = w.telegraphs[0]!;
    // Walk well out of the circle before it lands.
    const before = w.player.life;
    w.player.pos = { x: slam.pos.x - slam.radius - 80, y: slam.pos.y };
    w.monsters[0]!.ailments.freeze = 5; // and keep the brute from following up
    for (let i = 0; i < 90; i++) step(w, quiet, idle);
    expect(w.telegraphs).toHaveLength(0);
    expect(w.player.life).toBe(before);
  });

  it("casters deal elemental damage, so resistance matters", () => {
    const hurt = (res: number) => {
      const { w } = duel("ember_acolyte", 220);
      w.player.stats.fire_resistance = res;
      w.player.stats.evasion = 0;
      for (let i = 0; i < 600; i++) step(w, quiet, idle);
      return 1e6 - w.player.life;
    };
    expect(hurt(75)).toBeLessThan(hurt(0) * 0.5);
  });

  it("frozen monsters lose their cast", () => {
    const { w, m } = duel("brute", 120);
    for (let i = 0; i < 30 && !m.cast; i++) step(w, quiet, idle);
    expect(m.cast).not.toBeNull();
    m.ailments.freeze = 1;
    step(w, quiet, idle);
    expect(m.cast).toBeNull();
  });
});
