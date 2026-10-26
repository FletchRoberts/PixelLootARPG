// Zone simulation: one player, sleeping monster packs along a generated linear zone,
// melee combat, and an exit at the end. Pure and headless: state is plain data,
// advanced by step() with fixed dt.

import { Rng } from "./core/rng";
import { add, angleOf, angleDiff, dist, len, normalize, scale, sub, type Vec } from "./core/vec";
import type { Biome, Character, Monster, ZoneGenConfig } from "./data/types";
import { buildFlowField, distAt, nextStep, UNREACHED, type FlowField } from "./zone/flowfield";
import { generateZone } from "./zone/generate";
import { isFloorAt, resolveWalls, tileCenter, tileOf, type Zone } from "./zone/zone";

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

const KNOCKBACK_DECAY = 10; // per second, exponential
const SEPARATION_STRENGTH = 0.5;
const FLOW_MAX_DIST = 40; // tiles; monsters further than this can't path to the player
const EXIT_RADIUS = 0.8; // tiles

export interface SimContent {
  characters: Character[];
  monsters: Monster[];
  zoneGen: ZoneGenConfig;
  biomes: Biome[];
}

export interface Actor {
  id: number;
  defId: string; // character or monster id
  pos: Vec;
  knock: Vec; // knockback velocity, decays
  radius: number;
  life: number;
  maxLife: number;
  facing: number; // radians
}

export interface PlayerState extends Actor {
  attackCooldown: number;
}

export interface MonsterState extends Actor {
  contactCooldown: number;
  packId: number;
  awake: boolean;
}

export interface WorldState {
  tick: number;
  rngState: number;
  zone: Zone;
  status: "playing" | "dead" | "complete";
  player: PlayerState;
  monsters: MonsterState[];
  nextId: number;
  kills: number;
  totalMonsters: number;
}

/** Player intent for one tick. `aim` is a world-space point; `attack` means the button is held. */
export interface PlayerInput {
  move: Vec;
  aim: Vec;
  attack: boolean;
}

export type SimEvent =
  | { type: "swing"; actorId: number; angle: number; arc: number; range: number }
  | { type: "damage"; targetId: number; amount: number; pos: Vec }
  | { type: "death"; actorId: number; pos: Vec }
  | { type: "wake"; packId: number }
  | { type: "player_died" }
  | { type: "zone_complete" };

// Derived, non-serialized cache: flow field toward the player's current tile.
const flowCache = new WeakMap<WorldState, FlowField>();

