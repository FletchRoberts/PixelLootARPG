import { describe, expect, it } from "vitest";
import { content } from "../../data";
import { createWorld, currentSave, inventoryCommand, rejoinMap, step, type SimContent } from "../world";
import { plainMap } from "../items/cairnstone";
import { newCharacter } from "../items/save";
import { hideoutRun } from "./hideout";
import { isFloorAt } from "./zone";

const quiet: SimContent = { ...content, zoneGen: { ...content.zoneGen, monsterPool: [] } };
const idle = { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, attack: false };

describe("hideout", () => {
  const hideout = () => createWorld(content, 1, newCharacter(content, 1), hideoutRun(content.hideout));

  it("is a safe room: no monsters, stations on floor, it never completes", () => {
    const w = hideout();
    expect(w.monsters).toHaveLength(0);
    expect(w.zone.stations?.map((s) => s.id).sort()).toEqual(["bench", "map_device", "stash"]);
    for (const s of w.zone.stations!) expect(isFloorAt(w.zone, s.pos)).toBe(true);
    expect(isFloorAt(w.zone, w.zone.start)).toBe(true);
    for (let i = 0; i < 120; i++) step(w, content, idle);
    expect(w.status).toBe("playing");
  });

  it("✕ next to a station uses it", () => {
    const w = hideout();
    const stash = w.zone.stations!.find((s) => s.id === "stash")!;
    w.player.pos = { x: stash.pos.x + 30, y: stash.pos.y };
    const events = step(w, content, { ...idle, pickup: true });
    expect(events).toContainEqual({ type: "interact", station: "stash" });
  });

  it("the stash stores items from each bag and gives them back", () => {
    const w = hideout();
    const save = w.player.save;
    inventoryCommand(w, quiet, { type: "debug_give_gear", opts: { rarity: "rare" }, seed: 3 });
    inventoryCommand(w, quiet, { type: "debug_give_stone", level: 2, rarity: "magic", seed: 3 });
    expect(inventoryCommand(w, quiet, { type: "stash", tab: "gear", index: 0, take: false })).toBeNull();
    expect(inventoryCommand(w, quiet, { type: "stash", tab: "stones", index: 0, take: false })).toBeNull();
    expect(inventoryCommand(w, quiet, { type: "stash", tab: "gems", index: 0, take: false })).toBeNull();
    expect(save.gearBag).toHaveLength(0);
    expect(save.stash.gear).toHaveLength(1);
    expect(save.stash.stones).toHaveLength(1);
    expect(save.stash.gems).toHaveLength(1);
    expect(inventoryCommand(w, quiet, { type: "stash", tab: "gear", index: 0, take: true })).toBeNull();
    expect(save.gearBag).toHaveLength(1);
    expect(inventoryCommand(w, quiet, { type: "stash", tab: "gear", index: 5, take: true })).toBe("nothing there");
  });

  it("the free map from the Map Device is the one previewed for that seed", () => {
    const w = hideout();
    expect(inventoryCommand(w, quiet, { type: "open_map", stoneIndex: null, seed: 4242 })).toBeNull();
    const map = w.player.save.currentMap!;
    expect(map.free).toBe(true);
    expect(map.hideout).toBeUndefined();
    expect(createWorld(quiet, 1, w.player.save).zone.seed).toBe(4242);
  });

  it("a portal takes you home mid-map and back into the same map state", () => {
    const map = createWorld(content, 5, newCharacter(content, 5), plainMap(5, 2));
    map.player.save.currentMap = map.map;
    const killed = map.monsters.splice(0, 3).length;
    expect(step(map, content, { ...idle, portal: true })).toContainEqual({ type: "portal_opened" });
    expect(map.portal).not.toBeNull();
    map.player.pos = { ...map.portal! };
    expect(step(map, content, { ...idle, pickup: true })).toContainEqual({ type: "interact", station: "portal" });

    // In the hideout: a portal back stands near the entrance; store gear meanwhile.
    const home = createWorld(content, 1, currentSave(map), hideoutRun(content.hideout, true));
    expect(home.portal).not.toBeNull();
    expect(isFloorAt(home.zone, home.portal!)).toBe(true);
    inventoryCommand(home, quiet, { type: "debug_give_gear", opts: { rarity: "magic" }, seed: 2 });
    inventoryCommand(home, quiet, { type: "stash", tab: "gear", index: 0, take: false });

    const back = rejoinMap(map, currentSave(home), content);
    expect(back.monsters.length).toBe(map.monsters.length);
    expect(back.totalMonsters - back.monsters.length).toBeGreaterThanOrEqual(killed);
    expect(back.player.save.stash.gear).toHaveLength(1);
    expect(back.player.save.currentMap?.seed).toBe(5);
    expect(back.player.pos).toEqual(map.portal);
  });
});
