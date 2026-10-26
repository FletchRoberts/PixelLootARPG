// Controller aiming. Mouse users point at things; stick users need help:
// right stick aims directly, otherwise we soft-lock the nearest awake enemy,
// preferring ones in the direction you're moving or facing.

import { angleDiff, angleOf, dist, len, sub, type Vec } from "../../sim/core/vec";

export const ASSIST_RANGE = 240; // px
export const ASSIST_CONE = Math.PI * 0.4; // ±72° counts as "ahead"
export const RIGHT_STICK_AIM_MIN = 0.35; // deflection needed before the right stick takes over

export interface AimContext {
  player: Vec;
  facing: number; // radians, last facing from the sim
  move: Vec; // left stick, post-deadzone
  rightStick: Vec;
  enemies: readonly Vec[]; // awake enemy positions
}

/** World-space point to aim at. */
export function padAim(ctx: AimContext): Vec {
  const { player } = ctx;
  if (len(ctx.rightStick) >= RIGHT_STICK_AIM_MIN) return pointAt(player, angleOf(ctx.rightStick));

  const heading = len(ctx.move) > 0 ? angleOf(ctx.move) : ctx.facing;
  const target = assistTarget(player, heading, ctx.enemies);
  if (target) return target;
  return pointAt(player, heading);
}

/** Nearest enemy in range, with enemies ahead of `heading` preferred over ones behind. */
export function assistTarget(player: Vec, heading: number, enemies: readonly Vec[]): Vec | null {
  let best: Vec | null = null;
  let bestScore = Infinity;
  for (const e of enemies) {
    const d = dist(player, e);
    if (d > ASSIST_RANGE) continue;
    const off = Math.abs(angleDiff(angleOf(sub(e, player)), heading));
    // Enemies outside the cone count as if they were 2x further away.
    const score = off <= ASSIST_CONE ? d : d * 2;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function pointAt(from: Vec, angle: number): Vec {
  return { x: from.x + Math.cos(angle) * 100, y: from.y + Math.sin(angle) * 100 };
}
