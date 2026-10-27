// Monster attacks beyond contact damage: aimed projectiles, telegraphed slams (at the
// player's spot) and novas (around the monster), and summons. Every attack has a windup the
// player can read; a dodge roll avoids all of them. All hits go through the same pipeline
// (rollHit → applyHit) as contact damage, with map and monster-rarity scaling.

import { applyHit, rollHit, ELEMENTS, type CombatRules, type DamageRange, type Defences } from "../combat/damage";
import type { Rng } from "../core/rng";
import { add, dist, normalize, scale, sub, type Vec } from "../core/vec";
import type { DamageTypeId, Monster, MonsterAttackDef } from "../data/types";
import { monsterScale } from "../stats/character";
import { isFloorAt } from "../zone/zone";
import type { MonsterState, PlayerState, SimContent, SimEvent, WorldState } from "../world";

/** A monster hit, fully scaled when the attack is used (so it lands even if the monster died). */
export interface MonsterHitSpec {
  base: DamageRange;
  accuracy: number;
  critChance: number;
  tags: string[];
  source?: number; // monster id (Vampiric heals it)
  leech?: number; // % of damage dealt the source heals
}

export interface EnemyShot {
  id: number;
  pos: Vec;
  vel: Vec;
  radius: number;
  left: number; // px of travel left
  hit: MonsterHitSpec;
  element: DamageTypeId;
}

export interface Telegraph {
  id: number;
  pos: Vec;
  radius: number;
  t: number;
  total: number; // seconds until it lands
  hit: MonsterHitSpec;
  element: DamageTypeId;
}

export function playerDefences(p: PlayerState): Defences {
  const resist: Defences["resist"] = {};
  for (const e of ELEMENTS) resist[e] = p.stats[`${e}_resistance`] ?? 0;
  return { armour: p.stats.armour ?? 0, evasion: p.stats.evasion ?? 0, resist };
}

function scaleRange(range: DamageRange, mult: number): DamageRange {
  const out: DamageRange = {};
  for (const [t, r] of Object.entries(range) as [keyof DamageRange, [number, number]][]) out[t] = [r[0] * mult, r[1] * mult];
  return out;
}

/** Scale a monster's damage by level, map mods and its own multiplier; add the map's extra elements. */
export function monsterHitSpec(world: WorldState, content: SimContent, m: MonsterState, def: Monster, damage: DamageRange, tags: string[]): MonsterHitSpec {
  const s = content.monsterScaling;
  const ms = world.mapStats;
  const base = scaleRange(damage, monsterScale("damage", m.level, s) * (1 + (ms.monster_damage ?? 0) / 100) * m.damageMult);
  // Map and monster mods: a share of physical damage added as extra fire / cold / lightning.
  for (const e of ["fire", "cold", "lightning"] as const) {
    const pct = (ms[`monster_${e}_extra`] ?? 0) + (m.mstats[`${e}_extra`] ?? 0);
    const phys = base.physical;
    if (pct > 0 && phys) base[e] = [phys[0] * (pct / 100) + (base[e]?.[0] ?? 0), phys[1] * (pct / 100) + (base[e]?.[1] ?? 0)];
  }
  const spec: MonsterHitSpec = { base, accuracy: def.accuracy * monsterScale("accuracy", m.level, s), critChance: ms.monster_crit ?? 0, tags };
  if (m.mstats.leech) {
    spec.source = m.id;
    spec.leech = m.mstats.leech;
  }
  return spec;
}

/** True while a dodge roll makes the player untouchable. */
export function untouchable(world: WorldState, content: SimContent): boolean {
  const hero = content.characters.find((c) => c.id === world.player.defId);
  return world.player.roll !== null && !!hero?.dodge.invulnerable;
}

/** Land a monster hit on the player. Returns true if the player died. */
export function hitPlayer(world: WorldState, content: SimContent, spec: MonsterHitSpec, rng: Rng, events: SimEvent[]): boolean {
  const p = world.player;
  const rules = content.combat as CombatRules;
  const hit = rollHit({ base: spec.base, tags: spec.tags, critChance: spec.critChance, accuracy: spec.accuracy, isAttack: spec.tags.includes("attack") }, [], rules, rng);
  const entropy = { value: p.evasionEntropy };
  const result = applyHit(hit, playerDefences(p), rules, entropy);
  p.evasionEntropy = entropy.value;
  if (result.evaded) {
    events.push({ type: "evade", targetId: p.id, pos: { ...p.pos } });
    return false;
  }
  p.life = Math.max(0, p.life - result.total);
  events.push({ type: "damage", targetId: p.id, amount: result.total, crit: hit.crit, pos: { ...p.pos } });
  if (spec.leech && spec.source !== undefined) {
    const src = world.monsters.find((x) => x.id === spec.source && x.life > 0);
    if (src) src.life = Math.min(src.maxLife, src.life + (result.total * spec.leech) / 100);
  }
  if (p.life > 0) return false;
  world.status = "dead";
  events.push({ type: "player_died" });
  return true;
}

/** The element an attack shows as (its largest damage type). */
function mainElement(d: DamageRange): DamageTypeId {
  let best: DamageTypeId = "physical";
  let max = -1;
  for (const [t, r] of Object.entries(d) as [DamageTypeId, [number, number]][]) {
    if (r[1] > max) {
      max = r[1];
      best = t;
    }
  }
  return best;
}