function lookup<T extends { id: string }>(list: T[], id: string, what: string): T {
  const found = list.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown ${what} id "${id}"`);
  return found;
}

export function createWorld(content: SimContent, seed: number, characterId = "hero"): WorldState {
  const zone = generateZone(content.zoneGen, seed);
  const hero = lookup(content.characters, characterId, "character");
  const world: WorldState = {
    tick: 0,
    rngState: (seed ^ 0x9e3779b9) >>> 0,
    zone,
    status: "playing",
    player: {
      id: 1,
      defId: hero.id,
      pos: { ...zone.start },
      knock: { x: 0, y: 0 },
      radius: hero.radius,
      life: hero.life,
      maxLife: hero.life,
      facing: 0,
      attackCooldown: 0,
    },
    monsters: [],
    nextId: 2,
    kills: 0,
    totalMonsters: 0,
  };
  const rng = new Rng(world.rngState);
  zone.packs.forEach((pack, packId) => {
    for (let i = 0; i < pack.size; i++) spawnMonster(world, content, rng, pack.pos, content.zoneGen.packs.spread, packId);
  });
  world.totalMonsters = world.monsters.length;
  world.rngState = rng.state;
  return world;
}

/** Advance the world by one fixed tick. Mutates `world`, returns events for the client. */
export function step(world: WorldState, content: SimContent, input: PlayerInput, dt = DT): SimEvent[] {
  const events: SimEvent[] = [];
  if (world.status !== "playing") return events;

  const rng = new Rng(world.rngState);
  const hero = lookup(content.characters, world.player.defId, "character");

  updatePlayer(world, hero, input, rng, events, dt);
  updateMonsters(world, content, events, dt);
  if (world.status === "playing" && dist(world.player.pos, world.zone.exit) < EXIT_RADIUS * world.zone.tileSize) {
    world.status = "complete";
    events.push({ type: "zone_complete" });
  }

  world.tick++;
  world.rngState = rng.state;
  return events;
}

/** Flow field toward the player, rebuilt only when the player changes tile. */
export function playerFlowField(world: WorldState): FlowField {
  const { tx, ty } = tileOf(world.zone, world.player.pos);
  let field = flowCache.get(world);
  if (!field || field.tx !== tx || field.ty !== ty) {
    field = buildFlowField(world.zone, tx, ty, FLOW_MAX_DIST);
    flowCache.set(world, field);
  }
  return field;
}

function updatePlayer(world: WorldState, hero: Character, input: PlayerInput, rng: Rng, events: SimEvent[], dt: number): void {
  const p = world.player;
  const move = len(input.move) > 1 ? normalize(input.move) : input.move;
  p.pos = add(p.pos, scale(move, hero.speed * dt));
  applyKnockback(p, dt);
  p.pos = resolveWalls(world.zone, p.pos, p.radius);

  if (dist(input.aim, p.pos) > 1) p.facing = angleOf(sub(input.aim, p.pos));

  p.attackCooldown = Math.max(0, p.attackCooldown - dt);
  if (!input.attack || p.attackCooldown > 0) return;

  const atk = hero.attack;
  const arc = (atk.arcDegrees * Math.PI) / 180;
  p.attackCooldown = atk.cooldown;
  events.push({ type: "swing", actorId: p.id, angle: p.facing, arc, range: p.radius + atk.range });

  for (const m of world.monsters) {
    const toM = sub(m.pos, p.pos);
    const reach = p.radius + atk.range + m.radius;
    if (len(toM) > reach) continue;
    // Monsters overlapping the player are always hit; otherwise they must be inside the arc.
    if (len(toM) > p.radius + m.radius && Math.abs(angleDiff(angleOf(toM), p.facing)) > arc / 2) continue;

    const amount = rng.int(atk.damage[0], atk.damage[1]);
    m.life -= amount;
    m.knock = add(m.knock, scale(normalize(toM), atk.knockback));
    events.push({ type: "damage", targetId: m.id, amount, pos: { ...m.pos } });
    if (!m.awake) wakePack(world, m.packId, events);
  }

  const before = world.monsters.length;
  world.monsters = world.monsters.filter((m) => {
    if (m.life > 0) return true;
    events.push({ type: "death", actorId: m.id, pos: { ...m.pos } });
    return false;
  });
  world.kills += before - world.monsters.length;
}

function updateMonsters(world: WorldState, content: SimContent, events: SimEvent[], dt: number): void {
  const p = world.player;
  const zone = world.zone;
  const field = playerFlowField(world);

  for (const m of world.monsters) {
    const def = lookup(content.monsters, m.defId, "monster");
    const { tx, ty } = tileOf(zone, m.pos);
    const pathDist = distAt(field, zone, tx, ty);

    if (!m.awake) {
      if (pathDist <= def.aggroRange) wakePack(world, m.packId, events);
      else continue;
    }

    const toP = sub(p.pos, m.pos);
    m.facing = angleOf(toP);

    // Close by: head straight for the player. Further: walk downhill on the flow field.
    let target: Vec | null = null;
    if (pathDist <= 1) target = p.pos;
    else if (pathDist !== UNREACHED) {
      const step = nextStep(field, zone, tx, ty);
      if (step) target = tileCenter(zone, step.tx, step.ty);
    }
    if (target) {
      const toT = sub(target, m.pos);
      const gap = target === p.pos ? len(toT) - (p.radius + m.radius) : len(toT);
      if (gap > 0) m.pos = add(m.pos, scale(normalize(toT), Math.min(def.speed * dt, gap)));
    }

    // Separation from other awake monsters so packs spread instead of stacking.
    for (const o of world.monsters) {
      if (o === m || !o.awake) continue;
      const overlap = m.radius + o.radius - dist(m.pos, o.pos);
      if (overlap > 0) m.pos = add(m.pos, scale(normalize(sub(m.pos, o.pos)), overlap * SEPARATION_STRENGTH));
    }

    applyKnockback(m, dt);
    m.pos = resolveWalls(zone, m.pos, m.radius);

    m.contactCooldown = Math.max(0, m.contactCooldown - dt);
    if (m.contactCooldown === 0 && dist(m.pos, p.pos) <= p.radius + m.radius + 2) {
      m.contactCooldown = def.contactCooldown;
      p.life = Math.max(0, p.life - def.damage);
      events.push({ type: "damage", targetId: p.id, amount: def.damage, pos: { ...p.pos } });
      if (p.life === 0) {
        world.status = "dead";
        events.push({ type: "player_died" });
        return;
      }
    }
  }
}

function wakePack(world: WorldState, packId: number, events: SimEvent[]): void {
  let woke = false;
  for (const m of world.monsters) {
    if (m.packId === packId && !m.awake) {
      m.awake = true;
      woke = true;
    }
  }
  if (woke) events.push({ type: "wake", packId });
}

function spawnMonster(world: WorldState, content: SimContent, rng: Rng, center: Vec, spreadTiles: number, packId: number): void {
  const monsterId = rng.weighted(content.zoneGen.monsterPool)?.id;
  if (!monsterId) return;
  const def = lookup(content.monsters, monsterId, "monster");
  const ts = world.zone.tileSize;
  let pos = center;
  for (let i = 0; i < 8; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * spreadTiles * ts;
    const candidate = add(center, { x: Math.cos(a) * r, y: Math.sin(a) * r });
    if (isFloorAt(world.zone, candidate)) {
      pos = candidate;
      break;
    }
  }
  world.monsters.push({
    id: world.nextId++,
    defId: def.id,
    pos: resolveWalls(world.zone, pos, def.radius),
    knock: { x: 0, y: 0 },
    radius: def.radius,
    life: def.life,
    maxLife: def.life,
    facing: rng.range(0, Math.PI * 2),
    contactCooldown: def.contactCooldown / 2,
    packId,
    awake: false,
  });
}

function applyKnockback(a: Actor, dt: number): void {
  a.pos = add(a.pos, scale(a.knock, dt));
  a.knock = scale(a.knock, Math.exp(-KNOCKBACK_DECAY * dt));
}
