// Gamepad reading for the browser "standard" mapping (DualSense, Xbox, etc. in
// Chrome/Edge). Pure functions over a snapshot so they're testable without a pad.

import type { Vec } from "../../sim/core/vec";

/** Standard-mapping button indices, named for a PlayStation pad (Xbox: A B X Y). */
export const PAD = {
  cross: 0, // Xbox A
  circle: 1, // Xbox B
  square: 2, // Xbox X
  triangle: 3, // Xbox Y
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  create: 8, // Xbox View
  options: 9, // Xbox Menu
  l3: 10,
  r3: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  home: 16,
  touchpad: 17,
} as const;

export type PadButton = keyof typeof PAD;

/** Prompt glyphs per button for the PlayStation layout. */
export const PS_GLYPH: Partial<Record<PadButton, string>> = {
  cross: "✕",
  circle: "○",
  square: "□",
  triangle: "△",
  l1: "L1",
  r1: "R1",
  l2: "L2",
  r2: "R2",
  options: "OPTIONS",
  touchpad: "TOUCHPAD",
};

export const STICK_DEADZONE = 0.2;
export const TRIGGER_THRESHOLD = 0.3;

export interface PadSnapshot {
  id: string;
  axes: number[];
  pressed: boolean[];
  values: number[];
}

export function snapshot(gp: Gamepad): PadSnapshot {
  return {
    id: gp.id,
    axes: [...gp.axes],
    pressed: gp.buttons.map((b) => b.pressed),
    values: gp.buttons.map((b) => b.value),
  };
}

/** First connected pad, preferring one the browser maps to the standard layout. */
export function pickGamepad(pads: readonly (Gamepad | null)[]): Gamepad | null {
  const live = pads.filter((p): p is Gamepad => !!p && p.connected);
  return live.find((p) => p.mapping === "standard") ?? live[0] ?? null;
}

/**
 * Radial deadzone with rescaling: below the deadzone reads as zero, and the
 * remaining range maps smoothly onto 0..1 so there's no jump at the edge.
 */
export function stick(x: number, y: number, deadzone = STICK_DEADZONE): Vec {
  const mag = Math.hypot(x, y);
  if (mag <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (mag - deadzone) / (1 - deadzone));
  return { x: (x / mag) * scaled, y: (y / mag) * scaled };
}

export const leftStick = (s: PadSnapshot): Vec => stick(s.axes[0] ?? 0, s.axes[1] ?? 0);
export const rightStick = (s: PadSnapshot): Vec => stick(s.axes[2] ?? 0, s.axes[3] ?? 0);

export function isDown(s: PadSnapshot, b: PadButton): boolean {
  const i = PAD[b];
  // Triggers are analog; treat a light pull as pressed.
  if (b === "l2" || b === "r2") return (s.values[i] ?? 0) > TRIGGER_THRESHOLD;
  return s.pressed[i] ?? false;
}

/** True if the pad is being used at all this frame (for switching prompt glyphs). */
export function isActive(s: PadSnapshot): boolean {
  const sticks = [leftStick(s), rightStick(s)];
  return sticks.some((v) => v.x !== 0 || v.y !== 0) || (Object.keys(PAD) as PadButton[]).some((b) => isDown(s, b));
}