/** Pick an attack that's ready and in range (weighted), or -1. */
export function chooseAttack(m: MonsterState, attacks: MonsterAttackDef[], distance: number, canSee: boolean, rng: Rng): number {
  const ready = attacks
    .map((a, i) => ({ a, i, weight: a.weight ?? 1 }))
    .filter(({ a, i }) => (m.cooldowns[i] ?? 0) <= 0 && distance <= a.range && (canSee || a.kind === "summon"));
  return rng.weighted(ready)?.i ?? -1;
}

/**
 * Start an attack's windup. Slams and novas show their area right away (that's the
 * telegraph); projectiles and summons happen when the windup ends.
 */
export function startCast(world: WorldState, content: SimContent, m: MonsterState, def: Monster, attacks: MonsterAttackDef[], index: number, events: SimEvent[]): void {
  const a = attacks[index]!;
  m.cooldowns[index] = a.cooldown / (1 + (m.mstats.cooldown ?? 0) / 100);
  m.cast = { attack: index, t: 0 };
  events.push({ type: "monster_cast", actorId: m.id, attack: a.id, windup: a.windup });
  if (a.kind === "slam" || a.kind === "nova") telegraph(world, content, m, def, a, a.kind === "slam" ? world.player.pos : m.pos);
}

/** Put down an area attack's warning circle at `at`; it lands after the windup. */
export function telegraph(world: WorldState, content: SimContent, m: MonsterState, def: Monster, a: MonsterAttackDef, at: Vec): void {
  if (!a.damage) return;
  const hit = monsterHitSpec(world, content, m, def, a.damage, ["spell", "area"]);
  world.telegraphs.push({ id: world.nextId++, pos: { ...at }, radius: a.radius ?? 60, t: 0, total: a.windup, hit, element: mainElement(hit.base) });
}

/** The windup is over: fire projectiles or summon. Returns monsters to summon (the world spawns them). */
export function finishCast(world: WorldState, content: SimContent, m: MonsterState, def: Monster, attacks: MonsterAttackDef[]): { monster: string; count: number } | null {
  const a: MonsterAttackDef = attacks[m.cast!.attack]!;
  m.cast = null;
  if (a.kind === "summon" && a.summon) {
    const room = (a.maxSummons ?? 6) - (m.summoned ?? 0);
    const count = Math.min(room, a.summonCount ?? 2);
    if (count <= 0) return null;
    m.summoned = (m.summoned ?? 0) + count;
    return { monster: a.summon, count };
  }
  if (a.kind !== "projectile" || !a.damage) return null;
  const hit = monsterHitSpec(world, content, m, def, a.damage, ["attack", "projectile"]);
  const aim = Math.atan2(world.player.pos.y - m.pos.y, world.player.pos.x - m.pos.x);
  const count = a.count ?? 1;
  const spread = ((a.spreadDegrees ?? 0) * Math.PI) / 180;
  const ring = spread >= Math.PI * 2 - 0.01; // 360°: evenly around the monster
  for (let k = 0; k < count; k++) {
    const angle = count === 1 ? aim : ring ? aim + (k / count) * Math.PI * 2 : aim - spread / 2 + (spread * k) / (count - 1);
    const speed = a.speed ?? 400;
    world.enemyShots.push({
      id: world.nextId++,
      pos: add(m.pos, { x: Math.cos(angle) * m.radius, y: Math.sin(angle) * m.radius }),
      vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      radius: a.projRadius ?? 7,
      left: a.maxRange ?? a.range * 1.4,
      hit,
      element: mainElement(hit.base),
    });
  }
  return null;
}

/** Move enemy projectiles; they stop at walls and pass through a rolling player. */
export function stepEnemyShots(world: WorldState, content: SimContent, rng: Rng, events: SimEvent[], dt: number): void {
  const p = world.player;
  const dodging = untouchable(world, content);
  const keep: EnemyShot[] = [];
  for (const s of world.enemyShots) {
    s.pos = add(s.pos, scale(s.vel, dt));
    s.left -= Math.hypot(s.vel.x, s.vel.y) * dt;
    if (s.left <= 0 || !isFloorAt(world.zone, s.pos)) continue;
    if (!dodging && dist(s.pos, p.pos) < s.radius + p.radius) {
      if (hitPlayer(world, content, s.hit, rng, events)) return;
      continue;
    }
    keep.push(s);
  }
  world.enemyShots = keep;
}

/** Count down slams and novas; when one lands, it hits the player if they're inside (and not rolling). */
export function stepTelegraphs(world: WorldState, content: SimContent, rng: Rng, events: SimEvent[], dt: number): void {
  const p = world.player;
  const keep: Telegraph[] = [];
  for (const t of world.telegraphs) {
    t.t += dt;
    if (t.t < t.total) {
      keep.push(t);
      continue;
    }
    events.push({ type: "area", pos: { ...t.pos }, radius: t.radius, angle: 0, arc: Math.PI * 2, element: t.element });
    if (!untouchable(world, content) && dist(t.pos, p.pos) <= t.radius + p.radius * 0.5) {
      if (hitPlayer(world, content, t.hit, rng, events)) return;
    }
  }
  world.telegraphs = keep;
}

/** Ranged monsters back off when you get close and hold position at their preferred range. */
export function rangedStance(m: MonsterState, def: Monster, player: Vec, canSee: boolean): "away" | "hold" | "approach" {
  if (!def.keepDistance || !canSee) return "approach";
  const d = dist(m.pos, player);
  if (d < def.keepDistance * 0.7) return "away";
  if (d <= def.keepDistance * 1.25) return "hold";
  return "approach";
}

export const awayFrom = (from: Vec, player: Vec): Vec => normalize(sub(from, player));
