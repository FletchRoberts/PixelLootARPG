import { describe, expect, it } from "vitest";
import { assistTarget, padAim } from "./aim";
import { isActive, isDown, PAD, stick, type PadSnapshot } from "./gamepad";

const pad = (over: Partial<PadSnapshot> = {}): PadSnapshot => ({
  id: "test",
  axes: [0, 0, 0, 0],
  pressed: Array(18).fill(false),
  values: Array(18).fill(0),
  ...over,
});

describe("stick", () => {
  it("ignores drift inside the deadzone", () => {
    expect(stick(0.1, -0.12)).toEqual({ x: 0, y: 0 });
  });

  it("rescales so just past the deadzone is near zero and full tilt is 1", () => {
    expect(Math.hypot(stick(0.21, 0).x, 0)).toBeLessThan(0.05);
    expect(stick(1, 0).x).toBeCloseTo(1);
    const diag = stick(Math.SQRT1_2, Math.SQRT1_2);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1);
  });
});

describe("buttons", () => {
  it("treats triggers as analog with a threshold", () => {
    const values = Array(18).fill(0);
    values[PAD.r2] = 0.2;
    expect(isDown(pad({ values }), "r2")).toBe(false);
    values[PAD.r2] = 0.6;
    expect(isDown(pad({ values }), "r2")).toBe(true);
  });

  it("detects activity from sticks or buttons", () => {
    expect(isActive(pad())).toBe(false);
    expect(isActive(pad({ axes: [0.9, 0, 0, 0] }))).toBe(true);
    const pressed = Array(18).fill(false);
    pressed[PAD.cross] = true;
    expect(isActive(pad({ pressed }))).toBe(true);
  });
});

describe("aim assist", () => {
  const player = { x: 0, y: 0 };

  it("right stick overrides everything", () => {
    const aim = padAim({ player, facing: 0, move: { x: 0, y: 0 }, rightStick: { x: 0, y: -1 }, enemies: [{ x: 50, y: 0 }] });
    expect(aim.x).toBeCloseTo(0);
    expect(aim.y).toBeLessThan(0);
  });

  it("locks the nearest enemy ahead over a slightly nearer one behind", () => {
    const ahead = { x: 150, y: 0 };
    const behind = { x: -100, y: 0 };
    expect(assistTarget(player, 0, [behind, ahead])).toEqual(ahead);
  });

  it("falls back to an enemy behind when nothing is ahead", () => {
    const behind = { x: -100, y: 0 };
    expect(assistTarget(player, 0, [behind])).toEqual(behind);
  });

  it("ignores enemies out of range and aims along movement instead", () => {
    const aim = padAim({ player, facing: 0, move: { x: 0, y: 1 }, rightStick: { x: 0, y: 0 }, enemies: [{ x: 1000, y: 0 }] });
    expect(aim.x).toBeCloseTo(0);
    expect(aim.y).toBeGreaterThan(0);
  });
});
