import { describe, expect, it } from "vitest";
import { content } from "../../data";
import { buildFlowField, distAt, UNREACHED } from "./flowfield";
import { generateZone, withLayout } from "./generate";
import { isFloorAt, tileOf } from "./zone";

const cfg = content.zoneGen;
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);

describe("generateZone", () => {
  it("is deterministic per seed", () => {
    expect(JSON.stringify(generateZone(cfg, 123))).toBe(JSON.stringify(generateZone(cfg, 123)));
    expect(JSON.stringify(generateZone(cfg, 123))).not.toBe(JSON.stringify(generateZone(cfg, 124)));
  });

  it.each(SEEDS)("seed %i: start, exit, packs and branch ends are on reachable floor", (seed) => {
    const z = generateZone(cfg, seed);
    const s = tileOf(z, z.start);
    const field = buildFlowField(z, s.tx, s.ty, 0xfffe);
    const reachable = (p: { x: number; y: number }) => {
      const t = tileOf(z, p);
      return distAt(field, z, t.tx, t.ty) !== UNREACHED;
    };
    expect(isFloorAt(z, z.start)).toBe(true);
    expect(reachable(z.exit)).toBe(true);
    for (const p of z.packs) expect(reachable(p.pos)).toBe(true);
    for (const b of z.branchEnds) expect(reachable(b)).toBe(true);
    // Every floor tile is reachable (generator removes islands).
    z.tiles.forEach((t, i) => {
      if (t) expect(field.dist[i]).not.toBe(UNREACHED);
    });
  });

  it.each(SEEDS)("seed %i: keeps a solid border", (seed) => {
    const z = generateZone(cfg, seed);
    for (let x = 0; x < z.width; x++) {
      expect(z.tiles[x]).toBe(0);
      expect(z.tiles[(z.height - 1) * z.width + x]).toBe(0);
    }
  });

  it("produces linear zones of the intended size", () => {
    const zones = SEEDS.map((s) => generateZone(cfg, s));
    for (const z of zones) {
      const l = withLayout(cfg, cfg.layouts.find((x) => x.id === z.layout));
      expect(z.pathLength).toBeGreaterThan(l.mainPath.segments[0] * l.mainPath.segmentLength[0]);
      expect(z.packs.filter((p) => p.kind === "end")).toHaveLength(1);
    }
    // Branches are optional per zone but should show up regularly.
    const withBranches = zones.filter((z) => z.branchEnds.length > 0).length;
    expect(withBranches / zones.length).toBeGreaterThan(0.6);
  });

  it("every layout shows up and always generates", () => {
    const seen = new Map<string, { n: number; width: number }>();
    for (let i = 0; i < 300; i++) {
      const z = generateZone(cfg, i * 104729 + 7);
      const floor = z.tiles.filter((t) => t).length;
      const e = seen.get(z.layout) ?? { n: 0, width: 0 };
      seen.set(z.layout, { n: e.n + 1, width: e.width + floor / z.pathLength });
    }
    expect([...seen.keys()].sort()).toEqual(cfg.layouts.map((l) => l.id).sort());
    // The expanse is much wider (floor per tile of path) than the winding corridor.
    const w = (id: string) => seen.get(id)!.width / seen.get(id)!.n;
    expect(w("expanse")).toBeGreaterThan(w("winding") * 2);
  });
});
