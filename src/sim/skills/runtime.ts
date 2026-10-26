// Running compiled skills: melee strikes, projectiles (pierce → fork → chain → end),
// and triggers that spawn child deliveries. Plain data in world state.

import { add, angleDiff, angleOf, dist, normalize, scale, sub, type Vec } from "../core/vec";
import type { MonsterState, SimEvent, WorldState } from "../world";
import { hasLineOfSight, isFloorAt } from "../zone/zone";
import type { CompiledNode, CompiledSkill, TriggerEvent } from "./types";

export const MAX_PROJECTILES = 400; // entity budget per world (docs/skills.md)
export const CHAIN_RANGE = 300; // px
const FORK_ANGLE = (25 * Math.PI) / 180;

export interface ProjectileState {
  id: number;
  skill: number; // index into player.compiled
  node: number; // index into that skill's nodes
  pos: Vec;
  dir: Vec; // unit vector
  travelled: number;
  pierceLeft: number;
  chainLeft: number;
  forkLeft: number;
  hit: number[]; // monster ids already hit (never hit twice)
}

/** Hooks into world combat; returns true if the hit killed the monster. */
export interface SkillContext {
  hit(m: MonsterState, skill: CompiledSkill, node: CompiledNode, dir: Vec, events: SimEvent[]): boolean;
}

const fromAngle = (a: number): Vec => ({ x: Math.cos(a), y: Math.sin(a) });

function skillAt(world: WorldState, index: number): CompiledSkill {
  const s = world.player.compiled[index];
  if (!s) throw new Error(`No compiled skill at ${index}`);
  return s;
}

/** Use a skill's root delivery from `origin` toward `angle`. */
export function useSkill(world: WorldState, skillIndex: number, origin: Vec, angle: number, ctx: SkillContext, events: SimEvent[]): void {
  deliver(world, skillIndex, 0, origin, angle, [], ctx, events);
}

function deliver(world: WorldState, si: number, ni: number, origin: Vec, angle: number, exclude: number[], ctx: SkillContext, events: SimEvent[]): void {
  const node = skillAt(world, si).nodes[ni]!;
  if (node.kind === "melee") meleeStrike(world, si, ni, origin, angle, ctx, events);
  else spawnProjectiles(world, si, ni, origin, angle, exclude);
}

function fire(world: WorldState, si: number, node: CompiledNode, event: TriggerEvent, at: Vec, angle: number, exclude: number[], ctx: SkillContext, events: SimEvent[]): void {
  for (const child of node.on[event] ?? []) deliver(world, si, child, at, angle, exclude, ctx, events);
}

function spawnProjectiles(world: WorldState, si: number, ni: number, origin: Vec, angle: number, exclude: number[]): void {
  const node = skillAt(world, si).nodes[ni]!;
  for (let i = 0; i < node.count; i++) {
    if (world.projectiles.length >= MAX_PROJECTILES) return;
    let a = angle;
    if (node.pattern === "ring") a = angle + (i * Math.PI * 2) / node.count;
    else if (node.count > 1) a = angle - node.spread / 2 + (i * node.spread) / (node.count - 1);
    world.projectiles.push({
      id: world.nextId++,
      skill: si,
      node: ni,
      pos: { ...origin },
      dir: fromAngle(a),
      travelled: 0,
      pierceLeft: node.pierce,
      chainLeft: node.chain,
      forkLeft: node.fork,
      hit: [...exclude],
    });
  }
}

function meleeStrike(world: WorldState, si: number, ni: number, origin: Vec, angle: number, ctx: SkillContext, events: SimEvent[]): void {
  const skill = skillAt(world, si);
  const node = skill.nodes[ni]!;
  const p = world.player;
  const reach = p.radius + node.reach;
  events.push({ type: "swing", actorId: p.id, angle, arc: node.arc, range: reach });
  for (const m of [...world.monsters]) {
    if (m.life <= 0) continue;
    const toM = sub(m.pos, origin);
    const d = Math.hypot(toM.x, toM.y);
    if (d > reach + m.radius) continue;
    // Monsters overlapping the attacker are always hit; otherwise they must be inside the arc.
    if (d > p.radius + m.radius && Math.abs(angleDiff(angleOf(toM), angle)) > node.arc / 2) continue;
    const dir = normalize(toM);
    const killed = ctx.hit(m, skill, node, dir, events);
    fire(world, si, node, "hit", m.pos, angleOf(dir), [m.id], ctx, events);
    if (killed) fire(world, si, node, "kill", m.pos, angleOf(dir), [m.id], ctx, events);
  }
}

/** Move projectiles, resolve hits and endings. Projectiles spawned this tick start moving next tick. */
export function stepProjectiles(world: WorldState, ctx: SkillContext, events: SimEvent[], dt: number): void {
  const active = world.projectiles;
  world.projectiles = [];
  const gone = new Set<number>();

  for (const pr of active) {
    const skill = world.player.compiled[pr.skill];
    const node = skill?.nodes[pr.node];
    if (!skill || !node) continue;

    const next = add(pr.pos, scale(pr.dir, node.speed * dt));
    if (!isFloorAt(world.zone, next)) {
      end(pr, pr.pos);
      continue;
    }
    pr.pos = next;
    pr.travelled += node.speed * dt;

    const target = world.monsters.find((m) => m.life > 0 && !pr.hit.includes(m.id) && dist(m.pos, pr.pos) < node.radius + m.radius);
    if (target) {
      if (!onHit(pr, target, skill, node)) continue;
    }
    if (pr.travelled >= node.range) {
      end(pr, pr.pos);
      continue;
    }
    if (!gone.has(pr.id)) world.projectiles.push(pr);
  }

  /** Returns true if the projectile keeps flying. */
  function onHit(pr: ProjectileState, m: MonsterState, skill: CompiledSkill, node: CompiledNode): boolean {
    const killed = ctx.hit(m, skill, node, pr.dir, events);
    pr.hit.push(m.id);
    const a = angleOf(pr.dir);
    fire(world, pr.skill, node, "hit", m.pos, a, [m.id], ctx, events);
    if (killed) fire(world, pr.skill, node, "kill", m.pos, a, [m.id], ctx, events);

    if (pr.pierceLeft > 0) {
      pr.pierceLeft--;
      return true;
    }
    if (pr.forkLeft > 0) {
      // The projectile splits in two; the original is replaced, so no "end" for it.
      for (const side of [-1, 1]) {
        if (world.projectiles.length >= MAX_PROJECTILES) break;
        world.projectiles.push({ ...pr, id: world.nextId++, pos: { ...m.pos }, dir: fromAngle(a + side * FORK_ANGLE), forkLeft: pr.forkLeft - 1, hit: [...pr.hit] });
      }
      gone.add(pr.id);
      return false;
    }
    if (pr.chainLeft > 0) {
      const next = nearestChainTarget(world, m.pos, pr.hit);
      if (next) {
        pr.chainLeft--;
        pr.pos = { ...m.pos };
        pr.dir = normalize(sub(next.pos, m.pos));
        pr.travelled = 0;
        return true;
      }
    }
    end(pr, m.pos);
    return false;
  }

  function end(pr: ProjectileState, at: Vec): void {
    gone.add(pr.id);
    const node = world.player.compiled[pr.skill]?.nodes[pr.node];
    if (node) fire(world, pr.skill, node, "end", at, angleOf(pr.dir), pr.hit.slice(-1), ctx, events);
  }
}

function nearestChainTarget(world: WorldState, from: Vec, exclude: number[]): MonsterState | null {
  let best: MonsterState | null = null;
  let bestD = CHAIN_RANGE;
  for (const m of world.monsters) {
    if (m.life <= 0 || exclude.includes(m.id)) continue;
    const d = dist(m.pos, from);
    if (d < bestD && hasLineOfSight(world.zone, from, m.pos)) {
      best = m;
      bestD = d;
    }
  }
  return best;
}
